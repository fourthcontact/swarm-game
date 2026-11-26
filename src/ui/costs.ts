import { COST, type Brood } from '../campaign/broods';
import { difficultyOf, retriesLeft, retryCost, RUN_DIFFICULTY, type RunState } from '../campaign/run';

/**
 * What a choice costs, said where you make it (#272). Plain text helpers, so tests can check
 * them without a DOM.
 */

/** What losing an unsealed battle costs: a loss seals the node, and only biomass reopens it (#253). */
export function lossNote(run: RunState, id: number): string {
  const left = retriesLeft(run);
  if (left === 0)
    return RUN_DIFFICULTY[difficultyOf(run)].retries === 0
      ? "Lose and it's sealed for good: Brutal allows no retries."
      : "Lose and it's sealed for good: you have no retries left this run.";
  // run.tries only goes up on a retry, so today's price is the price after a loss.
  const tries = left === 1 ? 'your last retry this run' : `${left} retries left this run`;
  return `Lose and it's sealed: fighting here again costs <b>${retryCost(run, id)} biomass</b> (${tries}).`;
}

/** The node card's short form of {@link lossNote}. */
export function lossShort(run: RunState, id: number): string {
  return retriesLeft(run) === 0 ? "Lose and it's sealed for good." : `Lose and it's sealed: a retry costs ${retryCost(run, id)} biomass.`;
}

/** Raising a brood's cap costs more each time (COST.grow). */
export function growNote(): string {
  const at = (grows: number) => COST.grow({ grows } as Brood);
  const step = at(1) - at(0);
  return `Each raise costs ${step} biomass more than the last.`;
}
