import { describe, expect, it } from 'vitest';
import { COVERS, coversDemo } from '../src/ui/cover';

const cls = (s: string) => {
  const set = new Set(s.split(/\s+/));
  return { contains: (c: string) => set.has(c) };
};

describe('modals the demo battle pauses under (#270)', () => {
  it('the run map, the room and the run screens cover it', () => {
    expect(coversDemo(cls('screen runmap'))).toBe(true);
    expect(coversDemo(cls('screen lobby-screen opaque'))).toBe(true);
    // The debrief and the reward and recruit picks, after a run battle.
    expect(coversDemo(cls(`screen modal dim ${COVERS}`))).toBe(true);
  });

  it('menu modals do not: the demo keeps running under them', () => {
    // The run hub, settings, how to play.
    expect(coversDemo(cls('screen modal dim'))).toBe(false);
    expect(coversDemo(cls('screen modal'))).toBe(false);
  });
});
