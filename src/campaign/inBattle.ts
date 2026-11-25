/**
 * A run battle under way (#266). The run saves the battle as it starts, so
 * closing or reloading the page mid-battle can't undo it: resuming the run
 * settles that battle first. Pure: main.ts saves the run around these.
 */

import type { BattleReport } from './broods';
import { resolveTurn, type RunState, type TurnResult } from './run';

/** No one is left on the field when you walk away: a battle you left settles as a retreat. */
export const RETREAT: BattleReport = { won: false, survivors: [0, 0, 0, 0], nests: 0, seconds: 0 };

/** A battle starts: mark it on the run. */
export function startBattle(run: RunState, id: number, fielded: number[]): void {
  run.fighting = { node: id, fielded: [...fielded], turn: run.turn };
}

/**
 * How the battle stands, kept on the marker: its result as soon as it's
 * decided (the debrief waits out the victory pause, and a page closed in it
 * still counts the win), or a retreat as the page hides, with the finale's
 * heart damage, as Retreat from the pause menu would count it.
 */
export function noteBattle(run: RunState, report: BattleReport): void {
  if (run.fighting) run.fighting.report = report;
}

/** The battle a resumed run left, if any. A marker from an earlier turn is stale and ignored. */
export const abandoned = (run: RunState): RunState['fighting'] | null =>
  run.status === 'active' && run.fighting && run.fighting.turn === run.turn ? run.fighting : null;

/** Settle the battle the page closed on: as it was noted, else as a retreat. Null if there was none. */
export function settleAbandoned(run: RunState, now = Date.now()): TurnResult | null {
  const f = abandoned(run);
  if (!f) {
    delete run.fighting;
    return null;
  }
  return resolveTurn(run, f.node, f.report ?? RETREAT, f.fielded, now);
}

/**
 * Another page settled this battle while this one fought it: two tabs on one
 * run. The saved run has moved on a turn, so this page's result is dropped
 * rather than saved over it.
 */
export const settledElsewhere = (saved: RunState | null, run: RunState): boolean => !!saved && saved.turn !== run.turn;
