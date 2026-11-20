// Why a node's card offers no move there (#273), once it's not your camp, not
// swallowed, not sealed and not taken.
import { reachable, type RunState } from '../campaign/run';

export function whyNot(run: RunState, id: number): string {
  // Linked to where you stand, but a new battle only lies ahead (#128).
  if (run.nodes[run.at].links.includes(id)) return 'Behind you: new battles lie only ahead, toward the heart.';
  // Every node can be reached at the start (#273), so this one was, until you moved on or the Bloom cut it off.
  if (reachable(run)?.has(id) === false) return 'Out of reach: your swarm has moved past it.';
  return 'Not next to your swarm.';
}
