/**
 * What the debrief after a run battle says, and in what order (#272): what matters most first,
 * so a wiped-out brood never sits below "held at 40". Pure, so tests can read it without a DOM;
 * the card itself is ui/debrief.ts.
 */
import type { BroodEvent } from './broods';
import { lossCause } from './defeat';
import { KIND_LABEL } from './kinds';
import { RUN_DIFFICULTY, difficultyOf, type RunNode, type RunState, type TurnResult } from './run';

export type DebriefKind = 'warlord' | 'died' | 'wounded' | 'rescued' | 'veteran' | 'biomass' | 'sealed' | 'checkpoint' | 'minor';

/** The order lines show in: lower first. */
const RANK: Record<DebriefKind, number> = { warlord: 0, died: 1, wounded: 2, rescued: 3, veteran: 4, biomass: 5, sealed: 6, checkpoint: 7, minor: 8 };

/** A sound the line plays as it shows (an AudioEngine method), if any. */
export type DebriefSound = 'domainBroken' | 'broodLost' | 'broodWounded' | 'broodRescued' | 'biomassGained' | 'checkpointReached';

export interface DebriefLine {
  kind: DebriefKind;
  sound?: DebriefSound;
  /** a brood's event (died, wounded, rescued, veteran, minor) */
  event?: BroodEvent;
  /** a warlord's fate */
  warlord?: TurnResult['warlords'][number];
  /** the biomass line: how much, and whether it was pay for a win or salvage from a loss */
  biomass?: { amount: number; label: string };
}

const BROOD_KIND: Record<BroodEvent['what'], DebriefKind> = {
  died: 'died',
  wounded: 'wounded',
  rescued: 'rescued',
  veteran: 'veteran',
  grew: 'minor',
  shrank: 'minor',
  held: 'minor',
  recovered: 'minor',
};
const BROOD_SOUND: Partial<Record<DebriefKind, DebriefSound>> = { died: 'broodLost', wounded: 'broodWounded', rescued: 'broodRescued' };

/** True when the run goes on, the battle was lost, and its node is now sealed (a retry note applies). */
export function sealedHere(run: RunState, node: RunNode, won: boolean, res: TurnResult): boolean {
  return !won && run.status === 'active' && res.checkpoint !== 'restored' && node.id !== run.at;
}

/** Every line of the debrief, most important first; ties keep the order they came in. */
export function debriefLines(run: RunState, node: RunNode, won: boolean, res: TurnResult): DebriefLine[] {
  // A checkpoint restore rewinds the run: what happened to the broods no longer stands.
  if (res.checkpoint === 'restored') return [];
  const lines: DebriefLine[] = [];
  for (const w of res.warlords) lines.push({ kind: 'warlord', warlord: w, sound: w.what === 'broken' ? 'domainBroken' : undefined });
  for (const e of res.events) {
    const kind = BROOD_KIND[e.what];
    lines.push({ kind, event: e, sound: BROOD_SOUND[kind] });
  }
  if (res.biomass > 0) lines.push({ kind: 'biomass', sound: 'biomassGained', biomass: { amount: res.biomass, label: won ? 'biomass' : 'biomass salvaged' } });
  if (sealedHere(run, node, won, res)) lines.push({ kind: 'sealed' });
  if (res.checkpoint === 'reached') lines.push({ kind: 'checkpoint', sound: 'checkpointReached' });
  return lines.map((l, i) => ({ l, i })).sort((a, b) => RANK[a.l.kind] - RANK[b.l.kind] || a.i - b.i).map((x) => x.l);
}

/** The debrief's heading and summary. Biomass isn't in the summary: it has its own line. */
export function debriefTitle(run: RunState, node: RunNode, won: boolean, res: TurnResult): { title: string; text: string } {
  if (res.checkpoint === 'restored')
    return { title: 'Back to the checkpoint', text: 'Your swarm was finished, but the checkpoint holds: the run resumes from there. It only saves you once.' };
  if (run.status === 'won') return { title: 'Run complete', text: `The Bloom's heart is destroyed. ${run.turn} turns, ${run.biomass} biomass gathered.` };
  if (run.status === 'lost') return { title: 'Run lost', text: lossCause(run) };
  if (won) return { title: 'Territory taken', text: `${res.warlords.some((w) => w.what === 'broken') ? 'Citadel taken' : `${KIND_LABEL[node.kind]} won`}.` };
  const heart = node.kind === 'finale' && run.heartWound ? ` The heart bears its wounds: ${Math.round(100 * run.heartWound)}% of its life is gone.` : '';
  const bloom = RUN_DIFFICULTY[difficultyOf(run)].lossStep < 1 ? 'The Bloom slows, but still advances.' : 'The Bloom advances anyway.';
  return { title: 'Driven back', text: `Your swarm falls back.${heart} ${bloom}` };
}
