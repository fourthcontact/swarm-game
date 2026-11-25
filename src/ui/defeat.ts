/**
 * The defeat screen (#271): a lost run gets a full screen, not a card. The run map behind it,
 * the Bloom closing over your camp as your swarm dims out; why the run ended; the run in numbers;
 * and the way back in: a new run on the same difficulty, the same seed again, or the campaign.
 */
import { defeatChoices, defeatStats, lossCause } from '../campaign/defeat';
import type { RunDifficulty, RunState, TurnResult } from '../campaign/run';
import { randomSeed } from '../game/matchSetup';
import { RUN_SCREEN } from './cover';
import { EVENT_TEXT, KIND_GLYPH, drawMap, homeCam, lordText, type Cam } from './campaign';
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
  /** pick a swarm and start a run on `seed`, with `difficulty` chosen */
  start: (seed: string, difficulty: RunDifficulty) => void;
  hub: () => void;
}

export function defeatScreen(run: RunState, res: TurnResult, h: DefeatHandlers, left = false): HTMLDivElement {
  const events = res.checkpoint === 'restored' ? [] : res.events;
  const choices = defeatChoices(run);
  const m = el(`
    <div class="${RUN_SCREEN} defeat">
      <canvas class="defeat-map"></canvas>
      <div class="card defeat-card">
        <div class="eyebrow">${esc(run.seedText)} · turn ${run.turn}</div>
        <h1 class="result">Defeat</h1>
        ${left ? '<p class="hint">You left mid-battle: it counts as a retreat.</p>' : ''}
        <p class="defeat-cause">${lossCause(run)}</p>
        ${lordText(run, res)}
        ${events.length ? `<ul class="brood-events">${events.map((e) => `<li><span class="glyph">${KIND_GLYPH[e.kind]}</span> <b>${esc(e.name)}</b> ${EVENT_TEXT[e.what](e)}</li>`).join('')}</ul>` : ''}
        <table class="stats defeat-stats">${defeatStats(run)
          .map((s) => `<tr><th>${s.label}</th><td>${esc(s.value)}</td></tr>`)
          .join('')}</table>
        ${res.biomass ? `<p class="hint">The last battle salvaged +${res.biomass} biomass.</p>` : ''}
        <div class="row end">
          ${choices.map((o) => `<button data-a="${o.a}"${o.primary ? ' class="primary"' : ''}>${o.label}</button>`).join('')}
        </div>
      </div>
    </div>`);
  for (const o of choices) {
    m.querySelector(`[data-a=${o.a}]`)!.addEventListener('click', () => (o.difficulty ? h.start(o.seed ?? randomSeed(), o.difficulty) : h.hub()));
  }
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
  let size = '';
  let t0 = -1;
  let burst = false;
  const draw = (time: number, fade: number) => drawMap(c, view, { bloomT: run.bloom.time, selected: null, hover: null, time, fresh: new Set(), freshT: 1, cam: { ...cam! }, fx, fade });
  // One loop for the life of the screen: it stops once the screen leaves the page.
  const frame = (now: number) => {
    if (!c.isConnected && t0 >= 0) return;
    requestAnimationFrame(frame);
    if (t0 < 0) t0 = now;
    // A resize or a turned phone moves the card, so the camera is worked out again.
    const sized = `${c.clientWidth}x${c.clientHeight}`;
    const resized = sized !== size;
    size = sized;
    if (resized) cam = null;
    // With reduced motion: the last frame, still (no Bloom wobble or spores), redrawn only on a resize.
    if (still && !resized) return;
    const time = still ? 0 : now / 1000;
    const t = still ? HOLD + ROLL + FADE_FROM + FADE : (now - t0) / 1000;
    const k = Math.max(0, Math.min(1, (t - HOLD) / ROLL));
    const e = k * k * (3 - 2 * k);
    bloom.front = from + push * e;
    const fade = Math.max(0, Math.min(1, (t - FADE_FROM) / FADE));
    fx.tick(time);
    if (!still && !burst && e > 0.85) {
      burst = true;
      fx.spores.burst(camp.x, camp.y, 48);
    }
    if (c.clientWidth <= 0 || c.clientHeight <= 0) return;
    if (!cam) {
      cam = { ...homeCam(run, c.clientWidth, c.clientHeight), cx: camp.x, cy: camp.y };
      // Your camp where the card isn't: left of it. On an upright phone the map is a band above the card (CSS).
      const v = draw(time, fade);
      if (c.clientWidth >= 600) cam.cx = camp.x + (0.2 * c.width) / v.s;
    }
    draw(time, fade);
  };
  requestAnimationFrame(frame);
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
