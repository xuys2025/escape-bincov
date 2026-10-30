/**
 * The gunsmith workbench panel (#28 M2-05): one gun at a time, a private preview built by clicks, one confirm. The
 * station yard shows it as a full panel and the old tab page as an overlay; both hand it their HideoutRuntime and
 * route the clicks on `data-gs` controls to `act`. It never writes the save itself: every change goes through the
 * Runtime's GunsmithSession (preview, confirm, reset). The model it draws is gunsmith/bench.ts. Its stylesheet,
 * bench.css, goes into the yard's shadow root (station-view/route.ts) and into the page CSS (scripts/build.mjs).
 */
import * as D from '../domain';
import type { GunsmithSession, HideoutRuntime } from '../hideout-runtime/contract';
import { ATTACHMENTS, FACTORY_MAGS, GUNS, partDef, type GunId } from '../gunsmith/catalog';
import type { Build } from '../gunsmith/compat';
import { buildOf, detachable, gunSize, nodesOf, type GunState } from '../gunsmith/instance';
import { NO_MAG, drawnParts } from '../gunsmith/signature';
import { devicesOn } from '../gunsmith/devices';
import type { GunEdit, GunEditPreview } from '../gunsmith/edit';
import {
    FACTORY_NAMES, POSITION_NAMES, SCORE_ROWS, WHERE_NAMES, benchGuns, benchParts, benchStats, candidateBuild, candidates, capped,
    magEdits, positions, presetEdits, remountEdits, replaceEdits, sourceOf, without, type BenchGun, type BenchNumbers, type BenchScores, type Candidate, type Capped, type Position,
} from '../gunsmith/bench';
import { PRESET_LIMIT, PRESET_NAME_MAX, presetIds, presetOf, type GunPreset } from '../gunsmith/presets';
import { inventoryArtUrl, itemPicture } from '../art/item-images';
import { gunsmithArt } from '../art/gunsmith-hooks';
import { esc } from '../html';

export type BenchCue = 'ok' | 'error' | 'pick' | 'drop';
export interface BenchHost {
    toast(text: string, tone: 'ok' | 'error' | 'info'): void;
    sound(cue: BenchCue): void;
    /** A write failed or another window took the save over: the host's storage dialog takes it from here. */
    storage(): void;
}
/** What `act` asks the host to do next: paint again, or close the panel (nothing is left unconfirmed). */
export type BenchOutcome = 'render' | 'close';

/** Slots drawn above the gun; the rest go below it. */
const TOP = new Set(['stock', 'micro', 'top', 'handguard', 'barrel', 'muzzle']);
/** Long edit lists are rewritten as one removal per root part and one install per part (same candidate) past this. */
const COMPACT_AT = 32;
const CAP_TEXT: Readonly<Record<Capped, [string, string]>> = {
    precise: ['精瞄散布', '最多改善 40%'], spread: ['散布', '最多改善 40%'], kick: ['后坐', '最多改善 40%'],
    raise: ['举枪时间', '不短于原厂的 65%'], reload: ['换弹时间', '不短于原厂的 65%'], range: ['有效距离', '最多增加 25%'], noise: ['枪声范围', '不低于原厂的 40%'],
};

/**
 * The desktop panel's largest box and its side columns by window width (bench.css, the yard's station.css and the old
 * page's overlay use the same numbers). The stage's room for the gun follows from them and the window alone, never
 * from the gun's parts, so the picture's scale and place stay put while parts change (maintainer, 2026-10-27).
 */
const DESK = { w: 1600, h: 780, cols: [[1600, 240, 404], [1200, 200, 360], [0, 184, 300]] as const };
function stageRoom(): { w: number; h: number } {
    const vw = typeof innerWidth === 'number' ? innerWidth : 1280, vh = typeof innerHeight === 'number' ? innerHeight : 720;
    const [, left, right] = DESK.cols.find(c => vw >= c[0])!;
    // The middle column less its padding and the stage's; the panel's height less every fixed row around the picture.
    // #28 M3: the wave-one frames reach 216 px (AK, M4A1 with the long parts), 3x at 1280 and 4x at 1920.
    return { w: Math.min(DESK.w, vw - 24) - left - right - 2 - 42, h: Math.max(96, Math.min(216, Math.min(DESK.h, vh - 24) - 520)) };
}

const b = (label: string, act: string, arg = '', cls = '', extra = '') =>
    `<button type="button" class="${cls}" data-gs="${act}"${arg ? ` data-arg="${esc(arg)}"` : ''} ${extra}>${label}</button>`;
const img = (id: string, cls = '') => `<img class="${cls}" alt="" src="${inventoryArtUrl(id)}">`;
const partName = (id: string) => partDef(id)?.name ?? id;
const kg = (n: number) => `${n.toFixed(2)} kg`;
const signed = (n: number, digits = 0) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)}`;
const ammoName = (gun: GunId) => D.ITEMS[GUNS[gun].stats.ammo]?.name ?? '';
const sizeText = (s: { w: number; h: number }) => `${s.w} × ${s.h}`;
/** Where a gun that no longer fits where it lies goes on confirm (GunEditPreview.relocated, PLAN section 8). */
const INTO: Readonly<Record<'stash' | 'bag' | 'safe', string>> = { stash: '仓库', bag: '背包', safe: '安全箱' };
const relocation = (r: NonNullable<GunEditPreview['relocated']>) => `放到${INTO[r.where]}第 ${r.y + 1} 行第 ${r.x + 1} 列${r.rotated ? '，转向' : ''}`;
/** Before → after when they differ, else the one value. */
const arrow = (a: string, z: string) => a === z ? a : `${a} → <b>${z}</b>`;

export class Workbench {
    private session: GunsmithSession;
    private gunUid: string;
    /** The selected position's key, and whether the list shows that position or every part this gun may take. */
    private at: string | null = null;
    private mode: 'slot' | 'all' = 'slot';
    private unowned = false;
    private detail = false;
    /** The last click that could not be made: the part (or position) and why. */
    private refusal: { name: string; reason: string } | null = null;
    /** Leaving with an unconfirmed preview asks first: to another gun, or closing the panel. */
    private leave: { gun: string | null } | null = null;
    /** Phones (M2-06): the page shown, the pending-changes sheet, and whether the last paint was the phone layout. */
    private page: 'body' | 'parts' | 'stats' = 'body';
    private sheet = false;
    private phone = false;
    /** Presets (M2-07): the one being renamed, the one whose delete waits for a second tap, the one listing its missing parts. */
    private renaming: string | null = null;
    private removing: string | null = null;
    private opened: string | null = null;
    /** A control the host focuses after the next paint, once (the rename field). */
    private focusNext: string | null = null;

    constructor(private rt: HideoutRuntime, gun: string, private host: BenchHost) {
        this.gunUid = gun; this.session = rt.openGunsmith(gun);
    }

    /** The panel closes: its workbench pictures go (ART-SPEC 4.3). */
    dispose() { gunsmithArt?.releaseBench(); }

    /** The gun being edited. */
    get gun() { return this.gunUid; }
    /** A preview with changes is waiting: leaving would drop it. */
    get dirty() { const p = this.session.view().preview; return !!p && p.refusal?.code !== 'unchanged'; }
    /** Close the leave question ("stay") or the pending sheet when one is open; true when something closed (Esc, Back). */
    dismiss(): boolean {
        if (this.leave) { this.leave = null; return true; }
        if (this.sheet) { this.sheet = false; return true; }
        return false;
    }

    /** Ask before closing when a preview waits; true when the panel may close now. */
    requestClose(): boolean {
        if (!this.dirty) return true;
        this.leave = { gun: null }; return false;
    }

    /** The selector of a control to focus after this paint, handed out once. */
    focusOnce(): string | null { const f = this.focusNext; this.focusNext = null; return f; }

    /** `value` is the text field of the control's form (a preset's new name). */
    act(act: string, arg: string, value = ''): BenchOutcome {
        switch (act) {
            case 'preset-save': this.savePreset(); break;
            case 'preset-apply': this.applyPreset(arg); break;
            case 'preset-rename': this.renaming = arg; this.removing = null; this.focusNext = '.gs-rename input'; break;
            case 'preset-name': if (this.result(this.rt.renamePreset(arg, value))) this.renaming = null; break;
            case 'preset-rename-cancel': this.renaming = null; break;
            case 'preset-delete':
                if (this.removing !== arg) { this.removing = arg; this.renaming = null; break; }
                this.removing = null; this.result(this.rt.deletePreset(arg)); break;
            case 'preset-missing': this.opened = this.opened === arg ? null : arg; break;
            case 'gun': if (arg !== this.gunUid) { if (this.dirty) this.leave = { gun: arg }; else this.switchGun(arg); } break;
            // On a phone a position picked on the body page opens the parts page for it.
            case 'pos': this.at = arg; this.mode = 'slot'; this.refusal = null; if (this.phone) this.page = 'parts'; this.host.sound('pick'); break;
            case 'page': if (arg === 'body' || arg === 'parts' || arg === 'stats') this.page = arg; break;
            case 'sheet': this.sheet = !this.sheet; break;
            case 'part': this.choose(arg || null); break;
            case 'all': this.mode = this.mode === 'all' ? 'slot' : 'all'; this.refusal = null; break;
            case 'unowned': this.unowned = !this.unowned; break;
            case 'detail': this.detail = !this.detail; break;
            case 'refuse-ok': this.refusal = null; break;
            case 'cancel': this.session.reset(); this.refusal = null; this.sheet = false; this.host.sound('drop'); break;
            case 'confirm': if (this.confirm()) this.sheet = false; break;
            case 'close': if (this.requestClose()) return 'close'; break;
            case 'leave-stay': this.leave = null; break;
            case 'leave-discard': case 'leave-confirm': {
                const next = this.leave; if (!next) break;
                if (act === 'leave-confirm' && !this.confirm()) { this.leave = null; break; }
                this.session.reset(); this.leave = null;
                if (next.gun === null) return 'close';
                this.switchGun(next.gun); break;
            }
        }
        return 'render';
    }

    /** A Runtime write's answer as a toast and a sound; a failed write goes to the host's storage dialog. True on success. */
    private result(r: { ok: boolean; message?: string; reason?: string }): boolean {
        if (r.ok) { if (r.message) this.host.toast(r.message, 'ok'); this.host.sound('ok'); return true; }
        this.host.toast(r.message ?? '操作未完成。', 'error'); this.host.sound('error');
        if (r.reason === 'storage' || r.reason === 'conflict') this.host.storage();
        return false;
    }

    /** Save the preview (or, without one, the gun as it is) as a preset of this gun type, under the default name. */
    private savePreset() {
        const { gun, after } = this.states();
        if (gun && after) this.result(this.rt.savePreset(gun.id, presetOf(after.parts), null));
    }

    /** Preview a preset on this gun: only when every part can be taken from this gun or the containers. */
    private applyPreset(id: string) {
        const preset = (this.rt.snapshot().profile.gunPresets ?? []).find(p => p.id === id), plan = preset && presetEdits(this.rt.snapshot().profile, this.gunUid, preset.parts);
        if (!preset || !plan) return;
        if (plan.missing.length) { this.refusal = { name: '', reason: `「${preset.name}」还缺 ${plan.missing.length} 件，凑齐了才能应用。` }; this.opened = id; this.host.sound('error'); return; }
        const r = this.preview(plan.edits);
        if (!r) return;
        this.refusal = null;
        if (!r.preview || r.preview.refusal?.code === 'unchanged') this.host.toast('枪上已经是这套配置。', 'info');
        else this.host.sound('pick');
    }

    private switchGun(uid: string) {
        this.session.reset(); this.gunUid = uid; this.session = this.rt.openGunsmith(uid);
        this.at = null; this.mode = 'slot'; this.refusal = null; this.host.sound('pick');
    }

    /** The committed state and, when a preview is shown, the candidate's. */
    private states(): { gun: BenchGun | null; before: GunState | null; after: GunState | null; preview: GunEditPreview | null } {
        const v = this.session.view(), guns = benchGuns(this.rt.snapshot().profile), gun = guns.find(g => g.uid === this.gunUid) ?? null;
        return { gun, before: gun?.state ?? null, after: v.preview?.after ?? gun?.state ?? null, preview: v.preview };
    }

    /**
     * A click on a part (or on the factory card, `id` null; on the no-magazine card, NO_MAG) for the selected position, or
     * for its own position in the all view.
     */
    private choose(id: string | null) {
        const { gun, after, preview } = this.states();
        if (!gun || !after) return;
        const build = buildOf({ id: gun.id, ...after }), list = positions(build);
        let at = list.find(p => p.key === this.at) ?? null;
        if (this.mode === 'all' && id) {
            // Every part in the all view goes to its own slot: an empty position first, else the first one offered.
            const own = list.filter(p => p.slot === ATTACHMENTS[id].mount);
            at = own.find(p => p.open && !p.part) ?? own.find(p => p.open) ?? own[0] ?? null;
            if (at) this.at = at.key;
        }
        if (!at) return;
        if (magCards(gun, at) && (id === null || id === NO_MAG)) { this.chooseMag(gun, build, at, id ? 'empty' : 'factory', preview); return; }
        const name = id ? partName(id) : at.part ? FACTORY_NAMES[at.slot] ?? '不装' : '';
        const refuse = (reason: string) => { this.refusal = { name, reason }; this.host.sound('error'); };
        if (!at.open) { refuse(at.reason ?? ''); return; }
        if (id === null ? !at.part : at.part?.id === id) return;
        const c = id ? candidates(this.rt.snapshot().profile, gun.uid, build, at).find(x => x.id === id) : null;
        if (id && !c) { refuse('不能装在这个位置'); return; }
        if (c?.refusal) { refuse(c.refusal); return; }
        if (c && !c.loose && c.elsewhere) { refuse(`这个配件装在「${c.elsewhere}」上，请先在那把枪上拆下。`); return; }
        const base = this.session.view().edits, edits = [...base, ...replaceEdits(at, id, c?.loose ?? null)];
        const r = this.preview(edits);
        if (!r) { return; }
        this.refusal = null;
        // The replaced part's children move onto the new one where it takes them (a second preview: a part not owned
        // gets its placeholder uid from the first). A child that does not fit stays off, in the stash.
        if (at.part && id && r.preview) {
            const fresh = c?.loose?.uid ?? [...r.preview.installs].reverse().find(i => i.id === id && i.parent === at!.parent && i.slot === at!.slot)?.uid;
            if (fresh) {
                const more = remountEdits(build, at.part, fresh, buildOf({ id: gun.id, parts: r.preview.after.parts }));
                if (more.length) this.preview([...edits, ...more], true);
            }
        }
        this.compact();
        this.host.sound('pick');
    }

    /**
     * The gun's mag position's two factory cards (#28 M4-07): `factory` puts the factory magazine back (the one this
     * preview took out, else a loose one), `empty` takes off what sits there and the factory magazine too.
     */
    private chooseMag(gun: BenchGun, build: Build, at: Position, to: 'empty' | 'factory', preview: GunEditPreview | null) {
        if (to === 'empty' ? at.out : !at.part && !at.out) return;
        const ejected = preview?.removals.find(r => r.id === FACTORY_MAGS[gun.id])?.uid ?? null;
        const plan = magEdits(this.rt.snapshot().profile, gun, build, at, to, ejected);
        if ('reason' in plan) { this.refusal = { name: to === 'empty' ? '' : FACTORY_NAMES.mag!, reason: plan.reason }; this.host.sound('error'); return; }
        if (!this.preview([...this.session.view().edits, ...plan.edits])) return;
        this.refusal = null;
        this.compact();
        this.host.sound('pick');
    }

    /** Preview `edits`; an edit that cannot be made shows its reason (the last preview stays). No change left: no preview. */
    private preview(edits: GunEdit[], quiet = false): { preview: GunEditPreview | undefined } | null {
        const r = this.session.preview(edits);
        if (!r.ok) {
            if (!quiet) { this.refusal = { name: '', reason: r.message }; this.host.sound('error'); }
            if (r.reason === 'storage' || r.reason === 'conflict') this.host.storage();
            return null;
        }
        if (r.preview?.refusal?.code === 'unchanged') this.session.reset();
        return { preview: r.preview };
    }

    /** Past COMPACT_AT edits, the same candidate as one removal per root part and one install per part, when equal. */
    private compact() {
        const v = this.session.view(), gun = v.gun;
        if (!gun || !v.preview || v.edits.length <= COMPACT_AT) return;
        const roots = gun.state.parts.map(p => ({ kind: 'remove', uid: p.uid }) as GunEdit), installs: GunEdit[] = [];
        const rename = new Map<string, string>();
        let unowned = 0;
        const walk = (nodes: GunState['parts'], parent: string | null) => {
            for (const n of nodes) {
                const at = { parent: parent === null ? null : rename.get(parent) ?? parent, slot: n.slot };
                if (n.uid.startsWith('unowned-')) { installs.push({ kind: 'install', id: n.id, at }); rename.set(n.uid, `unowned-${++unowned}`); }
                else installs.push({ kind: 'install', uid: n.uid, at });
            }
            for (const n of nodes) walk(n.children, n.uid);
        };
        walk(v.preview.after.parts, null);
        // The factory magazine (M4-07): taken out after the roots come off, or put back by the item's uid.
        const mag: GunEdit[] = v.preview.after.magOut && !gun.state.magOut ? [{ kind: 'eject' }]
            : v.preview.installs.filter(i => i.id === FACTORY_MAGS[v.preview!.gun.id]).map(i => ({ kind: 'install', uid: i.uid }));
        const before = JSON.stringify(v.preview), edits = [...roots, ...mag, ...installs], r = this.session.preview(edits);
        // Keep the long list unless the short one gives the very same candidate.
        if (!r.ok || JSON.stringify(r.preview) !== before) this.session.preview(v.edits);
    }

    /** Commit the preview: true once written. A stale preview is worked out again on the base as it is now. */
    private confirm(): boolean {
        const v = this.session.view();
        if (!v.preview) return false;
        if (!v.token) {
            if (v.stale) { this.preview(v.edits, true); this.host.toast('仓库或装备已改变，已按现在的库存重新预览。', 'info'); }
            else if (v.preview.refusal) { this.refusal = { name: '', reason: v.preview.refusal.reason }; this.host.sound('error'); }
            return false;
        }
        const r = this.session.confirm(v.token);
        if (r.ok) { this.refusal = null; this.host.toast(r.message ?? '改装已保存。', 'ok'); this.host.sound('ok'); return true; }
        this.host.toast(r.message, 'error'); this.host.sound('error');
        if (r.reason === 'storage' || r.reason === 'conflict') this.host.storage();
        else if (r.reason === 'stale') this.preview(v.edits, true);
        return false;
    }

    // ---------- drawing ----------

    html(opts: { compact: boolean }): string {
        const { gun, before, after, preview } = this.states();
        const guns = benchGuns(this.rt.snapshot().profile);
        if (!gun || !before || !after) {
            return `<div class="gs gs-empty"><p>${guns.length ? '这把枪已不在基地里。从左边另选一把。' : '基地里没有枪械。先在修理铺买一把，或带回行动里找到的枪。'}</p>${guns.length ? `<div class="gs-guns">${this.gunsHtml(guns, null)}</div>` : ''}</div>`;
        }
        const buildBefore = buildOf({ id: gun.id, ...before }), buildAfter = buildOf({ id: gun.id, ...after });
        const list = positions(buildAfter);
        if (!list.some(p => p.key === this.at)) this.at = (list.find(p => p.open) ?? list[0])?.key ?? null;
        const at = list.find(p => p.key === this.at) ?? null;
        const statsBefore = benchStats(buildBefore, devicesOn(before)), statsAfter = benchStats(buildAfter, devicesOn(after));
        const changes = preview ? preview.installs.length + preview.removals.length + preview.moves.length : 0;
        this.phone = opts.compact;
        const mark = this.marks(buildBefore, preview), leave = this.leave ? this.leaveHtml(guns, changes, !!this.session.view().token) : '';
        if (opts.compact) {
            const page = this.page === 'body' ? this.phoneBodyHtml(gun, guns, list, at, preview, changes, mark)
                : this.page === 'parts' ? `<div class="gs-cparts"><nav class="gs-chips" aria-label="位置">${list.map(p => this.posHtml(p, at, mark)).join('')}</nav><section class="gs-cright">${this.partsHtml(gun, buildAfter, at, list, statsAfter.scores)}</section></div>`
                : this.statsHtml(statsBefore, statsAfter, buildAfter);
            const tabs = ([['body', '枪身', ''], ['parts', '配件', at?.name ?? ''], ['stats', '属性', changes ? '●' : '']] as const)
                .map(([id, name, sub]) => b(`${name}${sub ? ` <small>${sub}</small>` : ''}`, 'page', id, this.page === id ? 'on' : '', `role="tab" aria-selected="${this.page === id}"`)).join('');
            return `<div class="gs gs-compact">
  <header class="gs-ctop"><b>改枪</b><nav class="gs-tabs" role="tablist" aria-label="工作台分页">${tabs}</nav>${b('关闭', 'close', '', 'gs-x')}</header>
  <div class="gs-cpage gs-p-${this.page}">${page}</div>
  ${this.phoneFootHtml(preview)}
  ${this.sheet ? `<div class="gs-veil"><section class="gs-dialog gs-sheet" role="dialog" aria-modal="true" aria-label="待改明细"><h3>待改明细</h3>${this.pendingHtml(preview)}${this.sumHtml(gun, preview)}<div class="gs-dacts">${b('收起', 'sheet', '', 'primary')}</div></section></div>` : ''}
  ${leave}
</div>`;
        }
        return `<div class="gs">
  <section class="gs-col gs-left" aria-label="枪械与预设"><h3><i>01</i>枪械 <small>点一把枪开始改</small></h3><div class="gs-guns">${this.gunsHtml(guns, changes)}</div>${this.presetsHtml(gun, preview)}</section>
  <section class="gs-col gs-mid" aria-label="枪身与属性">${this.bodyHtml(gun, list, at, preview, changes, mark)}${this.statsHtml(statsBefore, statsAfter, buildAfter)}</section>
  <section class="gs-col gs-right" aria-label="配件">${this.partsHtml(gun, buildAfter, at, list, statsAfter.scores)}</section>
  <footer class="gs-foot">${this.chipsHtml(preview)}${this.effectsHtml(gun, preview)}${this.actsHtml(preview)}</footer>
  ${leave}
</div>`;
    }

    /** Which positions the preview changes: a part going on or moving, or a part coming off where it sat. */
    private marks(before: Build, preview: GunEditPreview | null): (p: Position) => boolean {
        const changed = new Set([...(preview?.installs ?? []), ...(preview?.moves ?? [])].map(i => i.uid));
        const emptied = new Set((preview?.removals ?? []).map(r => { const q = before.parts.find(x => x.uid === r.uid); return q ? `${q.parent ?? 'gun'}/${q.slot}` : ''; }));
        // The factory magazine going out or back in (M4-07) changes the gun's own mag position.
        if (preview && !!preview.before.magOut !== !!preview.after.magOut) emptied.add('gun/mag');
        return p => p.part ? changed.has(p.part.uid) : emptied.has(`${p.parent ?? 'gun'}/${p.slot}`);
    }

    /**
     * The presets of this gun's type (M2-07): save the preview (or the gun as it is), and each preset with what applying
     * it would take; one missing a part lists it and cannot be applied. Rename edits the name in place; delete asks once.
     */
    private presetsHtml(gun: BenchGun, preview: GunEditPreview | null) {
        const profile = this.rt.snapshot().profile, all = profile.gunPresets ?? [], mine = all.filter(p => p.gun === gun.id);
        const same = (p: GunPreset, parts: GunState['parts']) => JSON.stringify(p.parts) === JSON.stringify(presetOf(parts));
        const cards = mine.map(p => {
            const plan = presetEdits(profile, gun.uid, p.parts), missing = plan?.missing ?? [], count = presetIds(p.parts).length;
            const state = same(p, gun.state.parts) ? '装着这套' : preview && same(p, (preview.after).parts) ? '预览中' : missing.length ? '' : '可以应用';
            const lack = missing.length ? b(`缺 ${missing.length} 件${this.opened === p.id ? ' ▴' : ' ▾'}`, 'preset-missing', p.id, 'gs-lack', `aria-expanded="${this.opened === p.id}"`) : '';
            const list = missing.length && this.opened === p.id ? `<ul class="gs-missing">${missing.map(id => `<li>${esc(partName(id))} · ${esc(sourceText(id, profile))}</li>`).join('')}</ul>` : '';
            const name = this.renaming === p.id
                ? `<form class="gs-rename" data-gs-form><input name="gs-name" aria-label="预设名" maxlength="${PRESET_NAME_MAX}" value="${esc(p.name)}"><button type="submit" data-gs="preset-name" data-arg="${esc(p.id)}">保存</button>${b('取消', 'preset-rename-cancel', p.id)}</form>`
                : `<b>${esc(p.name)}</b>`;
            const acts = this.renaming === p.id ? '' : `<div class="gs-pacts">${b('应用', 'preset-apply', p.id, 'mini', missing.length || state === '装着这套' ? 'disabled' : '')}${b('改名', 'preset-rename', p.id, 'mini')}${b(this.removing === p.id ? '确认删除' : '删除', 'preset-delete', p.id, `mini${this.removing === p.id ? ' danger' : ''}`)}</div>`;
            return `<div class="gs-preset${state === '装着这套' ? ' on' : ''}">${name}<small>${count} 件配件${state ? ` · ${state}` : ''}</small>${lack}${list}${acts}</div>`;
        }).join('');
        const full = mine.length >= PRESET_LIMIT, label = preview ? '把当前预览存成预设' : '把现在的配置存成预设';
        return `<section class="gs-presets" aria-label="预设"><h3><i>02</i>预设 <small>${mine.length} / ${PRESET_LIMIT} 套</small></h3><p class="gs-dim gs-phint">只记配件种类。</p>${b(full ? `已存满 ${PRESET_LIMIT} 套` : label, 'preset-save', '', 'gs-wide', full ? 'disabled' : '')}${cards || '<p class="gs-dim gs-none">还没有预设。存下来的配置可以在同型号的枪上一键放进预览。</p>'}</section>`;
    }

    /** One position on the gun body (and a chip on the phone's parts page). */
    private posHtml(p: Position, at: Position | null, mark: (p: Position) => boolean) {
        const label = p.part ? partName(p.part.id) : p.out ? '没装' : p.open ? FACTORY_NAMES[p.slot] ?? '空' : '未开放', m = mark(p);
        const cls = ['gs-pos', p.key === at?.key ? 'on' : '', p.open ? '' : 'closed', p.part ? '' : 'empty', m ? 'changed' : ''].filter(Boolean).join(' ');
        return `<button type="button" class="${cls}" data-gs="pos" data-arg="${esc(p.key)}" aria-pressed="${p.key === at?.key}" title="${esc(p.place)}${p.reason ? ` · ${esc(p.reason)}` : ''}"><small>${p.name}</small><b>${esc(label)}</b>${p.open ? '' : `<span>${esc(p.reason ?? '')}</span>`}${m ? '<i>改</i>' : ''}</button>`;
    }

    /**
     * The phone's picture of the gun as the preview builds it (#28 M2-10): Sol's workbench picture at the largest whole
     * scale that fits (ART-SPEC 2: 1 to 3 times on phones), else the inventory picture.
     */
    private phoneArt(gun: BenchGun, parts: readonly GunState['parts'][number][]) {
        const pic = gunsmithArt?.bench(gun.id, parts) ?? null;
        if (!pic) return img(gun.id);
        const vw = typeof innerWidth === 'number' ? innerWidth : 1280, vh = typeof innerHeight === 'number' ? innerHeight : 720;
        const room = [vh > vw ? vw - 60 : (vw - 60) * .4, 80];
        const scale = Math.max(1, Math.floor(Math.min(room[0] / pic.w, room[1] / pic.h)));
        return `<img class="gs-bench-art" alt="" src="${pic.url}" width="${pic.w * scale}" height="${pic.h * scale}" style="width:${pic.w * scale}px;height:${pic.h * scale}px">`;
    }

    /**
     * The desktop stage's picture (maintainer, 2026-10-27): the gun's frame (every build it can take) at the largest
     * whole scale that fits the room, centred, and the picture placed by its receiver inside it. A new part then changes
     * only its own pixels; the rest of the gun does not move or rescale.
     */
    private stageHtml(gun: BenchGun, parts: readonly GunState['parts'][number][]) {
        const room = stageRoom(), pic = gunsmithArt?.bench(gun.id, parts) ?? null, f = gunsmithArt?.benchFrame(gun.id) ?? null;
        if (!pic || !f) return `<div class="gs-art" style="height:${room.h}px">${img(gun.id)}</div>`;
        const k = Math.max(1, Math.floor(Math.min(room.w / f.w, room.h / f.h)));
        const at = `left:${(-f.x - pic.origin[0]) * k}px;top:${(-f.y - pic.origin[1]) * k}px;width:${pic.w * k}px;height:${pic.h * k}px`;
        return `<div class="gs-art" style="height:${room.h}px"><div class="gs-frame" style="width:${f.w * k}px;height:${f.h * k}px"><img class="gs-bench-art" alt="" src="${pic.url}" width="${pic.w * k}" height="${pic.h * k}" style="${at}"></div></div>`;
    }

    /** The gun's line under its name: where it is, the magazine, the weight and the footprint, before → after. */
    private infoText(gun: BenchGun, preview: GunEditPreview | null) {
        const mag = gun.magazine ? ` · 弹匣 ${gun.magazine.ammo} / ${arrow(String(preview?.capacity.before ?? gun.magazine.capacity), String(preview?.capacity.after ?? gun.magazine.capacity))} 发${ammoName(gun.id)}` : '';
        const weight = arrow(kg(preview?.weight.before ?? gun.weight), kg(preview?.weight.after ?? gun.weight));
        const size = preview ? arrow(sizeText(preview.size.before), sizeText(preview.size.after)) : sizeText(gunSize({ id: gun.id, ...gun.state }));
        return `${WHERE_NAMES[gun.where]}${mag} · 枪重 ${weight} · 占格 ${size}`;
    }

    /** The phone's body page: the guns in a row, the gun and its positions, the info line. */
    private phoneBodyHtml(gun: BenchGun, guns: BenchGun[], list: Position[], at: Position | null, preview: GunEditPreview | null, changes: number, mark: (p: Position) => boolean) {
        const chips = guns.map(g => {
            const on = g.uid === this.gunUid;
            return `<button type="button" class="gs-gun${on ? ' on' : ''}" data-gs="gun" data-arg="${esc(g.uid)}" aria-pressed="${on}"><b>${esc(g.name)}</b><em>${WHERE_NAMES[g.where]}${on && changes ? ` · ${changes} 处改动` : ''}</em></button>`;
        }).join('');
        return `<div class="gs-guns gs-crow">${chips}</div><div class="gs-cbody"><div class="gs-art">${this.phoneArt(gun, drawnParts(preview?.after ?? gun.state))}</div><div class="gs-cpos">${list.map(p => this.posHtml(p, at, mark)).join('')}</div></div><p class="gs-cinfo">${this.infoText(gun, preview)}</p>${this.presetsHtml(gun, preview)}`;
    }

    /** The phone's fixed bar: what the preview changes (opens the sheet), why it cannot be confirmed, cancel and confirm. */
    private phoneFootHtml(p: GunEditPreview | null) {
        const n = p?.unloaded ? p.unloaded.normal + p.unloaded.relief : 0;
        const summary = p ? `待装 ${p.installs.length} · 待卸 ${p.removals.length}${n ? ` · 卸出 ${n} 发` : ''}${p.relocated ? ' · 换位置' : ''}` : '还没有改动';
        const token = !!this.session.view().token, why = p?.refusal && p.refusal.code !== 'unchanged' ? `<p class="gs-block" role="alert">${esc(p.refusal.reason)}</p>` : '';
        return `<footer class="gs-cfoot">${b(`<span>${summary}</span><small>明细</small>`, 'sheet', '', 'gs-sumbtn', p ? 'aria-haspopup="dialog"' : 'disabled')}${b('取消', 'cancel', '', '', p ? '' : 'disabled')}${b('确认', 'confirm', '', 'primary', token ? '' : 'disabled')}${why}</footer>`;
    }

    private gunsHtml(guns: BenchGun[], changes: number | null) {
        return guns.map(g => {
            const on = g.uid === this.gunUid, mag = g.magazine ? `弹匣 ${g.magazine.ammo}/${g.magazine.capacity} · ` : '';
            return `<button type="button" class="gs-gun${on ? ' on' : ''}" data-gs="gun" data-arg="${esc(g.uid)}" aria-pressed="${on}"><img alt="" src="${itemPicture({ id: g.id, gun: g.state }, 999, 999).url}"><b>${esc(g.name)}</b><em>${WHERE_NAMES[g.where]}${g.relief ? ' · 救济' : ''}</em><span>${mag}配件 ${g.parts} · ${kg(g.weight)}</span>${on && changes ? `<i title="有 ${changes} 处改动没确认">改 ${changes}</i>` : ''}</button>`;
        }).join('');
    }

    private bodyHtml(gun: BenchGun, list: Position[], at: Position | null, preview: GunEditPreview | null, changes: number, mark: (p: Position) => boolean) {
        const box = (p: Position) => this.posHtml(p, at, mark);
        const top = list.filter(p => TOP.has(p.slot)), bottom = list.filter(p => !TOP.has(p.slot));
        const state = changes ? `<span class="gs-badge">预览中 · ${changes} 处改动没确认</span>` : '<span class="gs-dim">和枪上一致</span>';
        return `<header class="gs-head"><div><h3>${esc(gun.name)}</h3><p>${this.infoText(gun, preview)}</p></div><span class="gs-state">${state}</span></header>
<div class="gs-stage"><div class="gs-row">${top.map(box).join('')}</div>${this.stageHtml(gun, drawnParts(preview?.after ?? gun.state))}<div class="gs-row">${bottom.map(box).join('')}</div></div>`;
    }

    private statsHtml(a: { scores: BenchScores; numbers: BenchNumbers }, z: { scores: BenchScores; numbers: BenchNumbers }, build: Build) {
        const rows = SCORE_ROWS.map(row => {
            const x = a.scores[row.key], y = z.scores[row.key], d = y - x, unit = row.key === 'kg', same = Math.abs(d) < (unit ? .005 : .5);
            const good = row.up ? d > 0 : d < 0, pct = (v: number) => unit ? Math.min(100, v / 6 * 100) : v;
            const lo = Math.min(pct(x), pct(y)), hi = Math.max(pct(x), pct(y));
            const bar = `<span class="gs-bar" aria-hidden="true"><i style="width:${lo}%"></i>${same ? '' : `<i class="${good ? 'up' : 'down'}" style="left:${lo}%;width:${hi - lo}%"></i>`}</span>`;
            const val = unit ? `${y.toFixed(2)} kg` : String(y);
            const dv = same ? '<span class="gs-dim">—</span>' : `<span class="${good ? 'up' : 'down'}">${signed(d, unit ? 2 : 0)}</span>`;
            return `<div class="gs-stat"><div class="gs-srow"><span>${row.name}</span><b class="gs-val${same ? '' : good ? ' up' : ' down'}">${val}</b>${bar}<span class="gs-dv">${dv}</span></div>${this.detail ? `<p class="gs-sdet">${detailText(row.key, a.numbers, z.numbers)}</p>` : ''}</div>`;
        }).join('');
        const notes = capped(build).filter(c => c !== 'spread' || !capped(build).includes('precise')).map(c => `<li class="cap">${CAP_TEXT[c][0]}已到配件护栏：${CAP_TEXT[c][1]}，多装的这部分不再起作用。</li>`);
        if (z.numbers.devices) notes.push('<li>激光、灯光开着时更容易被前方的敌人看见，这一项不算在声音暴露里。</li>');
        return `<section class="gs-stats" aria-label="属性对比"><h3>属性对比 <small>数字是预览后的值，亮色是变化 · 重量和声音暴露越低越好</small>${b(this.detail ? '收起数值' : '看具体数值', 'detail', '', 'mini', `aria-pressed="${this.detail}"`)}</h3><div class="gs-sgrid">${rows}</div>${notes.length ? `<ul class="gs-notes">${notes.join('')}</ul>` : ''}</section>`;
    }

    private partsHtml(gun: BenchGun, build: Build, at: Position | null, list: Position[], now: BenchScores) {
        const profile = this.rt.snapshot().profile;
        const owned = (c: Candidate) => !!c.loose || c.current || !!c.elsewhere;
        let cards: string, head: string;
        if (this.mode === 'all') {
            const all = benchParts().filter(id => { const g = ATTACHMENTS[id].guns; return !g || g.includes(gun.id); });
            const rows = all.map(id => {
                const spot = list.find(p => p.slot === ATTACHMENTS[id].mount && p.open && !p.part) ?? list.find(p => p.slot === ATTACHMENTS[id].mount) ?? null;
                const c = spot ? candidates(profile, gun.uid, build, spot).find(x => x.id === id) ?? null : null;
                return { id, spot, c };
            }).filter(r => this.unowned || !r.c || owned(r.c));
            head = `<h3>全部配件 <small>能装在${esc(gun.name)}上的样板配件</small></h3>`;
            cards = rows.map(r => r.c && r.spot ? this.cardHtml(r.c, r.spot, build, now, true) : `<div class="gs-card refused"><b>${esc(partName(r.id))}</b><span class="gs-why">这把枪上没有能装它的位置</span></div>`).join('');
        } else if (at) {
            const factory = FACTORY_NAMES[at.slot];
            const shown = at.part ? `现在：${esc(partName(at.part.id))}` : at.out ? '现在：没装弹匣，不能开火' : `现在：${factory ?? '空'}`;
            head = `<h3>${at.name} <small>${esc(at.place)}</small></h3><p>${shown}${at.open ? '' : ` · ${esc(at.reason ?? '')}`}</p>`;
            const factoryCard = !at.open ? '' : magCards(gun, at) ? this.magFactoryHtml(gun, at, build, now) + this.noMagHtml(at, build, now) : this.factoryHtml(at, build, now);
            const shownList = candidates(profile, gun.uid, build, at).filter(c => this.unowned || owned(c));
            cards = factoryCard + (shownList.length ? shownList.map(c => this.cardHtml(c, at, build, now, false)).join('')
                : `<p class="gs-dim gs-none">${candidates(profile, gun.uid, build, at).length ? '仓库里没有能装在这里的配件。可以打开「显示未拥有的」先看看效果。' : '暂时没有能装在这里的配件。'}</p>`);
        } else { head = '<h3>配件</h3>'; cards = ''; }
        const missing = at && this.mode === 'slot' ? candidates(profile, gun.uid, build, at).filter(c => !owned(c)).length
            : benchParts().filter(id => { const g = ATTACHMENTS[id].guns; return (!g || g.includes(gun.id)) && !build.parts.some(p => p.id === id)
                && ![profile.stash, profile.bag, profile.safe].some(inv => inv.items.some(i => i.id === id)); }).length;
        const tools = `<div class="gs-tools">${b(`显示未拥有的${missing ? `（${missing}）` : ''}`, 'unowned', '', 'mini', `aria-pressed="${this.unowned}"`)}${b(this.mode === 'all' ? '回到位置' : '全部配件', 'all', '', 'mini', `aria-pressed="${this.mode === 'all'}"`)}</div>`;
        const refusal = this.refusal ? `<div class="gs-refuse" role="alert"><p>${this.refusal.name ? `不能装「${esc(this.refusal.name)}」：` : ''}${esc(this.refusal.reason)}</p>${b('知道了', 'refuse-ok', '', 'mini')}</div>` : '';
        return `<header class="gs-rhead">${head}${tools}</header>${refusal}<div class="gs-list">${cards}</div>`;
    }

    /** The card that puts the factory part back (or leaves a rail empty): taking off what sits there. */
    private factoryHtml(at: Position, build: Build, now: BenchScores) {
        const name = FACTORY_NAMES[at.slot] ?? '不装', current = !at.part;
        const delta = current ? '' : deltaText(now, benchStats(without(build, at)).scores);
        const off = at.part ? build.parts.filter(p => p.parent === at.part!.uid).map(p => partName(p.id)) : [];
        const effect = current ? '<span class="gs-delta gs-dim">现在用的就是它</span>'
            : off.length ? `<span class="gs-why" title="${esc(off.join('、'))}会一起拆下">换回后${esc(off.join('、'))}会一起拆下</span>` : `<span class="gs-delta">换回后：${delta || '属性不变'}</span>`;
        return `<button type="button" class="gs-card factory${current ? ' current' : ''}" data-gs="part" data-arg="" aria-pressed="${current}"><span class="gs-fac">${FACTORY_NAMES[at.slot] ? '原厂' : '空'}</span><div><span class="gs-l1"><b>${name}</b>${current ? '<em>装着</em>' : ''}<small>${FACTORY_NAMES[at.slot] ? '不占仓库' : ''}</small></span><span class="gs-desc">${FACTORY_NAMES[at.slot] ? '原厂部件，一直在枪上。' : '这个位置空着。'}</span>${effect}</div></button>`;
    }

    /**
     * The factory magazine's card on a gun whose magazine comes off (M4-07): on the gun, put back (the one taken out, or
     * a loose one), or missing from the base.
     */
    private magFactoryHtml(gun: BenchGun, at: Position, build: Build, now: BenchScores) {
        const current = !at.part && !at.out, id = FACTORY_MAGS[gun.id]!, profile = this.rt.snapshot().profile;
        const loose = [profile.stash, profile.bag, profile.safe].reduce((n, inv) => n + inv.items.filter(i => i.id === id).length, 0);
        const back = build.magOut ? { ...build, parts: without(build, at).parts, magOut: undefined } : without(build, at);
        const effect = current ? '<span class="gs-delta gs-dim">现在用的就是它</span>'
            : build.magOut && !loose && !this.session.view().preview?.removals.some(r => r.id === id) ? '<span class="gs-why">基地里没有能装回的原厂弹匣</span>'
            : `<span class="gs-delta">换回后：${deltaText(now, benchStats(back).scores) || '属性不变'}</span>`;
        const where = build.magOut ? `已拆下${loose ? ` · 基地里 ${loose} 个` : ''}` : '不占仓库';
        return `<button type="button" class="gs-card factory${current ? ' current' : ''}" data-gs="part" data-arg="" aria-pressed="${current}"><span class="gs-fac">原厂</span><div><span class="gs-l1"><b>原厂弹匣</b>${current ? '<em>装着</em>' : ''}<small>${where}</small></span><span class="gs-desc">原厂部件，可以拆下。拆下后放进仓库，只能装回同型号的枪。</span>${effect}</div></button>`;
    }

    /** The no-magazine card (M4-07): the gun a row shorter and lighter, unable to fire until a magazine goes in. */
    private noMagHtml(at: Position, build: Build, now: BenchScores) {
        const current = at.out, empty = { ...without(build, at), magOut: true } as const;
        const effect = current ? '<span class="gs-delta gs-dim">现在就没装弹匣</span>' : `<span class="gs-delta">拆下后：${deltaText(now, benchStats(empty).scores) || '属性不变'}</span>`;
        return `<button type="button" class="gs-card factory${current ? ' current' : ''}" data-gs="part" data-arg="${NO_MAG}" aria-pressed="${current}"><span class="gs-fac">空</span><div><span class="gs-l1"><b>不装弹匣</b>${current ? '<em>空着</em>' : ''}<small>枪少占一行</small></span><span class="gs-desc">拆下的弹匣放进仓库。没装弹匣的枪不能开火，也不能出发。</span>${effect}</div></button>`;
    }

    private cardHtml(c: Candidate, at: Position, build: Build, now: BenchScores, all: boolean) {
        const def = D.ITEMS[c.id], brand = ATTACHMENTS[c.id].brand;
        const where = c.current ? '' : c.loose ? `${{ stash: '仓库', bag: '背包', safe: '安全箱' }[c.loose.from]} ${c.count} 件` : c.elsewhere ? `装在 ${esc(c.elsewhere)} 上` : `未拥有 · ${esc(c.source)}`;
        const onGun = !!at.part && this.committed().has(at.part.uid);
        let effect = `<span class="gs-delta gs-dim">${onGun ? '现在装的就是它' : '已放进预览，按「确认」装上'}</span>`;
        if (c.refusal) effect = `<span class="gs-why" title="${esc(c.refusal)}">不能装：${esc(c.refusal)}</span>`;
        else if (!c.current) {
            const cand = candidateBuild(build, at, c.id);
            effect = `<span class="gs-delta">换上后：${cand ? deltaText(now, benchStats(cand).scores) || '属性不变' : '属性不变'}</span>`;
        }
        const cls = ['gs-card', c.current ? 'current' : '', c.refusal ? 'refused' : '', !c.loose && !c.current ? 'missing' : ''].filter(Boolean).join(' ');
        // In the preview, not yet on the gun: "previewed"; on the gun as committed: "installed".
        const tag = c.current ? `<em>${onGun ? '装着' : '预览中'}</em>` : '';
        const desc = `${brandName(brand)} · ${def?.description ?? ''}`;
        return `<button type="button" class="${cls}" data-gs="part" data-arg="${c.id}" aria-pressed="${c.current}">${img(c.id, 'gs-ico')}<div><span class="gs-l1"><b>${esc(c.name)}</b>${tag}<small>${all ? `${at.name} · ` : ''}${where}</small></span><span class="gs-desc" title="${esc(desc)}">${esc(desc)}</span>${effect}</div></button>`;
    }

    /** The uids of the parts on the gun as committed. */
    private committed(): Set<string> {
        const g = this.session.view().gun;
        return new Set(g ? nodesOf(g.state.parts).map(n => n.uid) : []);
    }

    /** The phone's sheet: the parts going on and coming off (and moving), as two lists. */
    private pendingHtml(p: GunEditPreview | null) {
        const name = (uid: string | null) => pendingName(p, uid);
        const adds = (p?.installs ?? []).map(i => `<li class="${i.from ? '' : 'missing'}"><i>+</i><b>${esc(partName(i.id))}</b><small>${POSITION_NAMES[i.slot]} · ${i.from ? `从${{ stash: '仓库', bag: '背包', safe: '安全箱' }[i.from]}取` : '未拥有，确认前要先买到'}</small></li>`).join('');
        const rems = (p?.removals ?? []).map(r => `<li class="${r.with ? 'cascade' : ''}"><i>−</i><b>${esc(partName(r.id))}</b><small>${r.with ? `随${esc(name(r.with))}拆下 · ` : `${POSITION_NAMES[partDef(r.id).mount]} · `}放回仓库</small></li>`).join('');
        const moves = (p?.moves ?? []).map(m => `<li><i>↔</i><b>${esc(partName(m.id))}</b><small>换到${esc(name(m.parent) || '枪身')}上</small></li>`).join('');
        return `<div class="gs-pend"><h4>待装 <small>${p?.installs.length ?? 0} 件</small></h4><ul>${adds || '<li class="none">没有要装的配件</li>'}</ul></div>
<div class="gs-pend"><h4>待卸 <small>${p?.removals.length ?? 0} 件</small></h4><ul>${rems || '<li class="none">没有要拆的配件</li>'}${moves}</ul></div>`;
    }

    /**
     * The desktop bar's left part (maintainer, 2026-10-27: the bar never scrolls): every pending change as a whole item,
     * flowing over at most three lines. The notes leave out the usual case (taken from the stash, put back in it); the
     * whole list shows on hover, and in full under the parts it changes.
     */
    private chipsHtml(p: GunEditPreview | null) {
        const n = p ? p.installs.length + p.removals.length + p.moves.length : 0;
        if (!p || !n) return '<div class="gs-pend"><h4>待改 <small>0 处</small></h4><p class="gs-pline none">还没有改动。点枪身上的位置挑配件，点配件只改预览。</p></div>';
        const from = { stash: '', bag: ' · 从背包取', safe: ' · 从安全箱取' };
        const items = [
            ...p.installs.map(i => `<span class="${i.from ? '' : 'missing'}"><i>+</i><b>${esc(partName(i.id))}</b><small>${POSITION_NAMES[i.slot]}${i.from ? from[i.from] : ' · 未拥有'}</small></span>`),
            ...p.removals.map(r => `<span class="${r.with ? 'cascade' : ''}"><i>−</i><b>${esc(partName(r.id))}</b><small>${r.with ? `随${esc(pendingName(p, r.with))}拆下` : POSITION_NAMES[partDef(r.id).mount]}</small></span>`),
            ...p.moves.map(m => `<span><i>↔</i><b>${esc(partName(m.id))}</b><small>换到${esc(pendingName(p, m.parent) || '枪身')}上</small></span>`),
        ].join('');
        return `<div class="gs-pend"><h4>待改 <small>${n} 处</small></h4><p class="gs-pline" title="${items.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}">${items}</p></div>`;
    }

    /**
     * The desktop bar's middle: only what the header line does not show (the weight, magazine and footprint before →
     * after are there): why the preview cannot be confirmed, and the rounds an equipped gun unloads.
     */
    private effectsHtml(gun: BenchGun, p: GunEditPreview | null) {
        const why = p?.refusal && p.refusal.code !== 'unchanged' ? `<span class="gs-block" role="alert">${esc(p.refusal.reason)}</span>` : '';
        const unload = p?.unloaded && gun.where === 'equipment' ? `<span>卸出 ${p.unloaded.normal + p.unloaded.relief} 发${esc(D.ITEMS[p.unloaded.ammo]?.name ?? '')}，放进仓库${p.unloaded.relief ? `（其中救济 ${p.unloaded.relief} 发）` : ''}</span>` : '';
        const move = p?.relocated && !why ? `<span>枪身变大，原位放不下：确认后${relocation(p.relocated)}</span>` : '';
        const note = p ? '确认后一次保存；取消回到枪上的配置。' : '改动只在预览里，确认前不会动到枪和仓库。';
        return `<p class="gs-fx">${why}${move}${unload}${why || move || unload ? '' : `<span class="gs-dim">${note}</span>`}</p>`;
    }

    /** Weight, magazine, unloaded rounds (equipped guns) and footprint, before → after. */
    private sumHtml(gun: BenchGun, p: GunEditPreview | null) {
        const unload = p?.unloaded ? `卸出 ${p.unloaded.normal + p.unloaded.relief} 发${esc(D.ITEMS[p.unloaded.ammo]?.name ?? '')}，放进仓库${p.unloaded.relief ? `（其中救济 ${p.unloaded.relief} 发）` : ''}` : '不用卸弹';
        return p ? `<dl class="gs-sum"><div><dt>枪重</dt><dd>${arrow(kg(p.weight.before), kg(p.weight.after))}</dd></div><div><dt>弹匣</dt><dd>${arrow(`${p.capacity.before} 发`, `${p.capacity.after} 发`)}</dd></div>${gun.where === 'equipment' ? `<div><dt>子弹</dt><dd>${unload}</dd></div>` : ''}<div><dt>占格</dt><dd>${arrow(sizeText(p.size.before), sizeText(p.size.after))}</dd></div>${p.relocated ? `<div><dt>位置</dt><dd>原位放不下，${relocation(p.relocated)}</dd></div>` : ''}</dl>` : '<p class="gs-dim gs-sum">还没有改动。</p>';
    }

    /** The desktop bar's cancel and confirm, side by side. */
    private actsHtml(p: GunEditPreview | null) {
        const token = !!this.session.view().token;
        return `<div class="gs-acts">${b('取消', 'cancel', '', '', p ? '' : 'disabled')}${b('确认', 'confirm', '', 'primary', token ? '' : 'disabled')}</div>`;
    }

    private leaveHtml(guns: BenchGun[], changes: number, token: boolean) {
        const next = this.leave?.gun ? guns.find(g => g.uid === this.leave!.gun) : null;
        return `<div class="gs-veil"><section class="gs-dialog" role="dialog" aria-modal="true" aria-label="有改动没确认"><h3>有 ${changes} 处改动没确认</h3><p>${next ? `换到「${esc(next.name)}」之前，先处理这把枪的改动。` : '关闭工作台之前，先处理这把枪的改动。'}</p>
<div class="gs-dacts">${b(next ? '确认改动后换' : '确认改动后关闭', 'leave-confirm', '', 'primary', token ? '' : 'disabled')}${b('放弃改动', 'leave-discard')}${b('留下继续改', 'leave-stay')}</div>${token ? '' : '<p class="gs-dim">这些改动现在还不能确认，只能放弃或留下继续改。</p>'}</section></div>`;
    }
}

const sourceText = (id: string, save: D.SaveDataV1) => sourceOf(id, save);
/** The name of a part in a preview, after the edit or else before it. */
function pendingName(p: GunEditPreview | null, uid: string | null) { const n = p && (findPart(p.after, uid) ?? findPart(p.before, uid)); return n ? partName(n.id) : ''; }
const brandName = (brand: string) => ({ beidi: '北堤', yanwan: '盐湾', binji: '滨机', factory: '原厂' } as Record<string, string>)[brand] ?? '';
/** The gun's own mag position on a gun whose factory magazine comes off (M4-07): it shows the two factory cards. */
const magCards = (gun: Pick<BenchGun, 'id'>, at: Position) => detachable(gun.id) && at.parent === null && at.slot === 'mag' && at.open;
function findPart(state: GunState, uid: string | null) {
    const walk = (nodes: GunState['parts']): GunState['parts'][number] | null => { for (const n of nodes) { if (n.uid === uid) return n; const c = walk(n.children); if (c) return c; } return null; };
    return uid === null ? null : walk(state.parts);
}
/** The scores that change from `a` to `z`, up to three and the weight: "精度 +6 · 操控 −8 · 重量 +0.35 kg". */
function deltaText(a: BenchScores, z: BenchScores): string {
    const out: string[] = [];
    for (const row of SCORE_ROWS) {
        if (row.key === 'kg') continue;
        const d = z[row.key] - a[row.key];
        if (Math.abs(d) >= 1 && out.length < 3) out.push(`${row.name} <span class="${(row.up ? d > 0 : d < 0) ? 'up' : 'down'}">${signed(d)}</span>`);
    }
    const dk = z.kg - a.kg;
    if (Math.abs(dk) >= .005) out.push(`重量 <span class="${dk < 0 ? 'up' : 'down'}">${signed(dk, 2)} kg</span>`);
    return out.join(' · ');
}
/** The numbers behind one comparison row, before → after. */
function detailText(key: keyof BenchScores, a: BenchNumbers, z: BenchNumbers): string {
    const n = (x: number, d: number, u = '') => `${x.toFixed(d)}${u}`, ar = (x: number, y: number, d: number, u = '') => arrow(n(x, d, u), n(y, d, u));
    switch (key) {
        case 'fire': return `单发伤害 ${z.damage}${z.pellets > 1 ? ` × ${z.pellets} 颗弹丸` : ''} · 射击间隔 ${n(z.cooldown, 2)} 秒。普通配件不改火力。`;
        case 'acc': return `精瞄散布 ${ar(a.aimed, z.aimed, 2, '°')} · 腰射散布 ${ar(a.hip, z.hip, 2, '°')} · 有效距离 ${ar(a.range, z.range, 0)}${z.laserHip !== null ? ` · 激光开着时腰射 ${n(z.laserHip, 2)}°` : ''}`;
        case 'ctl': return `每发后坐 ${ar(a.kick, z.kick, 2, '°')} · 每发散布增长 ${ar(a.bloom, z.bloom, 2, '°')} · 停火后恢复 ${ar(a.recover, z.recover, 1)}`;
        case 'hdl': return `举枪到精瞄 ${ar(a.raise, z.raise, 2, ' 秒')} · 晃动 ${ar(a.sway, z.sway, 2)}`;
        case 'feed': return `弹匣 ${ar(a.magazine, z.magazine, 0, ' 发')} · 换弹 ${ar(a.reload, z.reload, 2, ' 秒')}`;
        case 'kg': return '整枪重量，不含子弹。';
        case 'noise': return `敌人听到枪声的范围 ${ar(a.noise, z.noise, 0)}${z.suppressed ? ' · 已消音' : ''}`;
    }
}
