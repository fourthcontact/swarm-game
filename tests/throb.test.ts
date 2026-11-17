import { describe, expect, it } from 'vitest';
import { applyMode } from '../src/game/matchSetup';
import { domThrob } from '../src/render/throb';
import { PERSONALITIES } from '../src/sim/ai/bot';
import { DOMINATION, KEYS } from '../src/sim/constants';
import { createWorld } from '../src/sim/setup';
import { keyTarget } from '../src/sim/step';
import type { World } from '../src/sim/world';

// The near-win throb (#260): Conquest throbs every nest of the dominating side,
// Domination only the key nests that side scores on.

function match(mode: 'conquest' | 'domination'): World {
  const players = Array.from({ length: 4 }, (_, i) => ({ faction: i, team: i, human: false, bot: { difficulty: 1, personality: PERSONALITIES[i] } }));
  const w = createWorld(applyMode({ seed: 260, size: 'medium', players }, mode));
  w.keySealUntil = 0;
  return w;
}
const hold = (w: World, id: number, f: number) => Object.assign(w.nests[id], { owner: f, controller: f, control: 1, contested: false });
const throbbing = (w: World) => w.nests.filter((n) => domThrob(w, n.id) >= 0).map((n) => n.id);

describe('near-win throb (#260)', () => {
  it('Conquest: every nest of the dominating side throbs', () => {
    const w = match('conquest');
    expect(w.keys.length).toBe(0);
    const own = w.nests.filter((n) => n.owner === 0).map((n) => n.id);
    expect(own.length).toBeGreaterThan(0);
    expect(throbbing(w)).toEqual([]);
    w.domTicks[w.teamOf[0]] = DOMINATION.ticks / 2;
    expect(throbbing(w)).toEqual(own);
    expect(domThrob(w, own[0])).toBeCloseTo(0.5);
  });

  it('Domination: only the key nests the threat side scores on throb', () => {
    const w = match('domination');
    expect(w.keys.length).toBe(4);
    const [a, b, c, d] = w.keys;
    hold(w, a, 0);
    hold(w, b, 0);
    hold(w, c, 0);
    hold(w, d, 1);
    const t = w.teamOf[0];
    w.keyScore[t] = w.domTicks[t] = Math.round(KEYS.threat * keyTarget(w)) + 1;
    // Its capital and other nests stay still; the rival's key nest too.
    expect(w.nests.some((n) => n.owner === 0 && !w.keys.includes(n.id))).toBe(true);
    expect(throbbing(w)).toEqual([a, b, c]);
    expect(domThrob(w, a)).toBeCloseTo(w.domTicks[t] / keyTarget(w));
    // A contested key nest doesn't score, so it stops throbbing.
    w.nests[c].contested = true;
    expect(throbbing(w)).toEqual([a, b]);
    // The rival now holds more: the threat side scores nothing, and the rival isn't a threat yet.
    hold(w, b, 1);
    hold(w, c, 1);
    expect(throbbing(w)).toEqual([]);
  });
});
