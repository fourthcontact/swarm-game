import { describe, expect, it } from 'vitest';
import { COST, type BattleReport, type Brood } from '../src/campaign/broods';
import { moves, needsBattle, newRun, resolveTurn, retryCost, RUN_DIFFICULTY, type RunDifficulty, type RunState } from '../src/campaign/run';
import { growNote, lossNote, lossShort } from '../src/ui/costs';

const LOSS: BattleReport = { won: false, survivors: [0, 0, 0, 0], nests: 0, seconds: 120 };

/** A fresh run and its first open battle. */
function firstFight(difficulty: RunDifficulty = 'standard'): { run: RunState; id: number } {
  const run = newRun('costs', 0, 'swarm', 0, difficulty);
  const id = moves(run).find((n) => needsBattle(run, n));
  if (id === undefined) throw new Error('no battle next to the start');
  return { run, id };
}

describe('a battle says what losing it costs before you fight (#272)', () => {
  it('names the retry price and the retries left', () => {
    const { run, id } = firstFight();
    const left = RUN_DIFFICULTY.standard.retries;
    expect(lossNote(run, id)).toBe(`Lose and it's sealed: fighting here again costs <b>${retryCost(run, id)} biomass</b> (${left} retries left this run).`);
    expect(lossShort(run, id)).toBe(`Lose and it's sealed: a retry costs ${retryCost(run, id)} biomass.`);
  });

  it('the price it promises is the price after a real loss', () => {
    const { run, id } = firstFight();
    const promised = retryCost(run, id);
    resolveTurn(run, id, LOSS, run.broods.map((b) => b.id), 0);
    expect(run.sealed).toContain(id);
    expect(retryCost(run, id)).toBe(promised);
  });

  it('says the last retry is the last', () => {
    const { run, id } = firstFight('hard');
    expect(RUN_DIFFICULTY.hard.retries).toBe(1);
    expect(lossNote(run, id)).toMatch(/your last retry this run/);
  });

  it('with no retries left, says sealed for good', () => {
    const { run, id } = firstFight();
    run.retried = RUN_DIFFICULTY.standard.retries;
    expect(lossNote(run, id)).toBe("Lose and it's sealed for good: you have no retries left this run.");
    expect(lossShort(run, id)).toBe("Lose and it's sealed for good.");
  });

  it('on Brutal, says Brutal allows none', () => {
    const { run, id } = firstFight('brutal');
    expect(lossNote(run, id)).toBe("Lose and it's sealed for good: Brutal allows no retries.");
  });
});

describe("the camp says a cap raise costs more each time (#272)", () => {
  it('names the step from COST.grow', () => {
    const step = COST.grow({ grows: 1 } as Brood) - COST.grow({ grows: 0 } as Brood);
    expect(step).toBeGreaterThan(0);
    expect(growNote()).toBe(`Each raise costs ${step} biomass more than the last.`);
  });
});
