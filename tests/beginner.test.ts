import { describe, expect, it } from 'vitest';
import { BEGINNER, DIFFICULTY, DIFFICULTY_NAMES, DIFFICULTY_ORDER, type Bot } from '../src/sim/ai/bot';
import { TICK_HZ } from '../src/sim/constants';
import { seatToBot } from '../src/sim/seats';
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

  const owners = (w: ReturnType<typeof createWorld>, cycles: number) => {
    const g = DIFFICULTY[BEGINNER].gentle!;
    const out: number[] = [];
    for (let k = 0; k < cycles; k++) {
      w.tick = g.grace + k * (g.turn + g.rest);
      out.push(w.bots.find((b) => open(b, w))?.faction ?? -1);
    }
    return out;
  };

  it('keeps the turn order when a Beginner is eliminated: no bot skipped or repeated', () => {
    const w = createWorld(match(3));
    const g = DIFFICULTY[BEGINNER].gentle!;
    expect(owners(w, 6)).toEqual([1, 2, 3, 1, 2, 3]);
    // bot 1 goes out during cycle 4 (bot 2's turn)
    w.factions[1].eliminated = true;
    w.factions[1].eliminatedTick = g.grace + 4 * (g.turn + g.rest) + 10;
    expect(owners(w, 9)).toEqual([1, 2, 3, 1, 2, 3, 2, 3, 2]);
  });

  it("leaves Beginners with no player to fight out of the rotation (a player's ally)", () => {
    const setup = match(3);
    setup.players[1].team = 0; // bot 1 is the player's ally
    const w = createWorld(setup);
    expect(owners(w, 4)).toEqual([2, 3, 2, 3]);
  });

  it("treats a dropped player's seat bot as a bot, not a player", () => {
    const w = createWorld(match(1));
    expect(w.bots[0].gentleFacing(w)).toBe(true);
    seatToBot(w, 0, { difficulty: 0, personality: 'expander' });
    expect(w.bots.find((b) => b.faction === 1)!.gentleFacing(w)).toBe(false);
  });

  it('calls back groups still marching on a player when its turn ends', () => {
    const w = createWorld(match(1));
    const g = DIFFICULTY[BEGINNER].gentle!;
    // play into the rest after the first turn
    while (w.tick < g.grace + g.turn + 2 * TICK_HZ) step(w, []);
    const target = w.nests.find((n) => n.owner === 0)!;
    const mine = [...Array(w.n).keys()].filter((i) => w.alive[i] && w.owner[i] === 1);
    expect(mine.length).toBeGreaterThan(0);
    step(w, [{ t: 'move', p: 1, units: mine.map((i) => w.uid[i]), x: target.x, y: target.y, nest: target.id }]);
    const at = (i: number) => (w.ox[i] - target.x) ** 2 + (w.oy[i] - target.y) ** 2 <= target.r ** 2;
    expect(mine.filter(at).length).toBeGreaterThan(0);
    // one think later, none still marching there
    for (let k = 0; k < DIFFICULTY[BEGINNER].think + 1; k++) step(w, []);
    const marching = mine.filter((i) => w.alive[i] && at(i) && (w.x[i] - target.x) ** 2 + (w.y[i] - target.y) ** 2 > (target.r + 90) ** 2);
    expect(marching).toEqual([]);
  });
});
