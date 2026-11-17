import { describe, expect, it } from 'vitest';
import { BEGINNER, DIFFICULTY, DIFFICULTY_NAMES, DIFFICULTY_ORDER, type Bot } from '../src/sim/ai/bot';
import { TICK_HZ } from '../src/sim/constants';
import { createWorld, type MatchSetup } from '../src/sim/setup';
import { step } from '../src/sim/step';

// #117: a Beginner bot, below Easy, for brand-new players.
const match = (bots: number, seed = 5): MatchSetup => ({
  seed,
  size: bots > 1 ? 'medium' : 'small',
  players: Array.from({ length: bots + 1 }, (_, f) => (f === 0 ? { faction: 0, team: 0, human: true } : { faction: f, team: f, human: false, bot: { difficulty: BEGINNER, personality: 'rusher' as const } })),
});
const open = (b: Bot, w: ReturnType<typeof createWorld>) => (b as unknown as { playersOpen: (w: unknown) => boolean }).playersOpen(w);

describe('Beginner bot (#117)', () => {
  it('keeps the old indices and is listed first', () => {
    expect(DIFFICULTY_NAMES.slice(0, 4)).toEqual(['Easy', 'Normal', 'Hard', 'Brutal']);
    expect(DIFFICULTY_NAMES[BEGINNER]).toBe('Beginner');
    expect(DIFFICULTY_ORDER[0]).toBe(BEGINNER);
    expect([...DIFFICULTY_ORDER].sort()).toEqual(DIFFICULTY_NAMES.map((_, k) => k));
    const b = DIFFICULTY[BEGINNER], easy = DIFFICULTY[0];
    expect(b.powers).toBe(false);
    expect(b.think).toBeGreaterThan(easy.think);
    expect(b.margin).toBeGreaterThan(easy.margin);
    expect(b.prod).toBeLessThan(1);
  });

  it("expands, but leaves an idle player's nests alone through the grace period", () => {
    const w = createWorld(match(1));
    const mine = new Set(w.nests.filter((n) => n.owner === 0).map((n) => n.id));
    const grace = DIFFICULTY[BEGINNER].gentle!.grace;
    while (w.tick < grace && !w.over) step(w, []);
    expect(w.nests.filter((n) => mine.has(n.id) && n.owner !== 0)).toEqual([]);
    expect(w.nests.filter((n) => n.owner === 1).length).toBeGreaterThan(1);
  });

  it('beats an idle player eventually: it still attacks after the grace period', () => {
    const w = createWorld(match(1));
    while (w.tick < 12 * 60 * TICK_HZ && !w.over) step(w, []);
    expect(w.nests.filter((n) => n.owner === 0).length).toBeLessThan(2);
  }, 60000);

  it('takes turns: at most one Beginner goes after players at a time', () => {
    const w = createWorld(match(3));
    const g = DIFFICULTY[BEGINNER].gentle!;
    let any = 0;
    for (let t = 0; t < g.grace + 4 * (g.turn + g.rest); t += TICK_HZ) {
      w.tick = t;
      const n = w.bots.filter((b) => open(b, w)).length;
      expect(n).toBeLessThanOrEqual(1);
      if (t < g.grace) expect(n).toBe(0);
      any += n;
    }
    // each of the three got a turn
    expect(any).toBeGreaterThan(0);
    const turns = new Set<number>();
    for (let k = 0; k < 3; k++) {
      w.tick = g.grace + k * (g.turn + g.rest);
      turns.add(w.bots.findIndex((b) => open(b, w)));
    }
    expect(turns).toEqual(new Set([0, 1, 2]));
  });

});
