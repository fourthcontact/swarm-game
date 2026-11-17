import { describe, expect, it } from 'vitest';
import { keyNests, nodeSetup } from '../src/campaign/battle';
import { newRun, type RunState } from '../src/campaign/run';
import { KEYS, Kind, NEUTRAL, SURGE, TICK_HZ } from '../src/sim/constants';
import { generateMap } from '../src/sim/mapgen';
import { createWorld, mapParamsOf } from '../src/sim/setup';
import { dominationBanner, dominationStatus, keyEta, keyHeld, keyRate, keyTarget, soonestKeyWin, step } from '../src/sim/step';
import { applyMode } from '../src/game/matchSetup';
import { PERSONALITIES } from '../src/sim/ai/bot';
import { removeUnit, spawnUnit, type World } from '../src/sim/world';

// Conquest and Domination play differently (#87): key nests, and a late Bloom surge.

function nodeOf(kind: 'domination' | 'conquest'): [RunState, number] {
  for (let k = 0; ; k++) {
    const run = newRun(`objectives-${k}`, 0, 'swarm', 0);
    const n = run.nodes.find((o) => o.kind === kind && o.domain === undefined && o.rivals >= 2);
    if (n) return [run, n.id];
  }
}

/** Clear every unit, so only what the test does moves the nests. */
function empty(w: World): void {
  for (let i = w.n - 1; i >= 0; i--) if (w.alive[i]) removeUnit(w, i);
}

function run(w: World, ticks: number): void {
  for (let t = 0; t < ticks && !w.over; t++) {
    step(w, []);
    w.fx = [];
  }
}

describe('key nests (#87)', () => {
  it('a Domination node has two or three key nests: neutral, apart, away from the starts, with doubled guards', () => {
    const [r, id] = nodeOf('domination');
    const setup = nodeSetup(r, id);
    expect(setup.keys).toBe(keyNests(r.nodes[id].rivals));
    const map = generateMap(mapParamsOf(setup));
    const plain = generateMap({ ...mapParamsOf(setup), keys: undefined });
    const keys = map.nests.map((n, i) => ({ n, i })).filter((k) => k.n.key);
    expect(keys.length).toBe(setup.keys);
    const caps = map.nests.filter((n) => n.player >= 0);
    for (const { n, i } of keys) {
      expect(n.player).toBe(-1);
      expect(n.garrison).toBe(Math.round(plain.nests[i].garrison * KEYS.garrison));
      for (const o of keys) if (o.n !== n) expect(Math.hypot(o.n.x - n.x, o.n.y - n.y)).toBeGreaterThanOrEqual(KEYS.apart);
    }
    // Further from the starts than the typical neutral nest.
    const fromStarts = (n: { x: number; y: number }) => Math.min(...caps.map((c) => Math.hypot(c.x - n.x, c.y - n.y)));
    const neutrals = map.nests.filter((n) => n.player < 0 && !n.key).map(fromStarts).sort((a, b) => a - b);
    for (const { n } of keys) expect(fromStarts(n)).toBeGreaterThan(neutrals[neutrals.length >> 1]);
    expect(nodeSetup(...nodeOf('conquest')).keys).toBeUndefined();
  });

  it('a key nest is sealed at the start: an army on it takes nothing until the seal opens', () => {
    const [r, id] = nodeOf('domination');
    const w = createWorld(nodeSetup(r, id));
    const key = w.nests[w.keys[0]];
    empty(w);
    // Park a player-0 army on it.
    const me = w.factions.findIndex((f) => f.human);
    for (let k = 0; k < 30; k++) spawnUnit(w, me, Kind.Dot, key.x + (k % 6) * 4 - 10, key.y + Math.floor(k / 6) * 4 - 10, key.x, key.y, 0);
    expect(w.keySealUntil).toBe(KEYS.seal);
    run(w, KEYS.seal - 10);
    expect(key.owner === me && key.control > 0).toBe(false);
  });

  it('key nests score king of the hill: uncontested holds score, nothing resets, and the target wins', () => {
    const [r, id] = nodeOf('domination');
    const w = createWorld(nodeSetup(r, id));
    const me = w.factions.findIndex((f) => f.human);
    const rival = w.factions.findIndex((f, i) => f.active && i !== me && i !== NEUTRAL && w.teamOf[i] !== w.teamOf[me]);
    empty(w);
    w.keySealUntil = 0;
    const keys = w.keys.map((k) => w.nests[k]);
    const target = keyTarget(w);
    expect(target).toBe(KEYS.points * keys.length);
    // A split map: the side holding more key nests scores on them; the other scores nothing (#255).
    const split = keys.length > 2;
    keys.forEach((n, i) => Object.assign(n, { owner: i === 0 ? rival : me, controller: i === 0 ? rival : me, control: 1 }));
    run(w, 5 * TICK_HZ);
    const mine = w.keyScore[w.teamOf[me]], theirs = w.keyScore[w.teamOf[rival]];
    if (split) {
      expect(mine).toBeGreaterThan(0);
      expect(mine).toBeCloseTo(5 * TICK_HZ * (keys.length - 1), -2);
      expect(dominationStatus(w)).toMatchObject({ team: w.teamOf[me], keys: true, held: keys.length - 1, need: keys.length, paused: false });
    } else expect(mine).toBe(0);
    expect(theirs).toBe(0);
    // Not yet a threat: nobody is past half.
    expect(w.domTicks[w.teamOf[me]]).toBe(0);
    empty(w);
    // Losing a key nest slows you, it doesn't reset you.
    const before = w.keyScore[w.teamOf[me]];
    Object.assign(keys[1], { owner: -1, control: 0 });
    run(w, 30);
    expect(w.keyScore[w.teamOf[me]]).toBeGreaterThanOrEqual(before);
    // Hold them all: past half you're the threat, and at the target you win.
    empty(w);
    for (const n of keys) Object.assign(n, { owner: me, controller: me, control: 1 });
    run(w, target);
    expect(w.over).toBe(true);
    expect(w.winnerTeam).toBe(w.teamOf[me]);
    expect(w.winReason).toBe('domination');
  });

  it('the leader past KEYS.threat is marked dominating, once', () => {
    const [r, id] = nodeOf('domination');
    const w = createWorld(nodeSetup(r, id));
    const me = w.factions.findIndex((f) => f.human);
    empty(w);
    w.keySealUntil = 0;
    for (const k of w.keys) Object.assign(w.nests[k], { owner: me, controller: me, control: 1 });
    let starts = 0;
    for (let t = 0; t < keyTarget(w) / w.keys.length - 30 && !w.over; t++) {
      step(w, []);
      starts += w.fx.filter((e) => e.type === 'domStart').length;
      w.fx = [];
    }
    expect(starts).toBe(1);
    expect(w.domTicks[w.teamOf[me]]).toBeGreaterThanOrEqual(KEYS.threat * keyTarget(w));
  });
  it('an eliminated leader leaves the HUD to the best living scorer', () => {
    const [r, id] = nodeOf('domination');
    const w = createWorld(nodeSetup(r, id));
    const me = w.factions.findIndex((f) => f.human);
    const rival = w.factions.findIndex((f, i) => f.active && i !== me && i !== NEUTRAL && w.teamOf[i] !== w.teamOf[me]);
    w.keyScore[w.teamOf[rival]] = 2000;
    w.keyScore[w.teamOf[me]] = 1500;
    for (const f of w.factions) if (f.team === w.teamOf[rival]) f.eliminated = true;
    expect(dominationStatus(w)?.team).toBe(w.teamOf[me]);
  });

  it('headlines the side soonest to win, not a top scorer that has stopped scoring (#250)', () => {
    const [r, id] = nodeOf('domination');
    const w = createWorld(nodeSetup(r, id));
    const me = w.factions.findIndex((f) => f.human);
    const rival = w.factions.findIndex((f, i) => f.active && i !== me && i !== NEUTRAL && w.teamOf[i] !== w.teamOf[me]);
    empty(w);
    w.keySealUntil = 0;
    for (const k of w.keys) Object.assign(w.nests[k], { owner: me, controller: me, control: 1, contested: false });
    const target = keyTarget(w);
    // The rival is two seconds from winning but holds no key nest; we hold them all.
    w.keyScore[w.teamOf[rival]] = target - 2 * TICK_HZ;
    // Past the threat line, so the sim marks a threat at all.
    w.keyScore[w.teamOf[me]] = Math.round(target * 0.6);
    const ds = dominationStatus(w)!;
    expect(ds.team).toBe(w.teamOf[me]);
    expect(ds.paused).toBeFalsy();
    expect(ds.left).toBe(keyEta(w, w.teamOf[me]));
    // The sim marks the same side as the threat, so bots go after it, not the stalled top scorer.
    run(w, 15);
    expect(w.domTicks[w.teamOf[me]]).toBeGreaterThan(0);
    expect(w.domTicks[w.teamOf[rival]]).toBe(0);
    // The countdown lands on the tick the win does: scores only land on the victory checks.
    const left = dominationStatus(w)!.left;
    run(w, left - 1);
    expect(w.over).toBe(false);
    run(w, 1);
    expect(w.winnerTeam).toBe(w.teamOf[me]);
  });

  it('picks between sides as the sim would (#250)', () => {
    // Nobody scoring: the top scorer; nobody scored: nobody.
    expect(soonestKeyWin([{ score: 10, rate: 0, eta: Infinity }, { score: 30, rate: 0, eta: Infinity }])?.score).toBe(30);
    expect(soonestKeyWin([{ score: 0, rate: 0, eta: Infinity }])).toBeNull();
    // Both cross on the same check (so the same eta): the higher score at that check wins, 80 + 3·15 over 100 + 15.
    const a = { score: 100, rate: 1, eta: 4 }, b = { score: 80, rate: 3, eta: 4 };
    expect(soonestKeyWin([a, b])).toBe(b);
  });

  it('shows the big banner only in a scoring side\'s last stretch (#254)', () => {
    const ds = { team: 0, face: 0, held: 2, need: 3, toBreak: 2, frac: 0.1, keys: true, paused: false };
    expect(dominationBanner(null)).toBe(false);
    expect(dominationBanner({ ...ds, left: KEYS.banner })).toBe(true);
    expect(dominationBanner({ ...ds, left: KEYS.banner + 1 })).toBe(false);
    // Stopped scoring (no key nest held uncontested): gone, however close.
    expect(dominationBanner({ ...ds, left: TICK_HZ, held: 0, paused: true })).toBe(false);
    // Domination by nest share keeps its countdown all the way.
    expect(dominationBanner({ ...ds, keys: undefined, paused: undefined, left: 60 * TICK_HZ })).toBe(true);
  });

  it('as the seal opens, a key nest gets back the guards killed while it was sealed', () => {
    const [r, id] = nodeOf('domination');
    const w = createWorld(nodeSetup(r, id));
    const key = w.nests[w.keys[0]];
    const guards = () => {
      let g = 0;
      for (let i = 0; i < w.n; i++) if (w.alive[i] && w.owner[i] === NEUTRAL && w.wild[i] === 0 && Math.hypot(w.x[i] - key.x, w.y[i] - key.y) <= key.r + 30) g++;
      return g;
    };
    empty(w);
    expect(guards()).toBe(0);
    run(w, KEYS.seal + 2);
    expect(guards()).toBe(key.garrison);
  });

  it('every Domination node gets all its key nests', () => {
    for (let k = 0; k < 20; k++) {
      const r = newRun(`objectives-${k}`, 0, 'swarm', 0);
      for (const n of r.nodes.filter((o) => o.kind === 'domination' && o.domain === undefined)) {
        const setup = nodeSetup(r, n.id);
        expect(generateMap(mapParamsOf(setup)).nests.filter((s) => s.key).length).toBe(setup.keys);
      }
    }
  });
});

describe('key nests: only the side holding the most scores (#255)', () => {
  /** A four-player skirmish Domination (four key nests), emptied and unsealed. */
  function skirmish(): World {
    const players = Array.from({ length: 4 }, (_, i) => ({ faction: i, team: i, human: false, bot: { difficulty: 1, personality: PERSONALITIES[i] } }));
    const w = createWorld(applyMode({ seed: 255, size: 'medium', players }, 'domination'));
    empty(w);
    w.keySealUntil = 0;
    return w;
  }
  const hold = (w: World, k: number, f: number) => Object.assign(w.nests[w.keys[k]], { owner: f, controller: f, control: 1, contested: false });
  const rates = (w: World) => [0, 1, 2, 3].map((t) => keyRate(w, t));

  it('a lone holder scores until a rival ties it, and the side with more takes over', () => {
    const w = skirmish();
    expect(w.keys.length).toBe(4);
    // The edge grab: alone on one key nest, it scores.
    hold(w, 0, 0);
    expect(rates(w)).toEqual([1, 0, 0, 0]);
    run(w, 2 * TICK_HZ);
    const a = w.keyScore[0];
    expect(a).toBeGreaterThan(0);
    // One key nest each: nobody scores, and the HUD shows the leader paused.
    hold(w, 1, 1);
    expect(rates(w)).toEqual([0, 0, 0, 0]);
    expect(keyHeld(w, 0)).toBe(1);
    expect(keyEta(w, 0)).toBe(Infinity);
    run(w, 2 * TICK_HZ);
    expect(w.keyScore[0]).toBe(a);
    expect(w.keyScore[1]).toBe(0);
    expect(dominationStatus(w)).toMatchObject({ team: 0, paused: true });
    // A second key nest: the rival scores on both, the edge holder on none.
    hold(w, 2, 1);
    expect(rates(w)).toEqual([0, 2, 0, 0]);
    run(w, 2 * TICK_HZ);
    expect(w.keyScore[0]).toBe(a);
    expect(w.keyScore[1]).toBeCloseTo(2 * 2 * TICK_HZ, -2);
  });

  it('a contested key nest does not count toward the most', () => {
    const w = skirmish();
    hold(w, 0, 0);
    hold(w, 1, 1);
    hold(w, 2, 1);
    w.nests[w.keys[2]].contested = true;
    expect(keyHeld(w, 1)).toBe(1);
    expect(rates(w)).toEqual([0, 0, 0, 0]);
  });

  it('with three sides: a tie at the top scores nothing, a strict lead scores its count', () => {
    const w = skirmish();
    hold(w, 0, 0);
    hold(w, 1, 0);
    hold(w, 2, 1);
    hold(w, 3, 2);
    expect(rates(w)).toEqual([2, 0, 0, 0]);
    // 2 / 2 / 0: tied at the top.
    hold(w, 3, 1);
    expect(rates(w)).toEqual([0, 0, 0, 0]);
  });

  it('the threat mark follows who scores, not the top score', () => {
    const w = skirmish();
    const target = keyTarget(w);
    w.keyScore[0] = Math.round(target * 0.6);
    hold(w, 0, 0);
    run(w, 15);
    expect(w.domTicks[0]).toBeGreaterThan(0);
    // Tied: nobody scores. The top score stays the headline, but the sim drops it as the threat only once someone else is soonest.
    hold(w, 1, 1);
    hold(w, 2, 1);
    run(w, 15);
    expect(rates(w)).toEqual([0, 2, 0, 0]);
    expect(keyEta(w, 1)).toBeLessThan(Infinity);
    expect(w.domTicks[0]).toBe(0);
  });
});

describe("Conquest's late Bloom surge (#87)", () => {
  it('warns, then sends growing waves of Bloom swarms from the edges, every SURGE.every seconds', () => {
    const [r, id] = nodeOf('conquest');
    const setup = nodeSetup(r, id);
    expect(setup.surge).toBeDefined();
    const w = createWorld(setup);
    const s = w.bloomSurge!;
    expect(s.next).toBe(SURGE.after * TICK_HZ);
    let warned = 0;
    const waves: number[] = [];
    const watch = (ticks: number) => {
      for (let t = 0; t < ticks; t++) {
        step(w, []);
        for (const e of w.fx) {
          if (e.type === 'surgeWarn') warned = w.tick;
          if (e.type === 'bloomSurge') waves.push(e.r);
        }
        w.fx = [];
      }
    };
    // Keep the battle going: nobody wins in the meantime.
    w.endless = true;
    watch(s.next + 1 - w.tick);
    expect(warned).toBeGreaterThan(0);
    expect(SURGE.after * TICK_HZ - warned).toBeGreaterThanOrEqual(SURGE.warn * TICK_HZ - 1);
    expect(waves.length).toBe(SURGE.swarms);
    watch(SURGE.every * TICK_HZ);
    expect(waves.length).toBe(2 * SURGE.swarms);
    expect(waves[SURGE.swarms]).toBeGreaterThan(waves[0]);
  });
});
