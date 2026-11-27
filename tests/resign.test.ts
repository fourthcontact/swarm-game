import { describe, expect, it } from 'vitest';
import { applyCommand } from '../src/sim/commands';
import { Kind, NestType } from '../src/sim/constants';
import { sanitizeCommand } from '../src/sim/sanitize';
import { step } from '../src/sim/step';
import { fullHash } from '../src/sim/snapshot';
import { removeUnit, spawnUnit, World } from '../src/sim/world';
import { play } from './rig';

/**
 * Resignation (#291). `teams[f]` is faction f's team; `humans` are human seats;
 * `nests[k]` owns nest k; `dots[f]` is how many dots f starts with.
 */
function match(teams: number[], humans: number[], nests: number[], dots: number[]): World {
  const w = new World(teams.length, 1400, 600);
  teams.forEach((t, f) => {
    w.factions[f].active = true;
    w.factions[f].human = humans.includes(f);
    w.setTeam(f, t);
  });
  nests.forEach((owner, id) => {
    const x = 80 + id * 120, y = 300;
    w.nests.push({
      id, x, y, r: 26, type: NestType.Hive, owner, level: 1, control: 1, controller: owner, spawnAcc: -1e9,
      rallyX: x, rallyY: y, feedProgress: 0, feedIncoming: 0, lastSpawn: 0, contested: false, capital: false, lockedUntil: 0, garrison: 0, visited: 0,
    });
  });
  // Far apart, so nobody fights during the test.
  dots.forEach((n, f) => {
    for (let k = 0; k < n; k++) spawnUnit(w, f, Kind.Dot, 60 + f * 220, 40 + k * 3, 60 + f * 220, 40 + k * 3, 4);
  });
  return w;
}

/** Step until the next victory check has run. */
const settle = (w: World) => {
  for (let t = 0; t < 20 && !w.over; t++) step(w, []);
};

describe('resignation (#291)', () => {
  it('kills the dots, frees the nests, and knocks the player out at once', () => {
    const w = match([0, 1], [0], [0, 0, 1], [5, 5]);
    expect(applyCommand(w, { t: 'resign', p: 0 })).toBeNull();
    const f = w.factions[0];
    expect(f.resigned).toBe(true);
    expect(f.eliminated).toBe(true);
    expect(f.eliminatedTick).toBe(w.tick);
    expect(w.unitCount[0]).toBe(0);
    for (let i = 0; i < w.n; i++) if (w.alive[i]) expect(w.owner[i]).not.toBe(0);
    expect(w.nests.map((n) => n.owner)).toEqual([-1, -1, 1]);
    expect(w.fx.some((e) => e.type === 'eliminated' && e.f === 0)).toBe(true);
    // twice, or after the end, does nothing
    expect(applyCommand(w, { t: 'resign', p: 0 })).toBe('invalid');
    settle(w);
    expect(w.over).toBe(true);
    expect(applyCommand(w, { t: 'resign', p: 1 })).toBe('invalid');
  });

  it('survives sanitizing, and only for a player faction', () => {
    const w = match([0, 1], [0], [0, 1], [1, 1]);
    expect(sanitizeCommand(w, { t: 'resign', p: 1, junk: 3 })).toEqual({ t: 'resign', p: 1 });
    expect(sanitizeCommand(w, { t: 'resign', p: 6 })).toBeNull();
    expect(sanitizeCommand(w, { t: 'resign', p: -1 })).toBeNull();
  });

  it('1v1: the other side wins', () => {
    const w = match([0, 1], [0], [0, 1], [5, 5]);
    applyCommand(w, { t: 'resign', p: 0 });
    settle(w);
    expect(w.over).toBe(true);
    expect(w.winnerTeam).toBe(1);
  });

  it('FFA: the last human resigning ends it; the bot with the most nests wins', () => {
    // nests: bot 2 holds three, bots 1 and 3 one each
    const w = match([0, 1, 2, 3], [0], [0, 1, 2, 2, 2, 3], [5, 30, 5, 30]);
    applyCommand(w, { t: 'resign', p: 0 });
    settle(w);
    expect(w.over).toBe(true);
    expect(w.winReason).toBe('resign');
    expect(w.winnerTeam).toBe(2);
  });

  it('equal nests: the team with more dots wins, then the lower team', () => {
    const w = match([0, 1, 2], [0], [0, 1, 2], [5, 4, 9]);
    applyCommand(w, { t: 'resign', p: 0 });
    settle(w);
    expect(w.winnerTeam).toBe(2);
    const tie = match([0, 1, 2], [0], [0, 1, 2], [5, 6, 6]);
    applyCommand(tie, { t: 'resign', p: 0 });
    settle(tie);
    expect(tie.winnerTeam).toBe(1);
  });

  it('a resigner\'s bot ally cannot win the tiebreak', () => {
    // team 0: human 0 and bot 1 (most nests); teams 1 and 2: bots
    const w = match([0, 0, 1, 2], [0], [1, 1, 1, 1, 2, 3, 3], [5, 30, 5, 5]);
    applyCommand(w, { t: 'resign', p: 0 });
    settle(w);
    expect(w.over).toBe(true);
    expect(w.winnerTeam).toBe(2);
  });

  it('a resigner\'s bot ally that beats the last human still wins', () => {
    // team 0: human 0 and bot 1; team 1: human 2
    const w = match([0, 0, 1], [0, 2], [1, 2], [5, 5, 5]);
    applyCommand(w, { t: 'resign', p: 0 });
    settle(w);
    expect(w.over).toBe(false); // human 2 still stands
    for (let i = 0; i < w.n; i++) if (w.alive[i] && w.owner[i] === 2) removeUnit(w, i);
    w.nests[1].owner = -1;
    settle(w);
    expect(w.over).toBe(true);
    expect(w.winnerTeam).toBe(0);
    expect(w.winReason).toBe('elimination');
  });

  it('no team qualifies: nobody wins', () => {
    // two teams, each a human and a bot
    const w = match([0, 0, 1, 1], [0, 2], [1, 3], [5, 5, 5, 5]);
    applyCommand(w, { t: 'resign', p: 2 });
    settle(w);
    expect(w.over).toBe(false); // human 0 still stands
    applyCommand(w, { t: 'resign', p: 0 });
    settle(w);
    expect(w.over).toBe(true);
    expect(w.winnerTeam).toBe(-1);
  });

  it('with another human still standing, the match goes on', () => {
    const w = match([0, 1, 2], [0, 1], [0, 1, 2], [5, 5, 5]);
    applyCommand(w, { t: 'resign', p: 0 });
    settle(w);
    expect(w.over).toBe(false);
    applyCommand(w, { t: 'resign', p: 1 });
    settle(w);
    expect(w.over).toBe(true);
    expect(w.winnerTeam).toBe(2);
  });
});

describe('resignation in a room (#291)', () => {
  it('a resigner watches; the last human resigning ends it the same way for everyone', () => {
    const { matches, run } = play();
    const m = (id: string) => matches.get(id)!;
    const seatOf = (id: string) => m(id).session.localSeat;
    const resign = (id: string) => m(id).session.issue({ t: 'resign', p: seatOf(id) });
    run(3000);
    resign('A');
    run(3000);
    for (const x of matches.values()) expect(x.session.world.factions[seatOf('A')].resigned).toBe(true);
    expect(m('H').seq!.seatState(seatOf('A'))).toBe('spectating');
    expect(m('A').session.world.over).toBe(false);

    resign('H');
    run(3000);
    expect(m('H').session.world.over).toBe(false); // B still stands
    resign('B');
    run(3000);
    const worlds = [...matches.values()].map((x) => x.session.world);
    for (const w of worlds) {
      expect(w.over).toBe(true);
      expect(w.winReason).toBe('elimination'); // only the bot's team is left
      expect(w.winnerTeam).toBe(w.teamOf[5]);
    }
    expect(new Set(worlds.map((w) => w.tick)).size).toBe(1);
    expect(new Set(worlds.map((w) => fullHash(w))).size).toBe(1);
  });
});
