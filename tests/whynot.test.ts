import { describe, expect, it } from 'vitest';
import type { BattleReport } from '../src/campaign/broods';
import { moves, needsBattle, newRun, reachable, resolveTurn, type RunState } from '../src/campaign/run';
import { whyNot } from '../src/ui/whynot';

const WIN: BattleReport = { won: true, survivors: [30, 12, 12, 12], nests: 6, seconds: 200 };

/** A run one win in, standing next to an untaken node it can't step to. */
function oneStepIn(): { run: RunState; behind: number } {
  for (let i = 0; i < 200; i++) {
    const run = newRun(`whynot-${i}`, 0, 'swarm', 0);
    for (const first of moves(run)) {
      const r: RunState = JSON.parse(JSON.stringify(run));
      resolveTurn(r, first, WIN, r.broods.map((b) => b.id), 0);
      if (r.status !== 'active') continue;
      const behind = r.nodes[r.at].links.find((l) => needsBattle(r, l) && !r.swallowed.includes(l) && !moves(r).includes(l));
      if (behind !== undefined) return { run: r, behind };
    }
  }
  throw new Error('no seed leaves a node behind the first step');
}

describe("a closed node's card says why (#273)", () => {
  it('a linked node behind you says so, not "not next to your swarm"', () => {
    const { run, behind } = oneStepIn();
    expect(whyNot(run, behind)).toBe('Behind you: new battles lie only ahead, toward the heart.');
  });

  it('a linked node that is sealed or swallowed is not called "behind you"', () => {
    const { run, behind } = oneStepIn();
    const sealed: RunState = { ...run, sealed: [behind] };
    expect(whyNot(sealed, behind)).not.toMatch(/Behind you/);
    const eaten: RunState = { ...run, swallowed: [...run.swallowed, behind] };
    expect(whyNot(eaten, behind)).not.toMatch(/Behind you/);
    const over: RunState = { ...run, status: 'lost' };
    expect(whyNot(over, behind)).not.toMatch(/Behind you/);
  });

  it('a node you can no longer reach says you moved past it, and only then', () => {
    const { run } = oneStepIn();
    const reach = reachable(run)!;
    const linked = new Set(run.nodes[run.at].links);
    const past = run.nodes.find((n) => !reach.has(n.id) && !linked.has(n.id) && !run.swallowed.includes(n.id));
    const far = run.nodes.find((n) => reach.has(n.id) && !linked.has(n.id) && n.id !== run.at);
    if (past) expect(whyNot(run, past.id)).toBe('Out of reach: your swarm has moved past it.');
    expect(far).toBeDefined();
    expect(whyNot(run, far!.id)).toBe('Not next to your swarm.');
    // On a new run nothing is out of reach (#273).
    const fresh = newRun('whynot-0', 0, 'swarm', 0);
    for (const n of fresh.nodes) if (n.id !== fresh.at) expect(whyNot(fresh, n.id)).not.toMatch(/moved past/);
  });
});
