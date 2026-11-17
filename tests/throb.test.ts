import { describe, expect, it } from 'vitest';
import { applyMode } from '../src/game/matchSetup';
import { domThrob } from '../src/render/throb';
import { PERSONALITIES } from '../src/sim/ai/bot';
import { DOMINATION, KEYS } from '../src/sim/constants';
import { createWorld } from '../src/sim/setup';
import { keyRates, keyScores, keyTarget } from '../src/sim/step';
import type { World } from '../src/sim/world';

// The near-win throb (#260): Conquest throbs every nest of the dominating side,
// Domination only the key nests that side scores on. The key-nest diamond beats
// on the same rule (keyScores).

/** Four factions; `teams` gives each one's team (default: every faction alone). */
function match(mode: 'conquest' | 'domination', teams = [0, 1, 2, 3]): World {
  const players = teams.map((team, i) => ({ faction: i, team, human: false, bot: { difficulty: 1, personality: PERSONALITIES[i] } }));
  const w = createWorld(applyMode({ seed: 260, size: 'medium', players }, mode));
  w.keySealUntil = 0;
  return w;
}
const hold = (w: World, id: number, f: number) => Object.assign(w.nests[id], { owner: f, controller: f, control: 1, contested: false });
const throbbing = (w: World) => {
  const rates = keyRates(w).slice();
  return w.nests.filter((n) => domThrob(w, n.id, w.keys.includes(n.id), rates) >= 0).map((n) => n.id);
};
const scoring = (w: World) => w.keys.filter((k) => keyScores(w, k)).sort((a, b) => a - b);
const sorted = (ids: number[]) => [...ids].sort((a, b) => a - b);
/** Mark faction `f`'s team past the threat line, as the sim does. */
function threat(w: World, f: number): void {
  const t = w.teamOf[f];
  w.keyScore[t] = w.domTicks[t] = Math.round(KEYS.threat * keyTarget(w)) + 1;
}

describe('near-win throb (#260)', () => {
  it('Conquest: every nest of the dominating side throbs', () => {
    const w = match('conquest');
    expect(w.keys.length).toBe(0);
    const own = w.nests.filter((n) => n.owner === 0).map((n) => n.id);
    expect(own.length).toBeGreaterThan(0);
    expect(throbbing(w)).toEqual([]);
    w.domTicks[w.teamOf[0]] = DOMINATION.ticks / 2;
    expect(throbbing(w)).toEqual(own);
    expect(domThrob(w, own[0], false, keyRates(w))).toBeCloseTo(0.5);
  });

  it('Domination: only the key nests the threat side scores on throb', () => {
    const w = match('domination');
    expect(w.keys.length).toBe(4);
    const [a, b, c, d] = w.keys;
    hold(w, a, 0);
    hold(w, b, 0);
    hold(w, c, 0);
    hold(w, d, 1);
    threat(w, 0);
    // Its capital and other nests stay still; the rival's key nest too.
    expect(w.nests.some((n) => n.owner === 0 && !w.keys.includes(n.id))).toBe(true);
    expect(throbbing(w)).toEqual(sorted([a, b, c]));
    expect(domThrob(w, a, true, keyRates(w))).toBeCloseTo(w.domTicks[w.teamOf[0]] / keyTarget(w));
    // A contested key nest doesn't score, so it stops throbbing.
    w.nests[c].contested = true;
    expect(throbbing(w)).toEqual(sorted([a, b]));
    // The rival now holds more: the threat side scores nothing, and the rival isn't a threat yet.
    hold(w, b, 1);
    hold(w, c, 1);
    expect(throbbing(w)).toEqual([]);
  });

  it('a tie at the top throbs nothing, though the threat mark stands', () => {
    const w = match('domination');
    const [a, b, c, d] = w.keys;
    hold(w, a, 0);
    hold(w, b, 0);
    hold(w, c, 1);
    hold(w, d, 1);
    threat(w, 0);
    expect(w.domTicks[w.teamOf[0]]).toBeGreaterThan(0);
    expect(throbbing(w)).toEqual([]);
  });

  it('a team throbs every key nest its members score on', () => {
    // 0 and 1 against 2 and 3.
    const w = match('domination', [0, 0, 1, 1]);
    const [a, b, c] = w.keys;
    hold(w, a, 0);
    hold(w, b, 1);
    hold(w, c, 2);
    threat(w, 1);
    expect(throbbing(w)).toEqual(sorted([a, b]));
  });
});

describe('the key-nest diamond beats only where its holder scores (#260)', () => {
  it('a key held by a side that holds fewer does not count as scoring', () => {
    const w = match('domination');
    const [a, b, c, d] = w.keys;
    hold(w, a, 0);
    hold(w, b, 0);
    hold(w, c, 0);
    hold(w, d, 1);
    expect(scoring(w)).toEqual(sorted([a, b, c]));
    // 2-2: nobody scores.
    hold(w, c, 1);
    expect(scoring(w)).toEqual([]);
  });
});
