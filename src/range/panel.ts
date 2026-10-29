/**
 * The 试枪场 panel: weapon and moving-target switches, a reset, hits per target, the live aim numbers of the last
 * published batch and a way back to the title. A plain DOM overlay in its own shadow root, outside the raid host's
 * root: the host reads mouse and touch input from its canvas only, so presses here never pull the trigger or turn the
 * aim. A pressed button gives its focus back, so the keyboard keeps playing and Space or Enter cannot press it again.
 */
import css from './range.css';
import { esc } from '../html';
import type { PublishedView } from '../raid-runtime/contract';
import type { CoastSampleHost } from '../coast-view/host';
import { MOVER, RANGE_BUILDS, RANGE_WEAPONS, TARGETS, type RangeWeapon, type ShootingRange, type RangeBuild } from './raid';
import { partsSignature } from '../gunsmith/signature';
import * as D from '../domain';
/** Each build's signature, as the view publishes it for the gun in hand. */
const BUILD_SIGS = Object.fromEntries((Object.keys(RANGE_BUILDS) as RangeBuild[]).map(b => [b, partsSignature(RANGE_BUILDS[b]())])) as Record<RangeBuild, string>;

/** A button's label: the item's short name, as the inventory shows it. */
const label = (w: RangeWeapon) => w === 'knife' ? '匕首' : D.ITEMS[w].short || D.ITEMS[w].name;
/** Aim angles are radians (contract AimView); the panel shows degrees and shares as percentages. */
const degrees = (radians: number) => `${(radians * 180 / Math.PI).toFixed(1)} 度`;
const percent = (share: number) => `${Math.round(share * 100)}%`;
const text = (el: Element, value: string) => { if (el.textContent !== value) el.textContent = value; };
const press = (el: Element, on: boolean) => { const v = String(on); if (el.getAttribute('aria-pressed') !== v) el.setAttribute('aria-pressed', v); };

const markup = (exit: string) => `<section class="rg" aria-label="试枪场">
<header class="rg-head"><b>试枪场</b><button type="button" data-act="fold" aria-expanded="true">隐藏</button></header>
<div class="rg-body">
<p class="rg-note">内存存档 · 不保存进度</p>
<div class="rg-label">枪械</div>
<div class="rg-grid four">${RANGE_WEAPONS.map(w => `<button type="button" data-gun="${w}" aria-pressed="false" title="${esc(w === 'knife' ? '水手匕首' : D.ITEMS[w].name)}">${esc(label(w))}</button>`).join('')}</div>
<div class="rg-grid two rg-gap"><button type="button" data-build="light" aria-pressed="false" title="轻托、短护木加斜握把、开放红点、快换匣、轻握把">M4A1 轻快</button><button type="button" data-build="steady" aria-pressed="false" title="稳定托、精确枪管组、制退器、短护木加短前握、远距镜、稳握把">M4A1 稳定</button></div>
<div class="rg-grid two rg-gap"><button type="button" data-act="mover" aria-pressed="true">移动目标：开</button><button type="button" data-act="reset">重新开始</button></div>
<div class="rg-grid rg-gap"><button type="button" data-act="feel" class="rg-full" aria-pressed="true">打击感：新版</button></div>
<table><thead><tr><th>目标</th><th>命中</th></tr></thead>
<tbody>${[...TARGETS.map(t => [t.id, `${t.tiles} 格`]), [MOVER.id, '移动目标']].map(([id, label]) => `<tr><td>${label}</td><td data-hits="${id}">0</td></tr>`).join('')}</tbody>
<tfoot><tr><td>射击</td><td data-shots>0</td></tr></tfoot></table>
<p class="rg-tip" data-tip hidden>霰弹每颗弹丸计一次命中</p>
<dl class="rg-aim"><dt>模式</dt><dd data-aim="mode"></dd><dt>散布</dt><dd data-aim="cone"></dd><dt>枪口</dt><dd data-aim="drift"></dd><dt>精瞄</dt><dd data-aim="raise"></dd><dt>摇动</dt><dd data-aim="sway"></dd><dt>连射</dt><dd data-aim="bloom"></dd></dl>
<a class="rg-exit" href="${esc(exit)}">返回标题</a>
</div>
</section>`;

export class RangePanel {
    private readonly el = document.createElement('div');
    private readonly box: HTMLElement;
    private readonly q: <T extends Element = HTMLElement>(selector: string) => T;
    /** The last placement written (top and height limit). */
    private at = '';

    /** `exit` is the address of the title page (this page without the range flag). */
    constructor(private readonly range: ShootingRange, private readonly host: CoastSampleHost, exit: string) {
        const root = this.el.attachShadow({ mode: 'open' });
        root.innerHTML = `<style>${css}</style>${markup(exit)}`;
        this.q = <T extends Element>(selector: string) => root.querySelector(selector) as T;
        this.box = this.q('.rg');
        root.addEventListener('click', e => this.press(e));
        this.el.className = 'range-panel';
        document.body.appendChild(this.el);
        // Phones start folded: the panel covers the player's side of the street.
        this.fold(document.documentElement.classList.contains('mobile'));
    }

    private press(e: Event) {
        const button = (e.target as Element).closest<HTMLButtonElement>('button');
        if (!button) return;
        const { gun, act, build } = button.dataset;
        if (gun) this.range.arm(gun as RangeWeapon);
        else if (build) this.range.arm('mb4a1', build as RangeBuild);
        else if (act === 'mover') this.range.setMoving(!this.range.moving);
        else if (act === 'reset') this.range.reset();
        // A/B for #75's hit-feel rounds (ViewOptions.feel): the next shot already sounds the other way.
        else if (act === 'feel') this.host.opts.feel = this.host.opts.feel === 'classic' ? 'enhanced' : 'classic';
        else if (act === 'fold') this.fold(!this.box.classList.contains('folded'));
        button.blur();
    }
    private fold(folded: boolean) {
        this.box.classList.toggle('folded', folded);
        const button = this.q('[data-act="fold"]');
        text(button, folded ? '打开' : '隐藏');
        button.setAttribute('aria-expanded', String(!folded));
    }
    /**
     * Below the HUD's status card and above its key list, measured every frame: both change size with the screen, and
     * the status card grows a line once the HUD fills it in or a drain shows. Read before the host writes this frame's
     * HUD, so the layout is still clean.
     */
    private place() {
        const status = document.querySelector('.coast-sample .cs-status')?.getBoundingClientRect();
        const keys = document.querySelector('.coast-sample .cs-keys')?.getBoundingClientRect();
        const top = Math.round((status?.bottom ?? 0) + 8), bottom = keys?.height ? keys.top - 8 : innerHeight - 8;
        const at = `${top}px|${Math.max(40, Math.floor(bottom - top))}px`;
        if (at !== this.at) {
            this.at = at;
            const [t, max] = at.split('|');
            this.box.style.setProperty('--rg-top', t);
            this.box.style.setProperty('--rg-max', max);
        }
        if (this.el.classList.contains('touch') !== this.host.input.touch) this.el.classList.toggle('touch', this.host.input.touch);
    }

    /** Once per display frame with the batch the host is about to show. Hidden while a raid panel (pause, bag, map) is open. */
    update(b: PublishedView) {
        const hidden = this.host.panel !== null;
        if (this.box.hidden !== hidden) this.box.hidden = hidden;
        if (hidden) return;
        this.place();
        const { weapon: w, aim } = b.frame.hud, stats = this.range.stats;
        // The factory M4A1 and its two builds are told apart by the configuration the view draws (#28 M2-15).
        const sig = b.frame.player.gun?.sig ?? '';
        for (const id of RANGE_WEAPONS) press(this.q(`[data-gun="${id}"]`), w.id === id && (id !== 'mb4a1' || sig === ''));
        for (const build of Object.keys(RANGE_BUILDS) as RangeBuild[]) press(this.q(`[data-build="${build}"]`), w.id === 'mb4a1' && sig === BUILD_SIGS[build]);
        const mover = this.q('[data-act="mover"]');
        press(mover, this.range.moving); text(mover, this.range.moving ? '移动目标：开' : '移动目标：关');
        const feel = this.q('[data-act="feel"]'), classic = this.host.opts.feel === 'classic';
        press(feel, !classic); text(feel, classic ? '打击感：旧版' : '打击感：新版');
        for (const [id, hits] of Object.entries(stats.hits)) text(this.q(`[data-hits="${id}"]`), String(hits));
        text(this.q('[data-shots]'), String(stats.shots));
        this.q('[data-tip]').hidden = !((D.WEAPONS[w.id]?.pellets ?? 1) > 1);
        text(this.q('[data-aim="mode"]'), !w.magSize ? '近战' : aim.mode === 'auto' ? '全自动' : '单发');
        text(this.q('[data-aim="cone"]'), degrees(aim.cone));
        text(this.q('[data-aim="drift"]'), degrees(aim.drift));
        text(this.q('[data-aim="raise"]'), percent(aim.raise));
        text(this.q('[data-aim="sway"]'), percent(aim.sway));
        text(this.q('[data-aim="bloom"]'), percent(aim.bloom));
    }
}
