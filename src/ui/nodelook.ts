/**
 * How a run map node looks in each state (#287): one table that the map (drawMap in ui/campaign.ts)
 * and the key in the `?` card both draw from, so the key can't drift from the map.
 */
import { moves, reachable, retriesLeft, sealedMoves, type RunState } from '../campaign/run';
import { BLOOM, glyph } from './runmapfx';

export type NodeState = 'here' | 'open' | 'taken' | 'plain' | 'missed' | 'reopen' | 'sealed' | 'swallowed' | 'heart';

/** Every state, in the key's order. */
export const NODE_STATES: readonly NodeState[] = ['here', 'open', 'taken', 'plain', 'missed', 'reopen', 'sealed', 'swallowed', 'heart'];

/** The key's line for each state. */
export const NODE_KEY: Record<NodeState, string> = {
  here: 'Your swarm and its camp',
  open: 'Open: fight here, or march through',
  taken: 'Taken: yours to march through',
  plain: 'Not in reach yet',
  missed: 'Passed by: out of reach for good',
  reopen: 'Sealed: pay biomass to fight again',
  sealed: 'Sealed for good',
  swallowed: 'Lost to the Bloom',
  heart: "The Bloom's heart: your goal",
};

/** A lost battle you can still pay to reopen (#253): amber, like a warning. */
export const SEALED = '#e0a040';
/** A lost battle sealed for good (#287): grey, done with. */
export const SEALED_SHUT = '#8a90a8';
/** The rescue badge (#287): not the biomass lime, which it used to share. */
export const RESCUE = '#ffffff';

/** What the map already knows about the run, built once per frame. */
export interface NodeCtx {
  open: Set<number>;
  /** null on thumbnails and finished runs: nothing counts as passed by */
  reach: Set<number> | null;
  sealed: Set<number>;
  reopen: Set<number>;
  swallowed: (id: number) => boolean;
}

export function nodeCtx(run: RunState, o: { thumb?: boolean; fresh?: Set<number>; freshT?: number } = {}): NodeCtx {
  const fresh = o.fresh ?? new Set<number>(), freshT = o.freshT ?? 1;
  return {
    open: new Set(moves(run)),
    reach: o.thumb ? null : reachable(run),
    sealed: new Set(run.sealed ?? []),
    // Next to you with a retry left: the card offers Fight again. Otherwise it's sealed for good.
    reopen: new Set(retriesLeft(run) > 0 ? sealedMoves(run) : []),
    // A node being swallowed right now still shows as it was until the ring closes.
    swallowed: (id) => run.swallowed.includes(id) && (!fresh.has(id) || freshT >= 1),
  };
}

export function nodeState(run: RunState, id: number, c: NodeCtx): NodeState {
  if (id === run.at) return 'here';
  if (c.swallowed(id)) return 'swallowed';
  if (c.sealed.has(id)) return c.reopen.has(id) ? 'reopen' : 'sealed';
  if (c.open.has(id)) return 'open';
  if (run.visited.includes(id)) return 'taken';
  if (id === run.heart) return 'heart';
  // Paths and nodes you passed by (#95) go dim: only what you can still reach stays bright.
  if (c.reach && !c.reach.has(id) && !run.swallowed.includes(id)) return 'missed';
  return 'plain';
}

/** A glow behind the node: alpha is `a + pulse * p`. */
export interface Halo { color: string; a: number; p: number; scale: number }

export interface NodeLook {
  /** drawn first, at full alpha, under `fill` */
  base: string | null;
  fill: string;
  fillAlpha: number;
  stroke: string;
  /** outline width, in pixel units */
  width: number;
  /** outline dash, in pixel units */
  dash: readonly number[] | null;
  halo: Halo | null;
  /** a veil of the night over the node and its icon */
  veil: boolean;
  lock: 'open' | 'shut' | null;
  /** the icon's colour */
  ink: string;
}

const DARK = '#141a33';
const INK = 'rgba(230, 234, 255, 0.85)';

/**
 * The look for a state. `taken` marks your own ground when the state doesn't say it (an open
 * node you'd march through), `heart` the Bloom's heart in any state; `selected` and `hover` add their own cues on top.
 */
export function nodeLook(state: NodeState, me: string, o: { taken?: boolean; selected?: boolean; hover?: boolean; heart?: boolean } = {}): NodeLook {
  const taken = state === 'taken' || (state === 'open' && !!o.taken);
  const L: NodeLook = { base: null, fill: DARK, fillAlpha: 1, stroke: 'rgba(150, 170, 255, 0.5)', width: 1.5, dash: null, halo: null, veil: false, lock: null, ink: INK };
  // Taken ground is a ring in your colour, hollow; only your own node is solid (#287).
  if (taken) Object.assign(L, { base: DARK, fill: me, fillAlpha: 0.25, stroke: me, width: 2, ink: me });
  switch (state) {
    case 'here':
      Object.assign(L, { fill: me, stroke: '#ffffff', width: 2.5, ink: '#06070f', halo: { color: me, a: 0.25, p: 0.15, scale: 1.9 } });
      break;
    case 'open':
      Object.assign(L, { stroke: me, width: 2.5, halo: { color: '#ffffff', a: 0.1, p: 0.12, scale: 1.9 } });
      break;
    case 'missed':
      Object.assign(L, { stroke: 'rgba(110, 118, 150, 0.45)', dash: [2, 3], veil: true });
      break;
    case 'reopen':
      Object.assign(L, { stroke: SEALED, lock: 'open' });
      break;
    case 'sealed':
      Object.assign(L, { stroke: SEALED_SHUT, lock: 'shut' });
      break;
    case 'swallowed':
      Object.assign(L, { fill: '#3a1434', stroke: 'rgba(192, 74, 154, 0.5)', ink: 'rgba(220, 140, 200, 0.4)' });
      break;
    case 'heart':
      Object.assign(L, { fill: '#5a1650', stroke: BLOOM });
      break;
  }
  // The heart keeps its own colours in any state it shares with other nodes, such as open.
  if (o.heart && state !== 'here' && state !== 'swallowed' && !taken) {
    L.fill = '#5a1650';
    if (state === 'plain' || state === 'missed') L.stroke = BLOOM;
  }
  if (o.selected && !L.halo) L.halo = { color: '#ffffff', a: 0.15, p: 0, scale: 1.9 };
  if (o.selected) L.width = Math.max(L.width, 2.5);
  // Hover has its own cue (#287): a step wider than the node would be, and a faint glow.
  if (o.hover) {
    L.width = Math.max(L.width + 1, 3);
    if (!L.halo) L.halo = { color: '#ffffff', a: 0.08, p: 0, scale: 1.6 };
  }
  return L;
}

/** The node's star or disc as a path. */
function shape(g: CanvasRenderingContext2D, star: boolean, x: number, y: number, r: number): void {
  g.beginPath();
  if (!star) return void g.arc(x, y, r, 0, Math.PI * 2);
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}

/** Under the icon: the halo, the fill and the outline. `star` for the heart. */
export function drawNodeBase(g: CanvasRenderingContext2D, L: NodeLook, x: number, y: number, r: number, u: number, star: boolean, pulse: number): void {
  if (L.halo) {
    g.fillStyle = L.halo.color;
    g.globalAlpha = L.halo.a + L.halo.p * pulse;
    g.beginPath();
    g.arc(x, y, r * L.halo.scale, 0, Math.PI * 2);
    g.fill();
  }
  shape(g, star, x, y, r);
  if (L.base) {
    g.globalAlpha = 1;
    g.fillStyle = L.base;
    g.fill();
  }
  g.globalAlpha = L.fillAlpha;
  g.fillStyle = L.fill;
  g.fill();
  g.globalAlpha = 1;
  g.lineWidth = L.width * u;
  g.strokeStyle = L.stroke;
  g.setLineDash(L.dash ? L.dash.map((d) => d * u) : []);
  g.stroke();
  g.setLineDash([]);
}

/** Over the icon: the veil and the padlock. */
export function drawNodeTop(g: CanvasRenderingContext2D, L: NodeLook, x: number, y: number, r: number, u: number, pulse: number): void {
  if (L.veil) {
    // Faded under a veil of the night: still there to read, no longer a place to go.
    // It covers the difficulty ring, rival dots and pips too, then feathers out.
    const R = r + 10 * u;
    const veil = g.createRadialGradient(x, y, 0, x, y, R);
    veil.addColorStop(0, 'rgba(6, 7, 15, 0.62)');
    veil.addColorStop((r + 7 * u) / R, 'rgba(6, 7, 15, 0.62)');
    veil.addColorStop(1, 'rgba(6, 7, 15, 0)');
    g.fillStyle = veil;
    g.beginPath();
    g.arc(x, y, R, 0, Math.PI * 2);
    g.fill();
  }
  if (L.lock) {
    // Reopenable: amber, shackle lifted, pulsing. For good: grey and shut (#287).
    g.globalAlpha = L.lock === 'open' ? 0.75 + 0.25 * pulse : 1;
    lock(g, x + r * 0.75, y - r * 0.75, 6 * u, L.lock);
    g.globalAlpha = 1;
  }
}

/** A small padlock centred on (x, y), `s` its half-width; an open one lifts its shackle to the side. */
function lock(g: CanvasRenderingContext2D, x: number, y: number, s: number, kind: 'open' | 'shut'): void {
  g.fillStyle = '#06070f';
  g.beginPath();
  g.arc(x, y, s * 1.7, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = g.fillStyle = kind === 'open' ? SEALED : SEALED_SHUT;
  g.lineWidth = s * 0.35;
  g.beginPath();
  if (kind === 'open') g.arc(x + s * 0.55, y - s * 0.6, s * 0.55, Math.PI, Math.PI * 1.95);
  else g.arc(x, y - s * 0.25, s * 0.55, Math.PI, 0);
  g.stroke();
  g.fillRect(x - s * 0.8, y - s * 0.25, s * 1.6, s * 1.15);
}

/** A key swatch for the `?` card: a node in `state`, drawn as the map draws it, `px` CSS pixels square. */
export function keyCanvas(state: NodeState, me: string, px = 40): HTMLCanvasElement {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cv = document.createElement('canvas');
  cv.className = 'node-swatch';
  cv.width = cv.height = Math.round(px * dpr);
  cv.style.width = cv.style.height = `${px}px`;
  const g = cv.getContext('2d');
  if (!g) return cv;
  const L = nodeLook(state, me);
  // Room for the halo (1.9 r) and the padlock in the corner.
  const u = cv.width / 40, c = cv.width / 2, r = 10 * u;
  drawNodeBase(g, L, c, c, r, u, state === 'heart', 0.5);
  if (state !== 'heart') glyph(g, 'conquest', c, c, r, u, L.ink);
  drawNodeTop(g, L, c, c, r, u, 0.5);
  return cv;
}
