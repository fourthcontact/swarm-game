import { describe, expect, it } from 'vitest';
import type { BattleReport } from '../src/campaign/broods';
import { moves, needsBattle, newRun, resolveTurn, RUN_DIFFICULTY, type RunState } from '../src/campaign/run';
import { NODE_KEY, NODE_STATES, RESCUE, SEALED, SEALED_SHUT, nodeCtx, nodeLook, nodeState, type NodeLook, type NodeState } from '../src/ui/nodelook';

const WIN: BattleReport = { won: true, survivors: [30, 12, 12, 12], nests: 6, seconds: 200 };
const LOSS: BattleReport = { won: false, survivors: [0, 0, 0, 0], nests: 0, seconds: 120 };
const ME = '#2de2e6';
const state = (run: RunState, id: number) => nodeState(run, id, nodeCtx(run));

/** A look with every alpha taken out: what still tells two states apart when it's faint or far away. */
function signature(L: NodeLook): string {
  const solid = (c: string | null | undefined) => c?.replace(/rgba\((\d+),\s*(\d+),\s*(\d+),[^)]*\)/, 'rgb($1,$2,$3)') ?? null;
  return JSON.stringify({ base: solid(L.base), fill: solid(L.fill), stroke: solid(L.stroke), dash: L.dash, halo: solid(L.halo?.color), veil: L.veil, lock: L.lock, ink: solid(L.ink) });
}

/** A run that lost its first battle: that node is sealed, next to where the swarm still stands. */
function sealedNext(): { run: RunState; id: number } {
  for (let i = 0; i < 50; i++) {
    const run = newRun(`nodelook-${i}`, 0, 'swarm', 0);
    const id = moves(run).find((n) => needsBattle(run, n));
    if (id === undefined) continue;
    resolveTurn(run, id, LOSS, run.broods.map((b) => b.id), 0);
    if (run.status === 'active' && run.sealed?.includes(id)) return { run, id };
  }
  throw new Error('no seed seals its first battle');
}

describe('run map node looks and their key (#287)', () => {
  it('every state has a look and a line in the key, in the key order', () => {
    expect(Object.keys(NODE_KEY).sort()).toEqual([...NODE_STATES].sort());
    for (const s of NODE_STATES) {
      expect(NODE_KEY[s].length).toBeGreaterThan(5);
      expect(nodeLook(s, ME).width).toBeGreaterThan(0);
    }
  });

  it('no two states look alike once alpha is ignored', () => {
    const seen = new Map<string, NodeState>();
    for (const s of NODE_STATES) {
      const sig = signature(nodeLook(s, ME));
      expect(seen.get(sig), `${s} looks like ${seen.get(sig)}`).toBeUndefined();
      seen.set(sig, s);
    }
  });

  it('the look-alikes from the issue differ in colour or shape', () => {
    const L = (s: NodeState) => nodeLook(s, ME);
    // Two padlocks: amber and lifted vs grey and shut.
    expect(L('reopen').lock).toBe('open');
    expect(L('sealed').lock).toBe('shut');
    expect(L('reopen').stroke).toBe(SEALED);
    expect(L('sealed').stroke).toBe(SEALED_SHUT);
    // Passed by: dashed and veiled; a plain node is solid.
    expect(L('missed').dash).not.toBeNull();
    expect(L('missed').veil).toBe(true);
    expect(L('plain').dash).toBeNull();
    // Taken is a hollow ring in your colour; only your own node is solid, with a white outline.
    expect(L('here').fillAlpha).toBe(1);
    expect(L('taken').fillAlpha).toBeLessThan(0.5);
    expect(L('taken').stroke).toBe(ME);
    expect(L('here').stroke).toBe('#ffffff');
    expect(L('taken').ink).not.toBe(L('here').ink);
  });

  it('an open node you would march through is a ring in your colour too', () => {
    const march = nodeLook('open', ME, { taken: true });
    expect(march.fillAlpha).toBeLessThan(0.5);
    expect(march.halo).not.toBeNull();
  });

  it('hover has its own cue: wider than an open node, and a glow', () => {
    const open = nodeLook('open', ME);
    expect(nodeLook('open', ME, { hover: true }).width).toBeGreaterThan(open.width);
    const plain = nodeLook('plain', ME, { hover: true });
    expect(plain.width).toBeGreaterThan(open.width);
    expect(plain.halo).not.toBeNull();
  });

  it('the rescue badge is not the biomass lime', () => {
    expect(RESCUE.toLowerCase()).not.toBe('#b4ff39');
  });

  it('a new run: here, open, the heart, and nodes not in reach yet', () => {
    const run = newRun('nodelook', 0, 'swarm', 0);
    expect(state(run, run.at)).toBe('here');
    for (const id of moves(run)) expect(state(run, id)).toBe('open');
    expect(state(run, run.heart)).toBe('heart');
    const far = run.nodes.find((n) => n.id !== run.at && n.id !== run.heart && !moves(run).includes(n.id))!;
    expect(state(run, far.id)).toBe('plain');
  });

  it('after a win: the old node is taken, the ones you passed by are missed', () => {
    const run = newRun('nodelook', 0, 'swarm', 0);
    const start = run.at;
    const [first, ...rest] = moves(run);
    resolveTurn(run, first, WIN, run.fielded, 0);
    run.swallowed = run.swallowed.filter((s) => s !== start);
    const st = state(run, start);
    expect(st === 'taken' || st === 'open').toBe(true);
    if (st === 'open') expect(run.visited).toContain(start);
    // A node you passed by goes missed, unless the Bloom ate it or it's still in reach.
    const ctx = nodeCtx(run);
    for (const id of rest) if (!ctx.reach!.has(id) && !run.swallowed.includes(id)) expect(state(run, id)).toBe('missed');
  });

  it('a lost battle next to you: reopen while a retry is left, sealed once they are spent', () => {
    const { run, id } = sealedNext();
    expect(state(run, id)).toBe('reopen');
    run.retried = RUN_DIFFICULTY.standard.retries;
    expect(state(run, id)).toBe('sealed');
  });

  it('a swallowed node, but not while its ring is still closing', () => {
    const run = newRun('nodelook', 0, 'swarm', 0);
    const id = moves(run)[0];
    run.swallowed.push(id);
    expect(state(run, id)).toBe('swallowed');
    expect(nodeState(run, id, nodeCtx(run, { fresh: new Set([id]), freshT: 0.5 }))).not.toBe('swallowed');
  });
});
