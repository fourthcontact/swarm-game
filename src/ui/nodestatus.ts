/**
 * What a run map node's card says about it, and what it lets you do (#272): plain text and flags,
 * so tests can check them without a DOM. The card itself is preview() in ui/campaign.ts.
 */
import { canRetry, moves, needsBattle, retriesLeft, retryCost, sealedMoves, type RunState } from '../campaign/run';
import { lossShort, retryNote } from './costs';
import { whyNot } from './whynot';

/** The card's status line: where you stand with this node. Empty when there's nothing to add. */
export function nodeStatus(run: RunState, id: number): string {
  if (id === run.at) return 'Your swarm is here, at its camp.';
  if (run.swallowed.includes(id)) return 'Lost to the Bloom.';
  if (run.sealed?.includes(id))
    return sealedMoves(run).includes(id) ? retryNote(run, id).replace(' from the map', '') : '🔒 You lost here: sealed. Only a step away can you pay to fight here again.';
  if (run.visited.includes(id)) return 'Taken: march through without a battle.';
  if (moves(run).includes(id)) return needsBattle(run, id) ? lossShort(run, id) : '';
  return whyNot(run, id);
}

export interface NodeActions {
  /** the move there: a battle, or a march through taken ground; null if you can't go */
  verb: 'Fight' | 'March' | null;
  /** a sealed battle next to you that a retry can reopen, at this price */
  retry: { cost: number; can: boolean } | null;
  /** your own node: open the camp */
  camp: boolean;
}

export function nodeActions(run: RunState, id: number): NodeActions {
  const verb = !moves(run).includes(id) ? null : needsBattle(run, id) ? 'Fight' : 'March';
  const retry = sealedMoves(run).includes(id) && retriesLeft(run) > 0 ? { cost: retryCost(run, id), can: canRetry(run, id) } : null;
  return { verb, retry, camp: id === run.at };
}
