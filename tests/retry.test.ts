import { describe, expect, it } from 'vitest';
import type { BattleReport } from '../src/campaign/broods';
import { nodeSetup } from '../src/campaign/battle';
import { RETRY, RUN_DIFFICULTY, canRetry, moves, newRun, payRetry, resolveTurn, retriesLeft, retryCost, type RunState } from '../src/campaign/run';

const LOSS: BattleReport = { won: false, survivors: [3, 0, 0, 0], nests: 1, seconds: 240 };
const WIN: BattleReport = { won: true, survivors: [30, 12, 12, 12], nests: 6, seconds: 200 };

const rich = (d: RunState['difficulty'] = 'standard'): RunState => {
  const run = newRun(`retry-${d}`, 0, 'swarm', 0, d);
  run.biomass = 1000;
  return run;
};

describe('fighting a lost battle again (#253)', () => {
  it('has a per-run cap by difficulty: Gentle 3, Standard 2, Hard 1, Brutal 0', () => {
    expect([RUN_DIFFICULTY.gentle, RUN_DIFFICULTY.standard, RUN_DIFFICULTY.hard, RUN_DIFFICULTY.brutal].map((r) => r.retries)).toEqual([3, 2, 1, 0]);
    for (const d of ['gentle', 'standard', 'hard', 'brutal'] as const) {
      const run = rich(d);
      const id = moves(run)[0];
      let paid = 0;
      while (payRetry(run, id)) paid++;
      expect(paid, d).toBe(RUN_DIFFICULTY[d].retries);
      expect(retriesLeft(run)).toBe(0);
      expect(canRetry(run, id)).toBe(false);
    }
  });

  it('costs half the reward (at least the minimum), rising for each retry of the same battle', () => {
    const run = rich('gentle');
    const id = moves(run)[0];
    const base = Math.max(RETRY.min, run.nodes[id].reward * RETRY.share);
    expect(retryCost(run, id)).toBe(Math.round(base));
    const before = run.biomass;
    expect(payRetry(run, id)).toBe(true);
    expect(run.biomass).toBe(before - Math.round(base));
    expect(retryCost(run, id)).toBe(Math.round(base * (1 + RETRY.rise)));
    // Another battle starts at the base price.
    const other = moves(run)[1];
    expect(retryCost(run, other)).toBe(Math.round(Math.max(RETRY.min, run.nodes[other].reward * RETRY.share)));
  });

  it("can't be paid for without the biomass, and changes nothing then", () => {
    const run = rich();
    const id = moves(run)[0];
    run.biomass = retryCost(run, id) - 1;
    const snap = JSON.stringify(run);
    expect(canRetry(run, id)).toBe(false);
    expect(payRetry(run, id)).toBe(false);
    expect(JSON.stringify(run)).toBe(snap);
  });

  it('a retry is the same battle: the setup does not change', () => {
    const run = rich();
    const id = moves(run)[0];
    const before = JSON.stringify(nodeSetup(run, id, run.fielded));
    run.pendingLoss = { node: id, report: LOSS, fielded: run.fielded };
    payRetry(run, id);
    expect(run.pendingLoss).toBeUndefined();
    expect(JSON.stringify(nodeSetup(run, id, run.fielded))).toBe(before);
  });

  it('settling the battle clears the pending loss and resets the rising price', () => {
    const run = rich();
    const id = moves(run)[0];
    payRetry(run, id);
    run.pendingLoss = { node: id, report: LOSS, fielded: run.fielded };
    resolveTurn(run, id, WIN, run.fielded, 0);
    expect(run.pendingLoss).toBeUndefined();
    expect(run.retrying).toBeUndefined();
    expect(run.retried).toBe(1);
  });

  it('older saves, without the retry fields, have every retry left', () => {
    const run = rich('hard');
    delete run.retried;
    delete run.retrying;
    expect(retriesLeft(run)).toBe(1);
    expect(canRetry(run, moves(run)[0])).toBe(true);
  });

  it('rewinding to the checkpoint does not give retries back', () => {
    const run = newRun('retry-checkpoint', 0, 'swarm', 0);
    run.biomass = 1000;
    const next = moves(run)[0];
    run.nodes[next].checkpoint = true;
    expect(resolveTurn(run, next, WIN, run.fielded, 0).checkpoint).toBe('reached');
    expect(payRetry(run, moves(run)[0])).toBe(true);
    for (const b of run.broods) b.size = 5;
    const wipe: BattleReport = { won: false, survivors: [0, 0, 0, 0], nests: 0, seconds: 100 };
    expect(resolveTurn(run, moves(run)[0], wipe, run.broods.map((b) => b.id), 0).checkpoint).toBe('restored');
    expect(run.retried).toBe(1);
    expect(retriesLeft(run)).toBe(RUN_DIFFICULTY.standard.retries - 1);
  });

  it('a finished run offers no retry', () => {
    const run = rich();
    run.status = 'lost';
    expect(canRetry(run, moves(run)[0])).toBe(false);
  });
});
