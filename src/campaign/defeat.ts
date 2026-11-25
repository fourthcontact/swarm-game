/**
 * What the defeat screen says about a lost run (#271): why it ended, and the run in numbers.
 * Pure, so tests can read it without a DOM; the screen itself is ui/defeat.ts.
 */
import { PLAYTEST } from './playtest';
import { DIFFICULTIES, RUN_DIFFICULTY, difficultyOf, hops, type RunDifficulty, type RunState } from './run';

/** Why the run ended, in a sentence. */
export function lossCause(run: RunState): string {
  if (run.lostTo === 'bloom') {
    return run.sealed?.some((n) => !run.swallowed.includes(n))
      ? 'No way on: the heart is out of reach, and no lost battle can be fought again. The Bloom consumes your swarm.'
      : 'The Bloom closed every route. Your swarm is consumed.';
  }
  return 'Your last brood is gone.';
}

export interface DefeatStat {
  label: string;
  value: string;
}

/** The run in numbers. Runs from older builds don't record biomass gathered or who fell: a dash. */
export function defeatStats(run: RunState): DefeatStat[] {
  const won = run.log.filter((l) => l.won).length;
  const lost = run.log.length - won;
  const lords = run.warlords ?? [];
  // An older run kept no record: a dash, not a guess (broods released or waiting to join would skew a count).
  const fallen = run.fallen ? run.fallen.map((f) => f.name).join(', ') || 'none' : '—';
  const stats: DefeatStat[] = [
    { label: 'Difficulty', value: RUN_DIFFICULTY[difficultyOf(run)].name },
    { label: 'Seed', value: run.seedText },
    { label: 'Turns', value: `${run.turn}` },
    { label: 'Battles', value: `${won} won · ${lost} lost` },
    { label: 'Biomass gathered', value: run.gathered === undefined ? '—' : `${run.gathered}` },
    { label: 'Broods lost', value: fallen },
  ];
  if (lords.length) stats.push({ label: 'Warlords broken', value: `${lords.filter((w) => w.broken).length} of ${lords.length}` });
  stats.push({ label: 'How far', value: howFar(run) });
  return stats;
}

/** How close you got to the heart, over the map's links (the Bloom's ground included: it's the distance you'd covered). */
function howFar(run: RunState): string {
  const d = hops(run.nodes, run.heart)[run.at];
  if (d === 0) return 'reached the heart';
  return d > 0 ? `${d} hop${d === 1 ? '' : 's'} from the heart` : '—';
}

/** A way out of the defeat screen. `seed`: the run to start (null: a new seed), on the lost run's difficulty. */
export interface DefeatChoice {
  a: 'hub' | 'seed' | 'again';
  label: string;
  primary?: boolean;
  seed?: string | null;
  difficulty?: RunDifficulty;
}

/** Back to the campaign, and two ways to try again on the same difficulty. A playtest only goes back. */
export function defeatChoices(run: RunState): DefeatChoice[] {
  const hub: DefeatChoice = { a: 'hub', label: 'Campaign' };
  if (run.id.startsWith(PLAYTEST)) return [hub];
  const difficulty = difficultyOf(run);
  return [hub, { a: 'seed', label: 'Same seed again', seed: run.seedText, difficulty }, { a: 'again', label: 'New run', primary: true, seed: null, difficulty }];
}

/** The difficulty the swarm pick starts on: the one asked for (from the defeat screen), else the last one picked. */
export function startDifficulty(preset: RunDifficulty | undefined, stored: string | null): RunDifficulty {
  if (preset) return preset;
  return stored && (DIFFICULTIES as string[]).includes(stored) ? (stored as RunDifficulty) : 'standard';
}
