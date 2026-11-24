// The camp in whole-run probes (#96): what a simple player buys between
// battles, and the economy measures the probes log. 'old' is the policy from
// #68; 'army' knows that a bigger army spawns faster (#276) and grows the
// fielded broods first. No Node imports, so tests can use it.
import { BROOD_PROD, LONE_WOLF } from '../../src/campaign/battle';
import { COST, KIND_NEST, UNLOCKS, fit, type Brood, type Unlock } from '../../src/campaign/broods';
import { grow, heal, maxFielded, unlock, unlockCost, unlocked, wayOn, type RunState } from '../../src/campaign/run';

export type CampPolicy = 'old' | 'army';

/** The broods to field: the biggest fit ones. */
export function pickBroods(run: RunState): number[] {
  return run.broods
    .filter(fit)
    .sort((a, b) => b.size - a.size || a.id - b.id)
    .slice(0, maxFielded(run))
    .map((b) => b.id);
}

export interface Camp {
  t: number;
  banked: number;
  /** the bank covered everything a player could want here (wishCost) */
  all: boolean;
  /** the same, against the wish list from before #276 (one grow per brood) */
  allOld: boolean;
  /** the bank covered nothing on the wish list (the floor: prices mustn't overshoot) */
  none: boolean;
  /** the fielded broods' caps (#276: production rises with the army, to ARMY_GOAL) */
  army: number;
  /** biomass spent here, by what bought (heal, grow, unlock, retry) */
  spent: Record<string, number>;
}

/** The army where #276's production bonus stops rising: ×BROOD_PROD.max. */
export const ARMY_GOAL = BROOD_PROD.ref + Math.round((BROOD_PROD.max - 1) / BROOD_PROD.per);

/** The dots the broods we'd field could reach at their caps (Lone wolf fights LONE_WOLF times its one brood). */
export function fieldedCap(run: RunState): number {
  const scale = run.perks.includes('lone-wolf') ? LONE_WOLF : 1;
  return run.broods.filter((b) => pickBroods(run).includes(b.id)).reduce((s, b) => s + b.cap * scale, 0);
}

/**
 * The grows a player who knows #276 would buy: the smallest fielded cap
 * (tiebreak by id) until the fielded caps reach ARMY_GOAL. Each entry is the
 * brood and that grow's price; nothing is bought.
 */
export function growPlan(run: RunState): { id: number; cost: number }[] {
  const scale = run.perks.includes('lone-wolf') ? LONE_WOLF : 1;
  const ids = pickBroods(run);
  const bs = run.broods.filter((b) => ids.includes(b.id)).map((b) => ({ ...b }));
  const plan: { id: number; cost: number }[] = [];
  let army = bs.reduce((s, b) => s + b.cap * scale, 0);
  while (bs.length && army < ARMY_GOAL && plan.length < 40) {
    const b = bs.reduce((a, c) => (c.cap < a.cap || (c.cap === a.cap && c.id < a.id) ? c : a));
    plan.push({ id: b.id, cost: COST.grow(b as Brood) });
    b.cap += COST.growBy;
    b.grows++;
    army += COST.growBy * scale;
  }
  return plan;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const healCost = (run: RunState) => run.broods.filter((b) => b.wounded).length * COST.heal;
const unlocksLeft = (run: RunState) => [...UNLOCKS, 'nova' as Unlock].filter((u) => !unlocked(run, u));

/** Everything a player could want at camp (#96, #276): heal every wounded brood, every unlock left, the grows to ARMY_GOAL. */
export function wishCost(run: RunState): number {
  return healCost(run) + sum(unlocksLeft(run).map((u) => unlockCost(run, u))) + sum(growPlan(run).map((g) => g.cost));
}

/** The wish list from before #276: one grow per brood in place of the grows to ARMY_GOAL. */
export function wishCostOld(run: RunState): number {
  return healCost(run) + sum(unlocksLeft(run).map((u) => unlockCost(run, u))) + run.broods.reduce((s, b) => s + COST.grow(b), 0);
}

/** The cheapest thing on the wish list, or Infinity when it's empty. */
export function cheapestWish(run: RunState): number {
  const prices = [...(run.broods.some((b) => b.wounded) ? [COST.heal] : []), ...unlocksLeft(run).map((u) => unlockCost(run, u)), ...growPlan(run).slice(0, 1).map((g) => g.cost)];
  return prices.length ? Math.min(...prices) : Infinity;
}

/** A camp visit as the probes log it, before spending. */
export function campVisit(run: RunState, t: number): Camp {
  return { t, banked: run.biomass, all: run.biomass >= wishCost(run), allOld: run.biomass >= wishCostOld(run), none: run.biomass < cheapestWish(run), army: fieldedCap(run), spent: {} };
}

/**
 * Camp: heal when short of fit broods, then (policy 'army', #276) grow the
 * fielded broods toward ARMY_GOAL, then unlock what our broods' kinds need
 * (then Nova), then (policy 'old') grow the biggest brood's cap.
 * `spent` adds up the biomass by what it bought.
 */
export function spend(run: RunState, bought: Record<string, number>, policy: CampPolicy = 'old', spent: Record<string, number> = {}): void {
  // Like a player heeding the camp's warning (#253): keep a retry's price when it's the only way on.
  const keep = wayOn(run).reserve;
  run.biomass -= keep;
  try {
    shop(run, bought, policy, spent);
  } finally {
    run.biomass += keep;
  }
}

function shop(run: RunState, bought: Record<string, number>, policy: CampPolicy, spent: Record<string, number>): void {
  const buy = (what: string, pay: () => boolean) => {
    const before = run.biomass;
    if (!pay()) return false;
    bought[what] = (bought[what] ?? 0) + 1;
    const cat = what.split(' ')[0];
    spent[cat] = (spent[cat] ?? 0) + before - run.biomass;
    return true;
  };
  for (const b of run.broods) if (b.wounded && run.broods.filter(fit).length < maxFielded(run)) buy('heal', () => heal(run, b.id));
  if (policy === 'army') for (let g = growPlan(run)[0]; g && buy('grow', () => grow(run, g.id)); g = growPlan(run)[0]);
  const wanted: Unlock[] = [...new Set(run.broods.map((b) => KIND_NEST[b.kind]))].filter((t) => UNLOCKS.includes(t));
  for (const u of [...wanted, 'nova' as Unlock, ...UNLOCKS]) if (!unlocked(run, u) && run.biomass >= unlockCost(run, u) + 10) buy(`unlock ${u}`, () => unlock(run, u));
  if (policy === 'army') return;
  const big = [...run.broods].sort((a, b) => b.size - a.size)[0];
  while (big && big.size >= big.cap - 2 && run.biomass >= COST.grow(big) + 30 && buy('grow', () => grow(run, big.id)));
}

const pct = (x: number) => `${(100 * x).toFixed(0)}%`;
const avg = (xs: number[]) => (xs.length ? sum(xs) / xs.length : NaN);

/**
 * The camp economy by third of the run (#96): spending should still be a
 * choice in the last third. Per third: biomass banked, the share of visits
 * that could buy everything (now, and on the wish list from before #276), that
 * could buy nothing on it, the fielded broods' caps, and biomass spent per visit
 * by what it bought.
 */
export function campLines(os: { camps: Camp[] }[]): string[] {
  const camps = os.flatMap((o) => o.camps);
  const share = (cs: typeof camps, f: (c: (typeof camps)[number]) => boolean) => pct(cs.filter(f).length / Math.max(1, cs.length));
  return [0, 1, 2].map((k) => {
    const cs = camps.filter((c) => Math.min(2, Math.floor(c.t * 3)) === k);
    const cats = [...new Set(cs.flatMap((c) => Object.keys(c.spent)))].sort();
    const spent = cats.map((cat) => `${cat} ${avg(cs.map((c) => c.spent[cat] ?? 0)).toFixed(1)}`).join(', ');
    return `  camp, ${['first', 'middle', 'last'][k]} third (${cs.length} visits): banked ${avg(cs.map((c) => c.banked)).toFixed(0)}, could buy everything ${share(cs, (c) => c.all)} (before #276: ${share(cs, (c) => c.allOld)}), nothing ${share(cs, (c) => c.none)}; fielded caps ${avg(cs.map((c) => c.army)).toFixed(0)} of ${ARMY_GOAL}; spent per visit: ${spent || 'none'}`;
  });
}
