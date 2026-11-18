/**
 * Fight a lost battle again (#253): shown after a loss, before it's applied.
 * Paying biomass restarts the same battle; declining takes the loss as before.
 */

import { RUN_DIFFICULTY, difficultyOf, retriesLeft, retryCost, type RunState } from '../campaign/run';
import { el, esc } from './dom';

export function retryOffer(run: RunState, id: number, h: { again: () => void; accept: () => void }): HTMLDivElement {
  const rules = RUN_DIFFICULTY[difficultyOf(run)];
  const cost = retryCost(run, id);
  const left = retriesLeft(run);
  const keep = rules.lossKeep === 0.5 ? 'halved' : `cut to ${Math.round(rules.lossKeep * 100)}%`;
  const bloom = rules.holdOnLoss ? 'the Bloom waits' : 'the Bloom advances';
  const m = el(`
    <div class="screen modal dim">
      <div class="card brief run-debrief lose run-retry">
        <div class="eyebrow">${esc(run.seedText)} · turn ${run.turn}</div>
        <h2>Driven back</h2>
        <p>Fight this battle again from the start, with the same broods, for <b>${cost} biomass</b>? You have ${run.biomass}.</p>
        <p class="hint">${left === 1 ? 'This is your last retry this run.' : `${left} retries left this run.`} Each retry of the same battle costs more.</p>
        <p class="hint">Or take the loss: the broods you fielded are wounded and ${keep}, and ${bloom}.</p>
        <div class="row end">
          <button data-a="accept">Take the loss</button>
          <button class="primary" data-a="again">Fight again · ${cost}</button>
        </div>
      </div>
    </div>`);
  m.querySelector('[data-a=again]')!.addEventListener('click', h.again);
  m.querySelector('[data-a=accept]')!.addEventListener('click', h.accept);
  return m;
}
