import { describe, expect, it } from 'vitest';
import type { BattleReport } from '../src/campaign/broods';
import { moves, needsBattle, newRun, resolveTurn, retryCost, RUN_DIFFICULTY, sealedMoves, type RunDifficulty, type RunState } from '../src/campaign/run';
import { lossShort } from '../src/ui/costs';
import { nodeActions, nodeStatus } from '../src/ui/nodestatus';
import { whyNot } from '../src/ui/whynot';

const WIN: BattleReport = { won: true, survivors: [30, 12, 12, 12], nests: 6, seconds: 200 };
const LOSS: BattleReport = { won: false, survivors: [0, 0, 0, 0], nests: 0, seconds: 120 };

/** A run that lost its first battle: that node is sealed, next to where the swarm still stands. */
function sealedNext(difficulty: RunDifficulty = 'standard'): { run: RunState; id: number } {
  for (let i = 0; i < 50; i++) {
    const run = newRun(`nodestatus-${i}`, 0, 'swarm', 0, difficulty);
    const id = moves(run).find((n) => needsBattle(run, n));
    if (id === undefined) continue;
    resolveTurn(run, id, LOSS, run.broods.map((b) => b.id), 0);
    if (run.status === 'active' && run.sealed?.includes(id)) return { run, id };
  }
  throw new Error('no seed seals its first battle');
}

describe("a run map node's card: what it says and offers (#272)", () => {
  it('your own node: you are here, and the camp', () => {
    const run = newRun('nodestatus', 0, 'swarm', 0);
    expect(nodeStatus(run, run.at)).toBe('Your swarm is here, at its camp.');
    expect(nodeActions(run, run.at)).toEqual({ verb: null, retry: null, camp: true });
  });

  it('an open battle: what losing costs, and Fight', () => {
    const run = newRun('nodestatus', 0, 'swarm', 0);
    const id = moves(run).find((n) => needsBattle(run, n))!;
    expect(nodeStatus(run, id)).toBe(lossShort(run, id));
    expect(nodeActions(run, id)).toEqual({ verb: 'Fight', retry: null, camp: false });
  });

  it('a taken node next to you: march through it', () => {
    const run = newRun('nodestatus', 0, 'swarm', 0);
    const start = run.at;
    const first = moves(run)[0];
    resolveTurn(run, first, WIN, run.fielded, 0);
    expect(nodeStatus(run, first)).toBe('Your swarm is here, at its camp.');
    expect(run.visited).toContain(start);
    // The Bloom may already have eaten the start: here it is still standing.
    run.swallowed = run.swallowed.filter((s) => s !== start);
    expect(nodeStatus(run, start)).toBe('Taken: march through without a battle.');
    expect(nodeActions(run, start)).toEqual({ verb: 'March', retry: null, camp: false });
  });

  it('a sealed battle next to you: its retry price, and Fight again (disabled when biomass is short)', () => {
    const { run, id } = sealedNext();
    expect(sealedMoves(run)).toContain(id);
    expect(nodeStatus(run, id)).toContain(`${retryCost(run, id)} biomass`);
    expect(nodeStatus(run, id)).not.toContain('from the map');
    run.biomass = retryCost(run, id);
    expect(nodeActions(run, id)).toEqual({ verb: null, retry: { cost: retryCost(run, id), can: true }, camp: false });
    run.biomass = retryCost(run, id) - 1;
    expect(nodeActions(run, id).retry).toEqual({ cost: retryCost(run, id), can: false });
  });

  it('a sealed battle with no retries left offers none', () => {
    const { run, id } = sealedNext();
    run.retried = RUN_DIFFICULTY.standard.retries;
    expect(nodeStatus(run, id)).toMatch(/sealed, and your retries are spent/);
    expect(nodeActions(run, id).retry).toBeNull();
    const brutal = sealedNext('brutal');
    expect(nodeStatus(brutal.run, brutal.id)).toMatch(/Brutal allows no retries/);
    expect(nodeActions(brutal.run, brutal.id).retry).toBeNull();
  });

  it('a swallowed node is lost to the Bloom', () => {
    const run = newRun('nodestatus', 0, 'swarm', 0);
    const id = moves(run)[0];
    run.swallowed.push(id);
    expect(nodeStatus(run, id)).toBe('Lost to the Bloom.');
    expect(nodeActions(run, id).verb).toBeNull();
  });

  it('anything else says why not, with no move', () => {
    const run = newRun('nodestatus', 0, 'swarm', 0);
    const far = run.nodes.find((n) => n.id !== run.at && !moves(run).includes(n.id) && n.id !== run.heart)!;
    expect(nodeStatus(run, far.id)).toBe(whyNot(run, far.id));
    expect(nodeActions(run, far.id)).toEqual({ verb: null, retry: null, camp: false });
  });
});
