/**
 * A number that climbs (or drops) to its new value (#272): the camp's biomass after a purchase,
 * the debrief's biomass after a battle. Ease-out cubic, so it slows into the final value.
 */

/** Tween `node`'s text from `from` to `to` over `ms`. Returns a function that jumps to the end. */
export function countUp(node: HTMLElement, from: number, to: number, ms = 450): () => void {
  let done = false;
  const t0 = performance.now();
  const finish = () => {
    done = true;
    node.textContent = String(to);
  };
  const step = (now: number) => {
    if (done || !node.isConnected) return;
    const t = Math.min(1, (now - t0) / ms);
    node.textContent = String(Math.round(from + (to - from) * (1 - (1 - t) ** 3)));
    if (t < 1) requestAnimationFrame(step);
    else done = true;
  };
  node.textContent = String(from);
  requestAnimationFrame(step);
  return finish;
}
