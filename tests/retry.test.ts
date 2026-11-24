import { describe, expect, it } from 'vitest';
import type { BattleReport } from '../src/campaign/broods';
import { RETREAT, RETRY, RUN_DIFFICULTY, abandoned, canRetry, canStep, moves, newRun, payRetry, reachable, resolveTurn, retriesLeft, retryCost, sealedMoves, settleAbandoned, startBattle, stranded, wayOn, type RunState } from '../src/campaign/run';

const LOSS: BattleReport = { won: false, survivors: [3, 0, 0, 0], nests: 1, seconds: 240 };
const WIN: BattleReport = { won: true, survivors: [30, 12, 12, 12], nests: 6, seconds: 200 };

const rich = (d: RunState['difficulty'] = 'standard'): RunState => {
  const run = newRun(`retry-${d}`, 0, 'swarm', 0, d);
  run.biomass = 1000;
  return run;
};
/** Lose the battle at `id`: a whole turn. */
const lose = (run: RunState, id: number) => resolveTurn(run, id, LOSS, run.fielded, 0);

describe('fighting a lost battle again (#253)', () => {
  it('a loss seals the node: no free second try', () => {
    const run = rich();
    const id = moves(run)[0];
    lose(run, id);
    expect(run.sealed).toEqual([id]);
    expect(moves(run)).not.toContain(id);
    expect(canStep(run, run.at, id)).toBe(false);
    expect(sealedMoves(run)).toEqual([id]);
  });

  it('a loss is a whole turn: the Bloom advances, half a step on Gentle', () => {
    for (const [d, step] of [['gentle', 0.5], ['standard', 1], ['hard', 1], ['brutal', 1]] as const) {
      const run = rich(d);
      const t = run.bloom.time;
      lose(run, moves(run)[0]);
      expect(run.bloom.time - t, d).toBe(step);
      expect(RUN_DIFFICULTY[d].lossStep).toBe(step);
    }
  });

  it('paying opens the node again; a win there settles it', () => {
    const run = rich();
    const id = moves(run)[0];
    lose(run, id);
    expect(payRetry(run, id)).toBe(true);
    expect(run.sealed).toEqual([]);
    expect(moves(run)).toContain(id);
    expect(run.tries).toEqual({ [id]: 1 });
    resolveTurn(run, id, WIN, run.fielded, 0);
    expect(run.tries).toEqual({});
    expect(run.retried).toBe(1);
  });

  it('has a per-run cap by difficulty: Gentle 3, Standard 2, Hard 1, Brutal 0', () => {
    expect([RUN_DIFFICULTY.gentle, RUN_DIFFICULTY.standard, RUN_DIFFICULTY.hard, RUN_DIFFICULTY.brutal].map((r) => r.retries)).toEqual([3, 2, 1, 0]);
    for (const d of ['gentle', 'standard', 'hard', 'brutal'] as const) {
      const run = rich(d);
      const id = moves(run)[0];
      let paid = 0;
      for (;;) {
        lose(run, id);
        if (run.status !== 'active' || !payRetry(run, id)) break;
        paid++;
      }
      expect(paid, d).toBe(RUN_DIFFICULTY[d].retries);
      expect(retriesLeft(run)).toBe(0);
      expect(canRetry(run, id)).toBe(false);
    }
  });

  it('costs half the reward (at least the minimum), rising for each retry of the same battle', () => {
    const run = rich('gentle');
    const [id, other] = moves(run);
    const base = Math.max(RETRY.min, run.nodes[id].reward * RETRY.share);
    lose(run, id);
    expect(retryCost(run, id)).toBe(Math.round(base));
    const before = run.biomass;
    expect(payRetry(run, id)).toBe(true);
    expect(run.biomass).toBe(before - Math.round(base));
    lose(run, id);
    expect(retryCost(run, id)).toBe(Math.round(base * (1 + RETRY.rise)));
    // Another battle starts at the base price.
    expect(retryCost(run, other)).toBe(Math.round(Math.max(RETRY.min, run.nodes[other].reward * RETRY.share)));
  });

  it("a battle's rising price is its own: a win or a retry elsewhere doesn't reset it", () => {
    const run = rich('gentle');
    const [a, b] = moves(run);
    const raw = Math.max(RETRY.min, run.nodes[a].reward * RETRY.share);
    lose(run, a);
    payRetry(run, a);
    lose(run, a);
    // A retry elsewhere, then a win there.
    lose(run, b);
    payRetry(run, b);
    resolveTurn(run, b, WIN, run.fielded, 0);
    expect(retryCost(run, a)).toBe(Math.round(raw * (1 + RETRY.rise)));
  });

  it("the finale's retry is priced off the map's richest node, not its own zero reward", () => {
    const run = rich();
    const top = Math.max(...run.nodes.map((n) => n.reward));
    expect(run.nodes[run.heart].reward).toBe(0);
    expect(retryCost(run, run.heart)).toBe(Math.round(Math.max(RETRY.min, top * RETRY.share)));
  });

  it('cornered behind a sealed node, the reserve is the cheapest retry, and spending below it strands the run', () => {
    const run = rich();
    run.sealed = moves(run).filter((n) => !run.visited.includes(n));
    const keep = Math.min(...run.sealed.map((n) => retryCost(run, n)));
    expect(wayOn(run)).toEqual({ stranded: false, reserve: keep });
    run.biomass = keep - 1;
    expect(wayOn(run)).toEqual({ stranded: true, reserve: keep });
    // With the heart in reach, there's nothing to keep.
    expect(wayOn(rich())).toEqual({ stranded: false, reserve: 0 });
  });

  it('a sealed node a step from an earlier node, not this one, still counts as a way on', () => {
    // A map where the start has a neighbour the next node doesn't.
    const fits = (seed: number) => {
      const r = newRun(`retry-back-${seed}`, 0, 'swarm', 0);
      const nx = moves(r)[0];
      return r.nodes[r.at].links.some((l) => l !== nx && !r.nodes[nx].links.includes(l) && l !== r.heart);
    };
    const seed = Array.from({ length: 50 }, (_, k) => k).find(fits)!;
    expect(seed).toBeDefined();
    const run = newRun(`retry-back-${seed}`, 0, 'swarm', 0);
    run.biomass = 1000;
    const start = run.at;
    const next = moves(run)[0];
    resolveTurn(run, next, WIN, run.fielded, 0);
    // Back at the start, one battle we lost; everything else ahead is gone to the Bloom.
    const back = run.nodes[start].links.find((l) => l !== next && !run.nodes[next].links.includes(l) && l !== run.heart)!;
    run.sealed = [back];
    run.swallowed = run.nodes.filter((n) => n.id !== back && n.id !== start && n.id !== next && n.id !== run.heart).map((n) => n.id);
    expect(sealedMoves(run)).toEqual([]);
    expect(wayOn(run)).toEqual({ stranded: false, reserve: retryCost(run, back) });
  });

  it("can't be paid for without the biomass, or for a node that isn't sealed, and changes nothing then", () => {
    const run = rich();
    const [id, open] = moves(run);
    lose(run, id);
    expect(payRetry(run, open)).toBe(false);
    run.biomass = retryCost(run, id) - 1;
    const snap = JSON.stringify(run);
    expect(canRetry(run, id)).toBe(false);
    expect(payRetry(run, id)).toBe(false);
    expect(JSON.stringify(run)).toBe(snap);
  });

  it('with the heart out of reach and no retry to pay for, the Bloom takes the run', () => {
    // Every way forward sealed: only a retry could open one.
    const seal = (run: RunState) => (run.sealed = moves(run).filter((n) => !run.visited.includes(n)));
    const brutal = rich('brutal');
    seal(brutal);
    expect(reachable(brutal)!.has(brutal.heart)).toBe(false);
    expect(stranded(brutal)).toBe(true);
    // Standard has retries: stranded only when it can't pay, and no battle in reach could pay for it.
    const std = rich();
    seal(std);
    expect(stranded(std)).toBe(false);
    std.biomass = 0;
    expect(stranded(std)).toBe(true);
  });

  it('losing the last way forward ends the run', () => {
    const run = rich('brutal');
    const [id, ...rest] = moves(run);
    run.sealed = rest;
    lose(run, id);
    expect(run.status).toBe('lost');
    expect(run.lostTo).toBe('bloom');
  });

  it('older saves, without the retry fields, have every retry left', () => {
    const run = rich('hard');
    const id = moves(run)[0];
    lose(run, id);
    delete run.retried;
    delete run.tries;
    expect(retriesLeft(run)).toBe(1);
    expect(canRetry(run, id)).toBe(true);
  });

  it('rewinding to the checkpoint does not give retries back', () => {
    const run = newRun('retry-checkpoint', 0, 'swarm', 0);
    run.biomass = 1000;
    const next = moves(run)[0];
    run.nodes[next].checkpoint = true;
    expect(resolveTurn(run, next, WIN, run.fielded, 0).checkpoint).toBe('reached');
    const id = moves(run).find((n) => !run.visited.includes(n))!;
    lose(run, id);
    expect(payRetry(run, id)).toBe(true);
    // Fit again (wounded broods sit out), and small enough to be wiped out.
    for (const b of run.broods) (b.size = 5), (b.wounded = 0);
    const wipe: BattleReport = { won: false, survivors: [0, 0, 0, 0], nests: 0, seconds: 100 };
    expect(resolveTurn(run, id, wipe, run.broods.map((b) => b.id), 0).checkpoint).toBe('restored');
    expect(run.retried).toBe(1);
    expect(retriesLeft(run)).toBe(RUN_DIFFICULTY.standard.retries - 1);
  });

  it('a finished run offers no retry', () => {
    const run = rich();
    const id = moves(run)[0];
    lose(run, id);
    run.status = 'lost';
    expect(canRetry(run, id)).toBe(false);
  });
});

describe('leaving the page mid-battle (#266)', () => {
  /** What a reload does: the run as last saved. */
  const reload = (run: RunState): RunState => JSON.parse(JSON.stringify(run)) as RunState;

  it('settles the battle as a retreat on resume: wounds, salvage, a turn, and the node sealed', () => {
    const run = rich();
    const id = moves(run)[0];
    startBattle(run, id, run.fielded);
    const back = reload(run);
    expect(abandoned(back)).toEqual({ node: id, fielded: run.fielded, turn: run.turn });
    // The same turn as a retreat from the pause menu.
    const retreat = rich();
    resolveTurn(retreat, id, RETREAT, retreat.fielded, 0);
    const res = settleAbandoned(back, 0);
    expect(res).not.toBeNull();
    expect(back.fighting).toBeUndefined();
    expect(back.sealed).toEqual([id]);
    expect(moves(back)).not.toContain(id);
    expect({ ...back, updated: 0 }).toEqual({ ...retreat, updated: 0 });
    expect(res!.events.every((e) => e.what === 'wounded' || e.what === 'died')).toBe(true);
    // Settled once: resuming again changes nothing.
    expect(settleAbandoned(back, 0)).toBeNull();
  });

  it('a battle that ends in the page clears the marker', () => {
    for (const report of [WIN, LOSS]) {
      const run = rich();
      const id = moves(run)[0];
      startBattle(run, id, run.fielded);
      resolveTurn(run, id, report, run.fielded, 0);
      expect(run.fighting).toBeUndefined();
      expect(abandoned(run)).toBeNull();
    }
  });

  it('ignores a stale marker, and older saves without one', () => {
    const run = rich();
    expect(abandoned(run)).toBeNull();
    expect(settleAbandoned(run, 0)).toBeNull();
    run.fighting = { node: moves(run)[0], fielded: run.fielded, turn: run.turn - 1 };
    const turn = run.turn;
    expect(abandoned(run)).toBeNull();
    expect(settleAbandoned(run, 0)).toBeNull();
    expect(run.turn).toBe(turn);
    expect(run.fighting).toBeUndefined();
  });

  it('leaving your last brood\'s battle ends the run, as a loss would', () => {
    const run = rich();
    run.checkpointUsed = true;
    for (const b of run.broods) b.size = 5;
    startBattle(run, moves(run)[0], run.broods.map((b) => b.id));
    settleAbandoned(run, 0);
    expect(run).toMatchObject({ status: 'lost', lostTo: 'broods' });
  });
});
