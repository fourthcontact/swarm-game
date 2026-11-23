// Why a node's card offers no move there (#273). It says "behind you" only of a
// node that's really just behind you: an open battle, linked to where you stand,
// not ahead of it. Other closed nodes (your camp, swallowed, sealed, taken) have
// their own lines on the card, which checks them first.
import { ahead, needsBattle, reachable, type RunState } from '../campaign/run';

export function whyNot(run: RunState, id: number): string {
  const behind =
    run.status === 'active' &&
    needsBattle(run, id) &&
    !run.swallowed.includes(id) &&
    !run.sealed?.includes(id) &&
    run.nodes[run.at].links.includes(id) &&
    !ahead(run.nodes, run.heart, run.at, id);
  // A new battle only lies ahead (#128).
  if (behind) return 'Behind you: new battles lie only ahead, toward the heart.';
  // Every node can be reached at the start (#273), so this one was, until you moved on or the Bloom cut it off.
  if (reachable(run)?.has(id) === false) return 'Out of reach: your swarm has moved past it.';
  return 'Not next to your swarm.';
}
