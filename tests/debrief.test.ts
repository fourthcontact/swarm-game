import { describe, expect, it } from 'vitest';
import type { BattleReport, BroodEvent } from '../src/campaign/broods';
import { debriefLines, debriefTitle } from '../src/campaign/debrief';
import { moves, newRun, resolveTurn, type RunState, type TurnResult } from '../src/campaign/run';

const WIN: BattleReport = { won: true, survivors: [30, 12, 12, 12], nests: 6, seconds: 200 };
const LOSS: BattleReport = { won: false, survivors: [0, 0, 0, 0], nests: 0, seconds: 300 };

const ev = (name: string, what: BroodEvent['what']): BroodEvent => ({ name, kind: 0, what, size: 10 });
const res = (over: Partial<TurnResult>): TurnResult => ({ fresh: [], events: [], biomass: 0, warlords: [], ...over });
const kinds = (run: RunState, won: boolean, r: TurnResult, node = moves(run)[0]) => debriefLines(run, run.nodes[node], won, r).map((l) => l.kind);

describe('the debrief (#272)', () => {
  it('puts what matters first: a warlord, then losses, wounds and rescues, then biomass, then the small changes', () => {
    const run = newRun('debrief', 0, 'swarm', 0);
    const r = res({
      events: [ev('a', 'held'), ev('b', 'grew'), ev('c', 'wounded'), ev('d', 'died'), ev('e', 'veteran'), ev('f', 'rescued')],
      biomass: 30,
      warlords: [{ id: 0, what: 'eaten' }],
      checkpoint: 'reached',
    });
    expect(kinds(run, true, r)).toEqual(['warlord', 'died', 'wounded', 'rescued', 'veteran', 'biomass', 'checkpoint', 'minor', 'minor']);
  });

  it('keeps the order events came in when they rank the same', () => {
    const run = newRun('debrief', 0, 'swarm', 0);
    const r = res({ events: [ev('x', 'held'), ev('y', 'died'), ev('z', 'grew'), ev('w', 'died')] });
    expect(debriefLines(run, run.nodes[moves(run)[0]], true, r).map((l) => l.event!.name)).toEqual(['y', 'w', 'x', 'z']);
  });

  it('gives each line that matters its sound', () => {
    const run = newRun('debrief', 0, 'swarm', 0);
    const r = res({ events: [ev('a', 'died'), ev('b', 'held')], biomass: 5, warlords: [{ id: 0, what: 'broken' }] });
    expect(debriefLines(run, run.nodes[moves(run)[0]], true, r).map((l) => l.sound)).toEqual(['domainBroken', 'broodLost', 'biomassGained', undefined]);
  });

  it('shows biomass as its own line: pay for a win, salvage for a loss, none when nothing came in', () => {
    const run = newRun('debrief', 0, 'swarm', 0);
    const node = run.nodes[moves(run)[0]];
    expect(debriefLines(run, node, true, res({ biomass: 40 })).find((l) => l.kind === 'biomass')?.biomass).toEqual({ amount: 40, label: 'biomass' });
    expect(debriefLines(run, node, false, res({ biomass: 12 })).find((l) => l.kind === 'biomass')?.biomass).toEqual({ amount: 12, label: 'biomass salvaged' });
    expect(kinds(run, true, res({ biomass: 0 }))).not.toContain('biomass');
    // It is no longer repeated in the summary.
    expect(debriefTitle(run, node, true, res({ biomass: 40 })).text).not.toContain('biomass');
  });

  it('notes a sealed battle only when a lost one is left behind, not on a win or where you stand', () => {
    const run = newRun('debrief-seal', 0, 'swarm', 0);
    const target = moves(run)[0];
    const r = resolveTurn(run, target, LOSS, run.fielded, 0);
    expect(run.status).toBe('active');
    expect(run.at).not.toBe(target);
    expect(kinds(run, false, r, target)).toContain('sealed');
    expect(debriefTitle(run, run.nodes[target], false, r).title).toBe('Driven back');

    const won = newRun('debrief-win', 0, 'swarm', 0);
    const there = moves(won)[0];
    const w = resolveTurn(won, there, WIN, won.fielded, 0);
    expect(kinds(won, true, w, there)).not.toContain('sealed');
    expect(debriefTitle(won, won.nodes[there], true, w).title).toBe('Territory taken');
    // Lost where you stand (a run that ended on the map): nothing to retry from here.
    expect(kinds(won, false, res({}), won.at)).not.toContain('sealed');
  });

  it('after a checkpoint restore, says so and lists no brood changes', () => {
    const run = newRun('debrief', 0, 'swarm', 0);
    const node = run.nodes[moves(run)[0]];
    const r = res({ events: [ev('a', 'died')], biomass: 10, checkpoint: 'restored' });
    expect(debriefLines(run, node, false, r)).toEqual([]);
    expect(debriefTitle(run, node, false, r).title).toBe('Back to the checkpoint');
  });
});
