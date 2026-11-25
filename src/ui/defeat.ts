/**
 * The defeat screen (#271): a lost run gets a full screen, not a card. The run map behind it,
 * the Bloom closing over your camp as your swarm dims out; why the run ended; the run in numbers;
 * and the way back in: a new run on the same difficulty, the same seed again, or the campaign.
 */
import { defeatStats, lossCause } from '../campaign/defeat';
import type { RunState, TurnResult } from '../campaign/run';
import { RUN_SCREEN } from './cover';
import { EVENT_TEXT, KIND_GLYPH, drawMap, homeCam, type Cam } from './campaign';
import { MapFx, bloomGapView } from './runmapfx';
import { el, esc } from './dom';

/** The animation's beats, in seconds: a held breath, the Bloom rolling in, the swarm going out. */
const HOLD = 0.6;
const ROLL = 2.6;
const FADE_FROM = 1.6;
const FADE = 1.6;
/** How far past the camp the Bloom's edge goes, in map units, so it is buried, not grazed. */
const BURY = 60;

export interface DefeatHandlers {
  /** a new run on the same difficulty (none for a playtest) */
  again?: () => void;
  /** this run's seed again (none for a playtest) */
  sameSeed?: () => void;
  hub: () => void;
}

export function defeatScreen(run: RunState, res: TurnResult, h: DefeatHandlers, left = false): HTMLDivElement {
  const events = res.checkpoint === 'restored' ? [] : res.events;
  const m = el(`
    <div class="${RUN_SCREEN} defeat">
      <canvas class="defeat-map"></canvas>
      <div class="card defeat-card">
        <div class="eyebrow">${esc(run.seedText)} · turn ${run.turn}</div>
        <h1 class="result">Defeat</h1>
        ${left ? '<p class="hint">You left mid-battle: it counts as a retreat.</p>' : ''}
        <p class="defeat-cause">${lossCause(run)}</p>
        ${events.length ? `<ul class="brood-events">${events.map((e) => `<li><span class="glyph">${KIND_GLYPH[e.kind]}</span> <b>${esc(e.name)}</b> ${EVENT_TEXT[e.what](e)}</li>`).join('')}</ul>` : ''}
        <table class="stats defeat-stats">${defeatStats(run)
          .map((s) => `<tr><th>${s.label}</th><td>${esc(s.value)}</td></tr>`)
          .join('')}</table>
        <div class="row end">
          <button data-a="hub">Campaign</button>
          ${h.sameSeed ? '<button data-a="seed">Same seed again</button>' : ''}
          ${h.again ? '<button class="primary" data-a="again">New run</button>' : ''}
        </div>
      </div>
    </div>`);
  m.querySelector('[data-a=hub]')!.addEventListener('click', h.hub);
  if (h.sameSeed) m.querySelector('[data-a=seed]')!.addEventListener('click', h.sameSeed);
  if (h.again) m.querySelector('[data-a=again]')!.addEventListener('click', h.again);
  animate(m.querySelector('canvas')!, run);
  return m;
}

/** The Bloom closing over your camp, drawn until the screen leaves the page. */
function animate(c: HTMLCanvasElement, run: RunState): void {
  // A copy of the Bloom whose front we push forward: the run's own stays as it ended.
  const bloom = { ...run.bloom, seeds: run.bloom.seeds };
  const view: RunState = { ...run, bloom };
  const camp = run.nodes[run.at];
  const from = run.bloom.front;
  const push = reach(bloom, camp, run.bloom.time);
  const fx = new MapFx(run);
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cam: Cam | null = null;
  let t0 = -1;
  let burst = false;
  const frame = (now: number) => {
    if (!c.isConnected && t0 >= 0) return;
    if (t0 < 0) t0 = now;
    const time = now / 1000;
    const t = still ? HOLD + ROLL + FADE_FROM + FADE : (now - t0) / 1000;
    const k = Math.max(0, Math.min(1, (t - HOLD) / ROLL));
    const e = k * k * (3 - 2 * k);
    bloom.front = from + push * e;
    const fade = Math.max(0, Math.min(1, (t - FADE_FROM) / FADE));
    fx.tick(time);
    if (!burst && e > 0.85) {
      burst = true;
      fx.spores.burst(camp.x, camp.y, 48);
    }
    if (c.clientWidth > 0 && c.clientHeight > 0) {
      const first = !cam;
      cam ??= { ...homeCam(run, c.clientWidth, c.clientHeight), cx: camp.x, cy: camp.y };
      const v = drawMap(c, view, { bloomT: run.bloom.time, selected: null, hover: null, time, fresh: new Set(), freshT: 1, cam: { ...cam }, fx, fade });
      if (first) {
        // Your camp where the card isn't: left of it. On an upright phone the map is a band above the card (CSS).
        if (c.clientWidth >= 600) cam.cx = camp.x + (0.2 * c.width) / v.s;
        drawMap(c, view, { bloomT: run.bloom.time, selected: null, hover: null, time, fresh: new Set(), freshT: 1, cam: { ...cam }, fx, fade });
      }
    }
    // With reduced motion, the last frame only; the Bloom's slow wobble is left out too.
    if (!still || t0 === now) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  if (still) {
    const redraw = () => (c.isConnected ? requestAnimationFrame(frame) : removeEventListener('resize', redraw));
    addEventListener('resize', redraw);
  }
}

/** How far the Bloom's front must move to bury the camp (capped: some seeds bend the edge away). */
function reach(bloom: RunState['bloom'], at: { x: number; y: number }, time: number): number {
  const from = bloom.front;
  let push = 0;
  for (; push < 2000; push += 10) {
    bloom.front = from + push;
    if (bloomGapView(bloom, at.x, at.y, time) < -BURY) break;
  }
  bloom.front = from;
  return push;
}
