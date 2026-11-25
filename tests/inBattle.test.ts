import { describe, expect, it } from 'vitest';
import type { BattleReport } from '../src/campaign/broods';
import { RETREAT, abandoned, noteBattle, settleAbandoned, settledElsewhere, startBattle } from '../src/campaign/inBattle';
import { moves, newRun, resolveTurn, type RunState } from '../src/campaign/run';

const LOSS: BattleReport = { won: false, survivors: [3, 0, 0, 0], nests: 1, seconds: 240 };
const WIN: BattleReport = { won: true, survivors: [30, 12, 12, 12], nests: 6, seconds: 200 };

const rich = (): RunState => {
  const run = newRun('in-battle', 0, 'swarm', 0, 'standard');
  run.biomass = 1000;
  return run;
};
/** What a reload does: the run as last saved. */
const reload = (run: RunState): RunState => JSON.parse(JSON.stringify(run)) as RunState;
/** Everything but the wall-clock stamp. */
const same = (run: RunState) => ({ ...run, updated: 0 });

describe('leaving the page mid-battle (#266)', () => {
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
    expect(same(back)).toEqual(same(retreat));
    expect(res!.events.every((e) => e.what === 'wounded' || e.what === 'died')).toBe(true);
    // Settled once: resuming again changes nothing.
    expect(settleAbandoned(back, 0)).toBeNull();
  });

  it('a battle won before the page closed counts as won (the victory pause)', () => {
    const run = rich();
    const id = moves(run)[0];
    startBattle(run, id, run.fielded);
    noteBattle(run, WIN);
    const back = reload(run);
    const won = rich();
    resolveTurn(won, id, WIN, won.fielded, 0);
    settleAbandoned(back, 0);
    expect(same(back)).toEqual(same(won));
    expect(back.sealed ?? []).toEqual([]);
    expect(back.at).toBe(id);
  });

  it('a finale left mid-fight keeps the heart damage, as Retreat would', () => {
    const run = rich();
    run.at = run.nodes[run.heart].links[0];
    startBattle(run, run.heart, run.fielded);
    noteBattle(run, { ...LOSS, heart: 0.6 });
    const back = reload(run);
    const retreat = reload(run);
    delete retreat.fighting;
    resolveTurn(retreat, run.heart, { ...LOSS, heart: 0.6 }, run.fielded, 0);
    settleAbandoned(back, 0);
    expect(back.heartWound).toBeGreaterThan(0);
    expect(back.heartWound).toBe(retreat.heartWound);
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

  it("leaving your last brood's battle ends the run, as a loss would", () => {
    const run = rich();
    run.checkpointUsed = true;
    for (const b of run.broods) b.size = 5;
    startBattle(run, moves(run)[0], run.broods.map((b) => b.id));
    settleAbandoned(run, 0);
    expect(run).toMatchObject({ status: 'lost', lostTo: 'broods' });
  });

  it('two tabs: a battle another tab settled is not saved over', () => {
    const run = rich();
    startBattle(run, moves(run)[0], run.fielded);
    const other = reload(run);
    settleAbandoned(other, 0);
    expect(settledElsewhere(other, run)).toBe(true);
    // The saved run as this tab left it, or none (a playtest), is this tab's to settle.
    expect(settledElsewhere(reload(run), run)).toBe(false);
    expect(settledElsewhere(null, run)).toBe(false);
  });
});
