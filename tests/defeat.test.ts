import { describe, expect, it } from 'vitest';
import type { BattleReport } from '../src/campaign/broods';
import { defeatStats, lossCause } from '../src/campaign/defeat';
import { moves, newRun, resolveTurn, type RunState } from '../src/campaign/run';

const WIN: BattleReport = { won: true, survivors: [30, 12, 12, 12], nests: 6, seconds: 200 };
const LOSS: BattleReport = { won: false, survivors: [0, 0, 0, 0], nests: 0, seconds: 300 };

const stat = (run: RunState, label: string) => defeatStats(run).find((s) => s.label === label)?.value;

/** Win one battle, then lose with every brood until the run ends (no checkpoint on the way). */
function lostRun(): RunState {
  const run = newRun('defeat', 0, 'swarm', 0, 'hard');
  resolveTurn(run, moves(run)[0], WIN, run.fielded, 0);
  for (let guard = 0; guard < 10 && run.status === 'active'; guard++) {
    for (const b of run.broods) b.size = 5;
    resolveTurn(run, moves(run)[0], LOSS, run.broods.map((b) => b.id), 0);
  }
  return run;
}

describe('the defeat screen (#271)', () => {
  it('says why the run ended and gives it in numbers: difficulty, battles, biomass, who fell', () => {
    const run = lostRun();
    expect(run).toMatchObject({ status: 'lost', lostTo: 'broods' });
    expect(lossCause(run)).toBe('Your last brood is gone.');
    expect(stat(run, 'Difficulty')).toBe('Hard');
    expect(stat(run, 'Seed')).toBe('defeat');
    const lost = run.log.filter((l) => !l.won).length;
    expect(stat(run, 'Battles')).toBe(`1 won · ${lost} lost`);
    expect(stat(run, 'Biomass gathered')).toBe(`${run.gathered}`);
    expect(run.gathered).toBeGreaterThan(0);
    // Every brood that died, by name.
    for (const f of run.fallen!) expect(stat(run, 'Broods lost')).toContain(f.name);
    expect(stat(run, 'How far')).toMatch(/hops? from the heart/);
  });

  it('names the Bloom when it closed the way on, and a sealed battle that could no longer be reopened', () => {
    const run = newRun('defeat-bloom', 0, 'swarm', 0, 'brutal');
    run.status = 'lost';
    run.lostTo = 'bloom';
    expect(lossCause(run)).toBe('The Bloom closed every route. Your swarm is consumed.');
    run.sealed = [moves(run)[0]];
    expect(lossCause(run)).toMatch(/^No way on/);
  });

  it('an older save, without the run history, shows a dash and a count', () => {
    const run = lostRun();
    delete run.gathered;
    delete run.fallen;
    expect(stat(run, 'Biomass gathered')).toBe('—');
    expect(stat(run, 'Broods lost')).toBe(`${run.nextBrood - run.broods.length}`);
  });
});
