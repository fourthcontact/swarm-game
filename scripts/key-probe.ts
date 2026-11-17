// Domination's key nests (#255): how do bot matches end, and does the winner
// get there while holding fewer key nests than a rival (the lone edge-key win)?
// Plays all-bot skirmish Domination FFAs and samples each team's held key nests
// (owned, filled and uncontested) once a second.
// Reports per player count: how matches end, their length, and for key-nest
// wins how much of the winner's scoring time it spent behind a rival on key
// nests, or on a single key nest.
// Usage: npx vite-node scripts/key-probe.ts [players] [size] [games]
//   e.g. npx vite-node scripts/key-probe.ts 2,3,4 medium 20
// Env: the shared TERRAIN/CAVES/EVENTS/LAYOUT options (scripts/env.ts); MINUTES caps a match (default 30).
import { CAVES, EVENTS, LAYOUT, TERRAIN } from './env';
import { PERSONALITIES } from '../src/sim/ai/bot';
import { applyMode } from '../src/game/matchSetup';
import { createWorld, type MatchSetup } from '../src/sim/setup';
import { keyScoring, keyTeam, step } from '../src/sim/step';
import { TICK_HZ } from '../src/sim/constants';
import type { MapSize } from '../src/sim/mapgen';
import type { World } from '../src/sim/world';

const counts = (process.argv[2] ?? '2,3,4').split(',').map(Number);
const size = (process.argv[3] ?? 'medium') as MapSize;
const games = Number(process.argv[4] ?? 20);
const MINUTES = Number(process.env.MINUTES ?? 30);

function setupOf(players: number, seed: number): MatchSetup {
  const s: MatchSetup = {
    seed,
    size,
    terrain: TERRAIN,
    caves: CAVES,
    events: EVENTS,
    layout: LAYOUT,
    players: Array.from({ length: players }, (_, i) => ({ faction: i, team: i, human: false, bot: { difficulty: 2, personality: PERSONALITIES[(i + seed) % PERSONALITIES.length] } })),
  };
  return applyMode(s, 'domination');
}

/** Key nests each team holds, owned, filled and uncontested. */
function held(w: World): number[] {
  const h = new Array<number>(w.keyScore.length).fill(0);
  for (const k of w.keys) if (keyScoring(w, k)) h[keyTeam(w, k)]++;
  return h;
}

const q = (xs: number[], p: number) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))] : NaN);
const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : '-');

for (const players of counts) {
  const reasons = new Map<string, number>();
  const lengths: number[] = [];
  let keyWins = 0, minority = 0, lone = 0, behindSum = 0;
  for (let g = 0; g < games; g++) {
    const w = createWorld(setupOf(players, 5000 + g));
    // Per team: seconds holding some key nest, behind a rival on key nests, on one key nest.
    const holding = new Array<number>(w.keyScore.length).fill(0);
    const behind = holding.slice(), single = holding.slice();
    while (!w.over && w.tick < MINUTES * 60 * TICK_HZ) {
      step(w, []);
      w.fx = [];
      w.deaths = [];
      if (w.tick % TICK_HZ) continue;
      const h = held(w);
      const top = Math.max(...h);
      for (let t = 0; t < h.length; t++) {
        if (!h[t]) continue;
        holding[t]++;
        if (h[t] < top) behind[t]++;
        if (h[t] === 1) single[t]++;
      }
    }
    const reason = w.over ? (w.winReason ?? 'other') : 'timeout';
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    lengths.push(w.tick / TICK_HZ / 60);
    if (w.over && w.winReason === 'domination') {
      const t = w.winnerTeam;
      keyWins++;
      const share = holding[t] ? behind[t] / holding[t] : 0;
      behindSum += share;
      if (share > 0.5) minority++;
      if (holding[t] && single[t] / holding[t] > 0.5) lone++;
    }
  }
  const ends = [...reasons].map(([r, n]) => `${r} ${n}`).join(', ');
  console.log(`${players}p ${size}, ${games} games: ${ends}`);
  console.log(`  length (min): median ${q(lengths, 0.5).toFixed(1)}, p90 ${q(lengths, 0.9).toFixed(1)}`);
  console.log(`  key-nest wins: ${keyWins}; winner behind a rival on key nests for most of its holding time: ${minority} (${pct(minority, keyWins)}); mean time behind ${pct(behindSum, keyWins)}; mostly on one key nest: ${lone} (${pct(lone, keyWins)})`);
}
