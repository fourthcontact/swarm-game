import { describe, expect, it } from 'vitest';
import { ARMY_GOAL, campLines, campVisit, fieldedCap, growPlan, pickBroods, spend, wishCost, wishCostOld } from '../scripts/balance/camp';
import { BROOD_PROD } from '../src/campaign/battle';
import { COST } from '../src/campaign/broods';
import { newRun } from '../src/campaign/run';

describe('balance harness camp policy (#96, #276)', () => {
  it('aims for the army where the production bonus tops out', () => {
    expect(BROOD_PROD.ref + (BROOD_PROD.max - 1) / BROOD_PROD.per).toBeCloseTo(ARMY_GOAL);
  });

  it('plans grows on the smallest fielded cap first, up to the goal', () => {
    const run = newRun('camp-plan', 0, 'swarm', 0);
    const start = fieldedCap(run);
    const plan = growPlan(run);
    expect(plan.length).toBe(Math.ceil((ARMY_GOAL - start) / COST.growBy));
    // Equal caps take turns by id, so each brood's price rises one step per round.
    const ids = pickBroods(run).sort((a, b) => a - b);
    expect(plan.slice(0, ids.length).map((g) => g.id)).toEqual(ids);
    expect(plan[0].cost).toBe(COST.grow(run.broods.find((b) => b.id === plan[0].id)!));
    expect(plan[ids.length].cost).toBeGreaterThan(plan[0].cost);
    // Planning buys nothing.
    expect(fieldedCap(run)).toBe(start);
  });

  it("'army' grows the fielded broods to the goal before unlocking, and logs what it spent", () => {
    const run = newRun('camp-army', 0, 'swarm', 0);
    const plan = growPlan(run).reduce((s, g) => s + g.cost, 0);
    run.biomass = plan;
    const bought: Record<string, number> = {}, spent: Record<string, number> = {};
    spend(run, bought, 'army', spent);
    expect(fieldedCap(run)).toBeGreaterThanOrEqual(ARMY_GOAL);
    expect(spent.grow).toBe(plan);
    expect(spent.unlock).toBeUndefined();
    expect(run.biomass).toBe(0);
  });

  it("'old' still grows only the biggest brood, and only near its cap", () => {
    const run = newRun('camp-old', 0, 'swarm', 0);
    run.biomass = 1000;
    for (const b of run.broods) b.size = b.cap - 6;
    const bought: Record<string, number> = {};
    spend(run, bought, 'old');
    expect(bought.grow).toBeUndefined();
    expect(Object.keys(bought).some((k) => k.startsWith('unlock'))).toBe(true);
  });

  it('flags camp visits that cover everything, or nothing', () => {
    const run = newRun('camp-visit', 0, 'swarm', 0);
    run.biomass = wishCost(run);
    expect(campVisit(run, 0.5)).toMatchObject({ all: true, none: false, army: fieldedCap(run) });
    // The grows to the goal cost more than one grow per brood.
    expect(wishCost(run)).toBeGreaterThan(wishCostOld(run));
    run.biomass = 0;
    expect(campVisit(run, 0.5)).toMatchObject({ all: false, allOld: false, none: true });
    const lines = campLines([{ camps: [campVisit(run, 0.1), campVisit(run, 0.9)] }]);
    expect(lines).toHaveLength(3);
    expect(lines[2]).toContain('last third (1 visits)');
  });
});
