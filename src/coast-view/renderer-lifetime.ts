/**
 * Two context-restore lifetimes on the shared renderer that Pixi 8.22 leaves to its user (ASTRA-R3).
 *
 * 1. Graphics program (ASTRA-R3-PIXI-01). Pixi's GlGraphicsAdaptor compiles a new GlProgram on every contextChange,
 *    i.e. on renderer start and on every WebGL context restore. GlProgram names each compile with a page-wide counter
 *    (graphics-1, graphics-2, ...) and files the whole source as a key of createIdFromString's module cache, which
 *    never forgets one: about 4.3 KB more per restore while the yard stays up. The source depends only on the batch
 *    texture count, so this adaptor keeps one program per count for the page, as Pixi already does for its batch,
 *    mesh and tiling programs. Nothing GL-side is kept: GlShaderSystem drops its program data and sync functions on
 *    contextChange and links the kept source again in the new context, reading attribute and uniform locations there.
 *    The Shader and its local uniforms are made new on each change, as in Pixi; the replaced Shader is destroyed
 *    without its program, which also unhooks its bind group from the shared batch-sampler group.
 * 2. Released render targets. A GPU texture slot in Pixi's managed hash becomes a null placeholder when its source is
 *    unloaded, and a context restore nulls every slot at once; a source destroyed afterwards never takes its slot
 *    back. `releaseManagedSlots` drops exactly the placeholders of sources the caller has just destroyed.
 */
import {
  colorBitGl, compileHighShaderGlProgram, extensions, generateTextureBatchBitGl, getBatchSamplersUniformGroup, GlGraphicsAdaptor,
  localUniformBitGl, Matrix, roundPixelsBitGl, Shader, UniformGroup, type Application, type GlProgram, type Renderer,
} from 'pixi.js';

const programs = new Map<number, GlProgram>();
/** The page's graphics program for a batch texture count: Pixi's own bits and name, compiled on first use. */
export function graphicsProgram(maxTextures: number): GlProgram {
  let program = programs.get(maxTextures);
  if (!program) {
    program = compileHighShaderGlProgram({ name: 'graphics', bits: [colorBitGl, generateTextureBatchBitGl(maxTextures), localUniformBitGl, roundPixelsBitGl] });
    programs.set(maxTextures, program);
  }
  return program;
}

export class KeptProgramGraphicsAdaptor extends GlGraphicsAdaptor {
  static extension = GlGraphicsAdaptor.extension;
  contextChange(renderer: Renderer) {
    const maxTextures = renderer.limits.maxBatchableTextures;
    const uniforms = new UniformGroup({
      uColor: { value: new Float32Array([1, 1, 1, 1]), type: 'vec4<f32>' },
      uTransformMatrix: { value: new Matrix(), type: 'mat3x3<f32>' },
      uRound: { value: 0, type: 'f32' },
    });
    const old = this.shader as Shader | undefined;
    this.shader = new Shader({ glProgram: graphicsProgram(maxTextures), resources: { localUniforms: uniforms, batchSamplers: getBatchSamplersUniformGroup(maxTextures) } });
    old?.destroy(false);
  }
  /** The program is the page's, shared by every renderer: release the Shader only. */
  destroy() {
    this.shader?.destroy(false);
    this.shader = null as unknown as Shader;
  }
}
// Same extension type and name as Pixi's adaptor. WebGLRenderer ignores a second adaptor of a name it has, and reads
// the list when a renderer is constructed, so the swap must happen before the first Application.init (this module is
// imported by the host that creates it). Works whether or not the WebGL renderer module has registered yet.
extensions.remove(GlGraphicsAdaptor);
extensions.add(KeptProgramGraphicsAdaptor);

/**
 * Drop the null placeholders that the given released resources left in one of the renderer's managed hashes (for
 * GPU textures, the table named 'glTexture', keyed by TextureSource uid). Only those keys, and only while null: a uid
 * whose slot holds a live resource, other placeholders, and other tables are left alone. Skipped while Pixi's GC is
 * walking the tables. Returns the slots dropped; 0 if Pixi's internals change shape (the tests count placeholders).
 */
export function releaseManagedSlots(app: Application, name: string, uids: readonly number[]): number {
  const gc = (app.renderer as unknown as { gc?: { _running?: boolean; _managedResourceHashes?: { context: Record<string, unknown> & { name?: string }; hash: string }[] } }).gc;
  const list = gc?._managedResourceHashes;
  if (!Array.isArray(list) || gc!._running) return 0;
  const entry = list.find(d => d?.context?.name === name);
  const table = entry?.context[entry.hash] as Record<string, unknown> | undefined;
  if (!table || typeof table !== 'object') return 0;
  let dropped = 0;
  for (const uid of uids) if (table[uid] === null) { delete table[uid]; dropped++; }
  return dropped;
}
