/**
 * The debrief after a run battle (#272). What changed comes in order of importance (campaign/debrief.ts),
 * one line at a time, each with its sound, and the biomass gained counts up. A tap or a key shows the
 * rest at once; with reduced motion everything shows at once. A lost run gets the defeat screen instead.
 */
import type { AudioEngine } from '../audio/engine';
import { mountCreatures } from '../art/creature';
import { rivals } from '../campaign/battle';
import { debriefLines, debriefTitle, type DebriefLine, type DebriefSound } from '../campaign/debrief';
import type { RunNode, RunState, TurnResult } from '../campaign/run';
import { rivalStrip } from './battlepeek';
import { EVENT_TEXT, KIND_GLYPH, broods, lordItem } from './campaign';
import { retryNote } from './costs';
import { countUp } from './countUp';
import { RUN_SCREEN } from './cover';
import { el, esc } from './dom';

/** When the first line shows, and the gap between lines, in ms. */
const FIRST = 350;
const GAP = 280;

export interface DebriefHandlers {
  next: () => void;
  hub: () => void;
}

/** One revealed step: a line, or all the minor events together. */
interface Step {
  html: string;
  sound?: DebriefSound;
  biomass?: number;
}

function lineHtml(run: RunState, node: RunNode, l: DebriefLine): string {
  const e = l.event;
  switch (l.kind) {
    case 'warlord':
      return `<li class="deb-line">${lordItem(run, l.warlord!)}</li>`;
    case 'biomass':
      return `<li class="deb-line debrief-biomass"><b>+<span class="gain">0</span></b> ${l.biomass!.label}</li>`;
    case 'sealed':
      return `<li class="deb-line retry-note">${retryNote(run, node.id)}</li>`;
    case 'checkpoint':
      return '<li class="deb-line hint">⚑ Checkpoint reached: if your swarm falls after this, the run restarts here once.</li>';
    default:
      return `<li class="deb-line ${l.kind}"><span class="glyph">${KIND_GLYPH[e!.kind]}</span> <b>${esc(e!.name)}</b> ${EVENT_TEXT[e!.what](e!)}</li>`;
  }
}

function steps(run: RunState, node: RunNode, lines: DebriefLine[]): Step[] {
  const out: Step[] = lines.filter((l) => l.kind !== 'minor').map((l) => ({ html: lineHtml(run, node, l), sound: l.sound, biomass: l.biomass?.amount }));
  // Grew, held, recovered: one quieter block at the end, shown together.
  const minor = lines.filter((l) => l.kind === 'minor');
  if (minor.length) out.push({ html: `<li class="deb-line minor"><ul class="brood-events minor">${minor.map((l) => lineHtml(run, node, l).replace('deb-line ', '')).join('')}</ul></li>` });
  return out;
}

const SOUND: Record<DebriefSound, (s: AudioEngine) => void> = {
  domainBroken: (s) => s.domainBroken(),
  broodLost: (s) => s.broodLost(),
  broodWounded: (s) => s.broodWounded(),
  broodRescued: (s) => s.broodRescued(),
  biomassGained: (s) => s.biomassGained(),
  checkpointReached: (s) => s.checkpointReached(),
};

export function runDebrief(run: RunState, node: RunNode, won: boolean, res: TurnResult, h: DebriefHandlers, sfx: AudioEngine, left = false): HTMLDivElement {
  const over = run.status !== 'active';
  const restored = res.checkpoint === 'restored';
  const { title, text } = debriefTitle(run, node, won, res);
  // None when the run ended on the map, where you stand (#253).
  const foes = node.kind === 'start' || (!won && node.id === run.at) ? [] : rivals(run, node.id);
  const list = steps(run, node, debriefLines(run, node, won, res));
  const m = el(`
    <div class="${RUN_SCREEN}">
      <div class="card brief run-debrief ${run.status === 'won' || (won && !over) ? 'win' : 'lose'}">
        <div class="eyebrow">${esc(run.seedText)} · turn ${run.turn}</div>
        <h2>${title}</h2>
        ${left ? '<p class="hint">You left mid-battle: it counts as a retreat.</p>' : ''}
        <p>${text}</p>
        ${foes.length && !restored ? rivalStrip(foes, true, won ? 'beaten' : '') : ''}
        <div class="deb-body">
          ${list.length ? `<ul class="brood-events deb-lines">${list.map((s) => s.html).join('')}</ul>` : ''}
          <p class="deb-total">${broods(run)} <span class="hint"><b class="total">${run.biomass}</b> biomass</span></p>
        </div>
        <div class="row end">
          ${over ? '<button class="primary" data-a="hub">Campaign</button>' : '<button class="primary" data-a="next">Continue</button>'}
        </div>
      </div>
    </div>`);
  mountCreatures(m, foes.map((r) => r.creature), 48);
  m.querySelector('[data-a=next]')?.addEventListener('click', h.next);
  m.querySelector('[data-a=hub]')?.addEventListener('click', h.hub);
  reveal(m, list, run.biomass, sfx);
  return m;
}

/** Show the lines one by one, each with its sound; a tap or key shows the rest. */
function reveal(m: HTMLElement, list: Step[], biomass: number, sfx: AudioEngine): void {
  const items = [...m.querySelectorAll<HTMLElement>('.deb-lines > .deb-line')];
  const total = m.querySelector('.deb-total .total') as HTMLElement;
  const gained = list.find((s) => s.biomass)?.biomass ?? 0;
  const finishers: (() => void)[] = [];
  const show = (i: number, sound: boolean) => {
    const node = items[i];
    node.classList.add('in');
    const s = list[i];
    if (sound && s.sound) SOUND[s.sound](sfx);
    if (s.biomass) {
      const gain = node.querySelector('.gain') as HTMLElement;
      if (sound) {
        finishers.push(countUp(gain, 0, s.biomass, 700), countUp(total, biomass - s.biomass, biomass, 700));
      } else {
        gain.textContent = String(s.biomass);
        total.textContent = String(biomass);
      }
    }
  };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    list.forEach((_, i) => show(i, true));
    finishers.forEach((f) => f());
    return;
  }
  if (gained) total.textContent = String(biomass - gained);
  let at = 0;
  let timer = 0;
  const done = () => {
    clearTimeout(timer);
    document.removeEventListener('keydown', key, true);
    m.removeEventListener('pointerdown', skip);
  };
  const tick = () => {
    if (!m.isConnected) return done();
    if (at >= items.length) return done();
    show(at++, true);
    timer = window.setTimeout(tick, GAP);
  };
  // The rest at once, with no more sounds; a count already running jumps to its end.
  function skip(): void {
    done();
    while (at < items.length) show(at++, false);
    finishers.forEach((f) => f());
  }
  // Modifiers and the app's own keys (M mutes, ` shows perf) don't count as "show the rest".
  const key = (e: KeyboardEvent) => {
    if (['Shift', 'Control', 'Alt', 'Meta', 'm', 'M', '`'].includes(e.key) || e.metaKey || e.ctrlKey || e.altKey) return;
    skip();
  };
  m.addEventListener('pointerdown', skip);
  document.addEventListener('keydown', key, true);
  timer = window.setTimeout(tick, FIRST);
}
