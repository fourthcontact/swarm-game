import { keyScores, keyTarget, DOMINATION, NEUTRAL } from '../sim/index';
import type { World } from '../sim/world';

/**
 * How far along to a win the side holding nest `id` is, 0..1, when that nest
 * should throb with it; -1 when it shouldn't. Conquest throbs every nest of
 * the dominating side: holding nests is the win. In Domination only key nests
 * score, so only the key nests that side scores on throb (#260). `key` says
 * whether `id` is a key nest, and `rates` is this frame's keyRates, so a
 * caller drawing every nest works both out once.
 */
export function domThrob(w: World, id: number, key: boolean, rates: ArrayLike<number>): number {
  const n = w.nests[id];
  if (n.owner < 0 || n.owner === NEUTRAL) return -1;
  const t = w.teamOf[n.owner];
  if (w.domTicks[t] <= 0) return -1;
  if (!w.keys.length) return w.domTicks[t] / DOMINATION.ticks;
  return key && keyScores(w, id, rates) ? w.domTicks[t] / keyTarget(w) : -1;
}
