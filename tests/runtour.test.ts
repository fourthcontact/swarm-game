import { describe, expect, it } from 'vitest';
import type { BattleReport } from '../src/campaign/broods';
import { DIFFICULTIES, MAP_H, MAP_W, moves, newRun, resolveTurn, type RunState } from '../src/campaign/run';
import { CAMP_HINT, GLOSSARY, TOUR, loadGuide, saveGuide, stepText, stepsFor, tourFor, tourWarlord, wantsCampHint, wantsTour } from '../src/campaign/tour';

const WIN: BattleReport = { won: true, survivors: [30, 12, 12, 12], nests: 6, seconds: 200 };

const finite = (...v: number[]) => v.every(Number.isFinite);

describe('map tour (#217)', () => {
  const runs: RunState[] = [];
  for (const d of DIFFICULTIES) for (const seed of ['alpha', 'beta', 'gamma', 'delta', 'epsilon']) runs.push(newRun(`${seed}-${d}`, 0, 'swarm', 0, d));

  it('every step looks somewhere on the map and rings real places', () => {
    for (const run of runs) {
      const steps = tourFor(run);
      expect(steps.length).toBeGreaterThanOrEqual(7);
      for (const s of steps) {
        const f = s.focus(run);
        expect(finite(f.x, f.y), `${run.seedText} ${s.id}`).toBe(true);
        expect(f.x).toBeGreaterThanOrEqual(0);
        expect(f.x).toBeLessThanOrEqual(MAP_W);
        expect(f.y).toBeGreaterThanOrEqual(0);
        expect(f.y).toBeLessThanOrEqual(MAP_H);
        if (f.span !== null) expect(f.span).toBeGreaterThan(0);
        for (const m of s.marks?.(run) ?? []) expect(finite(m.x, m.y, m.r) && m.r > 0, `${run.seedText} ${s.id}`).toBe(true);
        const sel = s.select?.(run);
        if (sel !== undefined && sel !== null) expect(run.nodes[sel]).toBeDefined();
        for (const id of s.peek?.(run) ?? []) expect(run.nodes[id]).toBeDefined();
        expect(stepText(s, run).length).toBeGreaterThan(20);
      }
    }
  });

  it('the moving step opens a node you can move to', () => {
    for (const run of runs) {
      const s = TOUR.find((t) => t.id === 'moves')!;
      expect(moves(run)).toContain(s.select!(run));
    }
  });

  it('skips the warlord steps on a run without warlords (older saves)', () => {
    const run = newRun('nolords', 0, 'swarm', 0);
    run.warlords = undefined;
    expect(tourWarlord(run)).toBeNull();
    const ids = tourFor(run).map((s) => s.id);
    expect(ids).not.toContain('warlord');
    expect(ids).not.toContain('stronghold');
    for (const s of tourFor(run)) expect(finite(s.focus(run).x, s.focus(run).y)).toBe(true);
  });

  it('a broken warlord is not toured', () => {
    const run = newRun('broken', 0, 'swarm', 0);
    for (const w of run.warlords ?? []) w.broken = true;
    expect(tourWarlord(run)).toBeNull();
  });

  it('the glossary covers the campaign terms', () => {
    const terms = GLOSSARY.map((g) => g.term.toLowerCase()).join(' ');
    for (const t of ['bloom', 'warlord', 'stronghold', 'brood', 'strain', 'camp', 'reward']) expect(terms).toContain(t);
  });
});

describe('tour seen (#217)', () => {
  it('opens on a first run until seen, never later in a run', () => {
    const mem = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    try {
      const run = newRun('seen', 0, 'swarm', 0);
      expect(loadGuide().toured).toBe(false);
      expect(wantsTour(run)).toBe(true);
      saveGuide({ toured: true, campHinted: false });
      expect(loadGuide().toured).toBe(true);
      expect(wantsTour(run)).toBe(false);
      saveGuide({ toured: false, campHinted: false });
      resolveTurn(run, moves(run)[0], WIN, run.fielded, 0);
      expect(wantsTour(run)).toBe(false);
      mem.set('swarm.runGuide', '{not json');
      expect(loadGuide().toured).toBe(false);
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
});

describe('camp reminder (#251)', () => {
  const withStorage = (f: (mem: Map<string, string>) => void) => {
    const mem = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    try {
      f(mem);
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  };

  it('waits for the first return to the map with biomass, then shows once', () =>
    withStorage(() => {
      const run = newRun('camp-hint', 0, 'swarm', 0);
      expect(wantsCampHint(run)).toBe(false); // turn 0: the main tour's turn
      resolveTurn(run, moves(run)[0], WIN, run.fielded, 0);
      expect(run.biomass).toBeGreaterThan(0);
      expect(wantsCampHint(run)).toBe(true);
      // Skipping the main tour doesn't skip the reminder.
      saveGuide({ toured: true, campHinted: false });
      expect(wantsCampHint(run)).toBe(true);
      saveGuide({ toured: true, campHinted: true });
      expect(wantsCampHint(run)).toBe(false);
      saveGuide({ toured: false, campHinted: false });
      run.biomass = 0;
      expect(wantsCampHint(run)).toBe(false);
    }));

  it('an older save without the flag still loads, and keeps toured', () =>
    withStorage((mem) => {
      mem.set('swarm.runGuide', JSON.stringify({ toured: true }));
      expect(loadGuide()).toEqual({ toured: true, campHinted: false });
    }));

  it('quotes the run’s live numbers', () => {
    const run = newRun('camp-numbers', 0, 'swarm', 0);
    resolveTurn(run, moves(run)[0], WIN, run.fielded, 0);
    run.biomass = 87;
    run.broods[0].wounded = 3;
    const [earned, heal, unlocks] = CAMP_HINT.map((s) => stepText(s, run));
    expect(earned).toContain('87 biomass');
    expect(heal).toContain('One of your broods is wounded');
    expect(unlocks).toMatch(/nest type costs \d+ now/);
    expect(stepsFor('camp', run)).toBe(CAMP_HINT);
    expect(stepsFor('map', run).map((s) => s.id)).toEqual(tourFor(run).map((s) => s.id));
    for (const s of CAMP_HINT) {
      const f = s.focus(run);
      expect(finite(f.x, f.y)).toBe(true);
    }
    // Every nest and Nova unlocked: no prices left to quote for them.
    run.unlocks = { nests: ~0, nova: true };
    expect(stepText(CAMP_HINT[2], run)).toContain('Every nest type is unlocked');
    expect(stepText(CAMP_HINT[2], run)).not.toContain('Nova');
  });
});
