import { describe, expect, it } from 'vitest';
import { RUN_SCREEN, coversDemo } from '../src/ui/cover';

const cls = (s: string) => {
  const set = new Set(s.split(/\s+/));
  return { contains: (c: string) => set.has(c) };
};

describe('modals the demo battle pauses under (#270)', () => {
  it('the run map, the room and the run screens cover it', () => {
    expect(coversDemo(cls('screen runmap'))).toBe(true);
    expect(coversDemo(cls('screen lobby-screen opaque'))).toBe(true);
    // The debrief and the reward and recruit picks (campaign.ts) are built on RUN_SCREEN.
    expect(coversDemo(cls(RUN_SCREEN))).toBe(true);
  });

  it('the run screens are modals without the see-through dim backdrop', () => {
    const c = cls(RUN_SCREEN);
    expect(c.contains('screen') && c.contains('modal')).toBe(true);
    expect(c.contains('dim')).toBe(false);
  });

  it('menu modals do not: the demo keeps running under them', () => {
    // The run hub, settings, how to play.
    expect(coversDemo(cls('screen modal dim'))).toBe(false);
    expect(coversDemo(cls('screen modal'))).toBe(false);
  });
});
