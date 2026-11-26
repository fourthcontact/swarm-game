import { COST, type Brood } from '../campaign/broods';
import { difficultyOf, retriesLeft, retryCost, RUN_DIFFICULTY, type RunState } from '../campaign/run';

/**
 * What a choice costs, said where you make it (#272). Plain text helpers, so tests can check
 * them without a DOM.
 */

/**
 * The run as it will be once the retry at a sealed node is paid (#253): one retry fewer, and
 * this node's next retry dearer. An unsealed node is unchanged.
 */
function afterPay(run: RunState, id: number): RunState {
  if (!run.sealed?.includes(id)) return run;
  return { ...run, retried: (run.retried ?? 0) + 1, tries: { ...run.tries, [id]: (run.tries?.[id] ?? 0) + 1 } };
}

/** What losing a battle costs: a loss seals the node, and only biomass reopens it (#253). On a retry, the price after paying it. */
export function lossNote(at: RunState, id: number): string {
  const run = afterPay(at, id);
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

/** What it takes to fight at a lost battle's node again (#253). */
export function retryNote(run: RunState, id: number): string {
  const left = retriesLeft(run);
  const cost = retryCost(run, id);
  if (left === 0)
    return RUN_DIFFICULTY[difficultyOf(run)].retries === 0
      ? '🔒 This battle is sealed. Brutal allows no retries: find another way to the heart.'
      : '🔒 This battle is sealed, and your retries are spent: find another way to the heart.';
  const tries = left === 1 ? 'your last retry this run' : `${left} retries left this run`;
  return `🔒 This battle is sealed. To fight here again, pay <b>${cost} biomass</b> from the map (${tries}). You have ${run.biomass}.`;
}

/** Raising a brood's cap costs more each time (COST.grow). */
export function growNote(): string {
  const at = (grows: number) => COST.grow({ grows } as Brood);
  const step = at(1) - at(0);
  return `Each raise costs ${step} biomass more than the last.`;
}
