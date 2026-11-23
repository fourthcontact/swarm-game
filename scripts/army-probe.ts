// Army size against win rate in campaign battles (#274): does a bigger army
// help? Takes the battle panel's run snapshots (scripts/balance/model.ts) and
// plays each at several army sizes, as a share of its band's typical army,
// under a few variants that test the suspected causes:
//   base    the game as it is
//   cap60   SUPPLY.base 60: the supply cap out of the way
//   dive    the proxy marches on the finale's wards at 45 dots, as before #274 (it now waits for WARD_BLOB)
// and ideas from #276 for making a brood's size count, set up through the
// battle's MatchSetup only (no sim change). The one that worked, production by
// army size (BROOD_PROD), is now in the game, so base includes it.
//   vet     every brood unit starts as a veteran (more HP)
//   slow    every player's production × SLOW, so the opening army is a bigger share   SLOW=0.6
// Per kind and size: win %, seconds at the supply cap, nests at 1/2/3 min,
// units the nests made, and for the finale the wards taken and when.
// Usage: npx vite-node scripts/army-probe.ts [variants] [battles per kind]
//   (default base,vet,slow and 40)   WORKERS=8 BUDGET_MIN=120
import { defaultMods } from '../src/sim/mods';
import type { MatchSetup } from '../src/sim/setup';
import { nodeSetup } from '../src/campaign/battle';
import type { RunState } from '../src/campaign/run';
import { armyOf, snapshots, type CellKind, type Snapshot } from './balance/model';
import { CAP, type Result } from './balance/battle';
import { BudgetError, Pool } from './balance/pool';
import { pickBroods } from './balance/runs';

const VARIANTS = (process.argv[2] ?? 'base,vet,slow').split(',');
const SLOW = Number(process.env.SLOW ?? 0.6);
const PER_KIND = Number(process.argv[3] ?? 40);
const SIZES = [0.5, 0.8, 1.1, 1.4];
/** finale: every band; the others: the last two, where armies are big */
const KINDS: { kind: CellKind; bands: number[] }[] = [
  { kind: 'finale', bands: [0, 1, 2, 3] },
  { kind: 'conquest', bands: [2, 3] },
  { kind: 'stronghold', bands: [2, 3] },
];

interface Row {
  variant: string;
  kind: CellKind;
  factor: number;
  snap: string;
  army: number;
  r: Result;
}

/** The #276 variants' changes to the battle nodeSetup makes. */
function adjust(variant: string, setup: MatchSetup): void {
  const me = setup.players[0];
  // A human's production ignores PlayerSetup.prod (bots only), so the player's goes through mods.spawnRate.
  const spawn = (x: number) => (me.mods = { ...(me.mods ?? defaultMods()), spawnRate: (me.mods?.spawnRate ?? 1) * x });
  if (variant === 'vet') me.army = me.army?.map((a) => (a.brood === undefined ? a : { ...a, vet: true }));
  if (variant === 'slow') {
    spawn(SLOW);
    for (const p of setup.players.slice(1)) p.prod = (p.prod ?? 1) * SLOW;
  }
}

function pick(snaps: Snapshot[]): Snapshot[] {
  const out: Snapshot[] = [];
  for (const { kind, bands } of KINDS) {
    const of = snaps.filter((s) => s.kind === kind && bands.includes(s.band));
    // One per run and band, spread over the runs, in a fixed order.
    const seen = new Set<string>();
    for (const s of of) {
      const k = `${s.run}:${s.band}`;
      if (seen.has(k) || out.filter((o) => o.kind === kind).length >= PER_KIND) continue;
      seen.add(k);
      out.push(s);
    }
  }
  return out;
}

async function measure(pool: Pool, variant: string, s: Snapshot, factor: number, typical: number): Promise<Row> {
  const run = JSON.parse(s.state) as RunState;
  const fielded = pickBroods(run);
  const now = armyOf(run, fielded);
  const target = factor * typical;
  if (now > 0) for (const b of run.broods) if (fielded.includes(b.id)) b.size = Math.max(1, Math.round((b.size * target) / now));
  const army = armyOf(run, fielded);
  const setup = nodeSetup(run, s.id, fielded);
  adjust(variant, setup);
  const me = setup.players[0];
  const r = await pool.battle({ setup, human: me.faction, proxy: { skill: 1, novaLocked: !run.unlocks.nova, ...(variant === 'dive' && { wardBlob: 45 }) }, cap: CAP, probe: true });
  return { variant, kind: s.kind, factor, snap: `${s.run}:${s.id}`, army, r };
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const f1 = (x: number) => (Number.isNaN(x) ? '-' : x.toFixed(1));

function report(rows: Row[]): void {
  for (const variant of VARIANTS)
    for (const { kind } of KINDS) {
      const of = rows.filter((r) => r.variant === variant && r.kind === kind);
      if (!of.length) continue;
      console.log(`\n${variant} / ${kind} (${of.length / SIZES.length} battles per size)`);
      console.log('size  dots  won    at cap s  nests 1/2/3 min   made  wards  1st ward s');
      for (const factor of SIZES) {
        const c = of.filter((r) => r.factor === factor);
        const won = c.filter((r) => r.r.won).length;
        const p = c.map((r) => r.r.probe!);
        const nests = [0, 1, 2].map((i) => f1(avg(p.filter((x) => x.nests.length > i).map((x) => x.nests[i])))).join('/');
        const first = p.map((x) => x.firstWard).filter((t) => t >= 0).sort((a, b) => a - b);
        console.log(
          `${factor.toFixed(1)}   ${f1(avg(c.map((r) => r.army))).padStart(4)}  ${`${won}/${c.length}`.padEnd(6)} ${f1(avg(p.map((x) => x.capped))).padStart(7)}  ${nests.padEnd(16)} ${f1(avg(p.map((x) => x.spawned))).padStart(5)}  ${kind === 'finale' ? f1(avg(p.map((x) => x.wards))).padStart(5) : '    -'}  ${first.length ? first[first.length >> 1] : '-'}`,
        );
      }
      // Within one snapshot: does growing the army from the smallest to the largest flip the result?
      let up = 0, down = 0;
      for (const snap of new Set(of.map((r) => r.snap))) {
        const lo = of.find((r) => r.snap === snap && r.factor === SIZES[0])!, hi = of.find((r) => r.snap === snap && r.factor === SIZES[SIZES.length - 1])!;
        if (!lo.r.won && hi.r.won) up++;
        if (lo.r.won && !hi.r.won) down++;
      }
      console.log(`${SIZES[0]}× → ${SIZES[SIZES.length - 1]}×: ${up} losses become wins, ${down} wins become losses`);
      const pct = (factor: number) => (100 * of.filter((r) => r.factor === factor && r.r.won).length) / of.filter((r) => r.factor === factor).length;
      console.log(`slope ${(pct(SIZES[SIZES.length - 1]) - pct(SIZES[0])).toFixed(0)} points, mean ${((100 * of.filter((r) => r.r.won).length) / of.length).toFixed(0)}%`);
    }
}

const rows: Row[] = [];
try {
  const base = await Pool.open();
  const { snaps, armies } = await snapshots(base);
  const typical = armies.map((a) => (a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : 30));
  const picked = pick(snaps);
  console.log(`typical army by band: ${typical.join(', ')}; ${picked.length} snapshots (${KINDS.map(({ kind }) => `${picked.filter((s) => s.kind === kind).length} ${kind}`).join(', ')})`);
  console.log(`snapshot runs: ${base.summary()}`);
  for (const variant of VARIANTS) {
    // cap60 changes a constant inside the workers: a pool of its own (and its own cache).
    let pool = base;
    if (variant === 'cap60') {
      process.env.SUPPLY = JSON.stringify({ base: 60 });
      pool = await Pool.open();
    }
    const jobs: Promise<Row>[] = [];
    for (const s of picked) for (const factor of SIZES) jobs.push(measure(pool, variant, s, factor, typical[s.band] ?? 30));
    rows.push(...(await Promise.all(jobs)));
    console.log(`${variant}: ${pool.summary()}`);
    // Workers start on demand and copy the environment then: keep SUPPLY set until this variant is done.
    if (pool !== base) await pool.close();
    delete process.env.SUPPLY;
  }
  await base.close();
} catch (e) {
  if (!(e instanceof BudgetError)) throw e;
  console.error(e.message);
  process.exit(1);
}
report(rows);
process.exit(0);
