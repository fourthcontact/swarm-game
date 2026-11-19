import { describe, expect, it } from 'vitest';
import { nodeSetup, rivals } from '../src/campaign/battle';
import { newRun, type RunState } from '../src/campaign/run';
import { createWorld } from '../src/sim/setup';
import { rivalStrip } from '../src/ui/battlepeek';
import { battleMarks, cardMap, homeOf } from '../src/ui/runmapfx';

const runs: RunState[] = ['alpha', 'beta', 'gamma'].map((s) => newRun(`peek-${s}`, 0, 'swarm', 0, 'hard'));

describe('a closer look at a battle (#249)', () => {
  it('every player in a battle has a home to label on its map', () => {
    for (const run of runs)
      for (const n of run.nodes) {
        if (n.kind === 'start' || n.kind === 'hold') continue;
        const m = cardMap(run, n);
        const players = nodeSetup(run, n.id).players.length;
        for (let p = 0; p < players; p++) expect(homeOf(m, p), `${run.seedText} node ${n.id} player ${p}`).not.toBeNull();
        expect(rivals(run, n.id).length).toBe(players - 1);
      }
  });

  it('marks the finale heart and its wards where the battle puts them', () => {
    for (const run of runs) {
      const n = run.nodes[run.heart];
      const mk = battleMarks(run, n);
      const w = createWorld(nodeSetup(run, n.id));
      expect(mk.heart).toEqual({ x: w.heart!.x, y: w.heart!.y });
      expect(mk.wards?.length).toBe(w.heart!.nests.length);
      expect(mk.wards!.length).toBeGreaterThan(0);
      // Cached: the same object the second time.
      expect(battleMarks(run, n)).toBe(mk);
    }
  });

  it('marks nothing extra on other battles', () => {
    const run = runs[0];
    for (const n of run.nodes) if (n.kind !== 'finale') expect(battleMarks(run, n)).toEqual({});
  });

  it('rival portraits are buttons only where they open a card', () => {
    const run = runs[0];
    const n = run.nodes.find((x) => x.kind === 'conquest')!;
    const foes = rivals(run, n.id);
    expect(rivalStrip(foes, true, '', true)).toContain('data-rival="0"');
    expect(rivalStrip(foes, true, '', true)).toContain('role="button"');
    expect(rivalStrip(foes, true)).not.toContain('data-rival');
  });
});
