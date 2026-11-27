import { siegeVictory } from './siege';
import { BALANCE, DOMINATION, DT, KEYS, ENERGY, ESCALATION, POWER, TERRAIN, VARIANTS, escalation, NEUTRAL, NEUTRAL_TEAM, NUM_FACTIONS, TICK_HZ } from './constants';
import { applyCommand, REJECTS, type Command } from './commands';
import { updateCombat, resolveDamage } from './combat';
import { updateMovement } from './movement';
import { updateNests } from './nests';
import { updateEvents } from './events';
import { pushFx, removeUnit, type World } from './world';
import { queryRadius } from './spatial';

/**
 * Advance the world one fixed tick. Pure function of (world, commands):
 * the same inputs always produce the same state, which is what lockstep
 * multiplayer and replays rely on.
 */
export function step(w: World, commands: readonly Command[]): void {
  if (w.over) return;
  w.tick++;
  w.beamCount = 0;
  w.px.set(w.x.subarray(0, w.n));
  w.py.set(w.y.subarray(0, w.n));
  // The opening (#235): the world waits for GO; orders sent early do nothing.
  if (w.tick <= w.opening) return;

  w.grid.build(w);
  // a command that does nothing says why, for its sender's pending marker (#161): fx are render output, never hashed
  commands.forEach((c, i) => {
    const why = applyCommand(w, c);
    // (a garbage command from the wire may not even have a p)
    if (why) pushFx(w, 'cmdFail', 0, 0, Number.isInteger(c?.p) ? c.p : -1, i, REJECTS.indexOf(why));
  });
  for (const b of w.bots) b.update(w);
  updateEvents(w);

  updateNests(w);
  resolveBarrages(w);
  updateBurns(w);
  updateCombat(w);
  resolveDamage(w);
  updateMovement(w);
  updateCrystals(w);
  expireGhosts(w);
  siphon(w);

  // Energy: factions behind the biggest army charge faster.
  let leader = 1;
  for (let f = 0; f < NEUTRAL; f++) if (w.factions[f].active) leader = Math.max(leader, w.unitCount[f]);
  for (let f = 0; f < NEUTRAL; f++) {
    const fa = w.factions[f];
    if (!fa.active || fa.eliminated) continue;
    const behind = 1 - w.unitCount[f] / leader;
    const rate = ENERGY.passive * (1 + BALANCE.underdogEnergy * behind * (1 - escalation(w.tick)));
    fa.energy = Math.min(ENERGY.max, fa.energy + rate * fa.mods.energyRate * DT);
  }

  if (w.tick % TICK_HZ === 0) {
    for (let f = 0; f < NEUTRAL; f++) {
      if (w.factions[f].active) w.history[f].push(w.unitCount[f]);
    }
  }
  if (w.tick === ESCALATION.start) pushFx(w, 'escalation', 0, 0, -1);
  if (w.tick % VICTORY_EVERY === 0) checkVictory(w);
}

/** How often (ticks) the match checks for a winner, and key nests score. */
const VICTORY_EVERY = 15;

const blast: number[] = [];
const hits: { j: number; d: number }[] = [];
const CRYSTAL_EVERY = 6;

/** Crystals charge energy for the only team standing on them. */
function updateCrystals(w: World): void {
  if (w.crystals.length === 0) return;
  if (w.tick % CRYSTAL_EVERY === 0) {
    for (const c of w.crystals) {
      queryRadius(w, c.x, c.y, c.r, blast);
      let lead = -1, team = -1, mixed = false;
      for (const s of blast) {
        const o = w.owner[s];
        if (o === NEUTRAL || w.ghost[s]) continue;
        if (team < 0) {
          team = w.teamOf[o];
          lead = o;
        } else if (w.teamOf[o] !== team) {
          mixed = true;
          break;
        }
      }
      const holder = mixed ? -1 : lead;
      if (holder >= 0 && holder !== c.last) {
        pushFx(w, 'crystal', c.x, c.y, holder, c.r);
        c.last = holder;
      }
      c.holder = holder;
    }
  }
  for (const c of w.crystals) {
    if (c.holder < 0) continue;
    const f = w.factions[c.holder];
    if (!f.eliminated) f.energy = Math.min(ENERGY.max, f.energy + TERRAIN.crystalEnergy * c.value * f.mods.crystalRate * DT);
  }
}

/** Barrage strikes that land this tick. */
function resolveBarrages(w: World): void {
  if (w.barrages.length === 0) return;
  const keep = [];
  for (const b of w.barrages) {
    if (b.impact > w.tick) {
      keep.push(b);
      continue;
    }
    queryRadius(w, b.x, b.y, b.r, blast);
    // Full damage (with falloff) from the center out, until the strike's
    // budget is spent: a small group still dies, a big packed blob loses its core.
    hits.length = 0;
    for (const j of blast) {
      if (!w.hostile(w.owner[j], b.owner)) continue;
      hits.push({ j, d: Math.sqrt((w.x[j] - b.x) ** 2 + (w.y[j] - b.y) ** 2) });
    }
    hits.sort((p, q) => p.d - q.d || p.j - q.j);
    const fm = w.factions[b.owner].mods;
    let budget = POWER.barrageBudget * (b.r / POWER.barrageRadius) * fm.barrageBudget * (b.budget ?? 1) * (fm.scorch ? VARIANTS.scorch.budget : 1);
    for (const { j, d } of hits) {
      if (budget <= 0) break;
      const dmg = Math.min(budget, POWER.barrageDamage * (1 - 0.4 * (d / b.r)));
      w.dmg[j] += dmg;
      w.lastHit[j] = b.owner;
      budget -= dmg;
    }
    pushFx(w, 'barrageHit', b.x, b.y, b.owner, b.r);
    if (fm.scorch) w.burns.push({ x: b.x, y: b.y, r: b.r, owner: b.owner, until: w.tick + VARIANTS.scorch.ticks });
  }
  w.barrages = keep;
}

/** Scorch (#60): burning ground hurts every hostile standing in it. */
function updateBurns(w: World): void {
  if (w.burns.length === 0) return;
  w.burns = w.burns.filter((b) => b.until > w.tick);
  for (const b of w.burns) {
    queryRadius(w, b.x, b.y, b.r, blast);
    for (const j of blast) {
      if (!w.hostile(w.owner[j], b.owner)) continue;
      w.dmg[j] += VARIANTS.scorch.dps * DT;
      w.lastHit[j] = b.owner;
    }
  }
}

/** Echo (#60): ghosts fade when their time is up. */
function expireGhosts(w: World): void {
  if (w.ghosts === 0) return;
  for (let i = 0; i < w.n; i++) if (w.alive[i] && w.ghost[i] && w.ghost[i] <= w.tick) removeUnit(w, i);
}

/** Lockdown Siphon (#60): a locked nest's owner bleeds energy to whoever locked it. */
function siphon(w: World): void {
  for (const n of w.nests) {
    // Only while an enemy holds it: a nest that changed hands to the caster's side stops paying.
    if (n.lockedUntil <= w.tick || n.lockedBy === undefined || n.lockedBy < 0 || n.owner < 0 || n.owner === NEUTRAL || !w.hostile(n.owner, n.lockedBy)) continue;
    const to = w.factions[n.lockedBy], from = w.factions[n.owner];
    if (!to.mods.siphon) continue;
    const take = Math.min(from.energy, to.mods.siphon * DT);
    from.energy -= take;
    to.energy = Math.min(ENERGY.max, to.energy + take);
  }
}

const nestsByTeam = new Int32Array(NEUTRAL_TEAM + 1);

function checkVictory(w: World): void {
  const ownsNest = new Uint8Array(NUM_FACTIONS);
  nestsByTeam.fill(0);
  for (const n of w.nests) {
    if (n.owner < 0) continue;
    ownsNest[n.owner] = 1;
    nestsByTeam[w.teamOf[n.owner]]++;
  }

  const aliveTeams = new Set<number>();
  for (let f = 0; f < NEUTRAL; f++) {
    const fa = w.factions[f];
    if (!fa.active || fa.eliminated) continue;
    if (w.unitCount[f] === 0 && !ownsNest[f]) {
      fa.eliminated = true;
      fa.eliminatedTick = w.tick;
      fa.energy = 0;
      pushFx(w, 'eliminated', 0, 0, f);
      continue;
    }
    aliveTeams.add(fa.team);
  }

  if (w.endless) return;
  if (resignVictory(w, aliveTeams)) return;
  // Hold the line (#67): only the siege decides it.
  if (w.siege && siegeVictory(w)) return;
  // A stronghold (#100): a human's side taking the citadel wins, whoever else is left
  // (a bot ally's capture counts for its team, #222; the campaign has no allies).
  if (w.citadel >= 0) {
    const c = w.nests[w.citadel];
    if (c.owner >= 0 && c.owner !== NEUTRAL && c.control >= 1 && humanTeam(w, w.teamOf[c.owner])) {
      w.over = true;
      w.winnerTeam = w.teamOf[c.owner];
      w.winReason = 'citadel';
      return;
    }
  }
  // While the Bloom's heart lives it is the goal: only losing every human
  // (or, with no human in the match, every player) ends the match.
  if (w.heart && !w.heart.slain) {
    let humans = 0, alive = 0;
    for (let f = 0; f < NEUTRAL; f++) {
      const fa = w.factions[f];
      if (!fa.human || !fa.active) continue;
      humans++;
      if (!fa.eliminated) alive++;
    }
    if (humans > 0 ? alive === 0 : aliveTeams.size === 0) {
      w.over = true;
      w.winnerTeam = -1;
      w.winReason = 'elimination';
    }
    return;
  }
  if (aliveTeams.size <= 1) {
    w.over = true;
    w.winnerTeam = aliveTeams.size === 1 ? [...aliveTeams][0] : -1;
    w.winReason = 'elimination';
    return;
  }

  if (w.keys.length) {
    keyVictory(w, aliveTeams);
    return;
  }

  for (const t of aliveTeams) {
    if (nestsByTeam[t] >= w.domNeed(t)) {
      if (w.domTicks[t] === 0) pushFx(w, 'domStart', 0, 0, teamFace(w, t));
      w.domTicks[t] += VICTORY_EVERY;
      if (w.domTicks[t] >= DOMINATION.ticks) {
        w.over = true;
        w.winnerTeam = t;
        w.winReason = 'domination';
        return;
      }
    } else {
      if (w.domTicks[t] > 0) pushFx(w, 'domBreak', 0, 0, teamFace(w, t));
      w.domTicks[t] = 0;
    }
  }
}

/**
 * Resignation (#291): once someone has resigned and no human is left standing,
 * the match ends. The winner is the live team with no resigned member that holds
 * the most nests, then the most dots, then the lowest id; nobody if none qualifies.
 * With one live team left, elimination decides as usual: that team wins even with a
 * resigned member, since the last human may have been beaten rather than resigned.
 */
function resignVictory(w: World, aliveTeams: Set<number>): boolean {
  let resigned = false, standing = false;
  for (let f = 0; f < NEUTRAL; f++) {
    const fa = w.factions[f];
    if (!fa.active) continue;
    if (fa.resigned) resigned = true;
    if (fa.human && !fa.eliminated) standing = true;
  }
  if (!resigned || standing || aliveTeams.size <= 1) return false;
  let best = -1, bestNests = -1, bestDots = -1;
  for (const t of aliveTeams) {
    let dots = 0, out = false;
    for (let f = 0; f < NEUTRAL; f++) {
      const fa = w.factions[f];
      if (!fa.active || fa.team !== t) continue;
      if (fa.resigned) out = true;
      dots += w.unitCount[f];
    }
    if (out) continue;
    const nests = nestsByTeam[t];
    if (nests > bestNests || (nests === bestNests && (dots > bestDots || (dots === bestDots && t < best)))) {
      best = t;
      bestNests = nests;
      bestDots = dots;
    }
  }
  w.over = true;
  w.winnerTeam = best;
  w.winReason = 'resign';
  return true;
}

/** Whether a team has a human seat in the match. */
function humanTeam(w: World, team: number): boolean {
  for (let f = 0; f < NEUTRAL; f++) if (w.factions[f].active && w.factions[f].human && w.teamOf[f] === team) return true;
  return false;
}

/** The faction that stands for a team: the live member holding the most nests. */
function teamFace(w: World, team: number): number {
  let best = -1, bestN = -1;
  for (let f = 0; f < NEUTRAL; f++) {
    const fa = w.factions[f];
    if (!fa.active || fa.eliminated || fa.team !== team) continue;
    let n = 0;
    for (const nest of w.nests) if (nest.owner === f) n++;
    if (n > bestN) {
      bestN = n;
      best = f;
    }
  }
  return best;
}

/** The key-nest score that wins (#87), counting at most KEYS.maxScored key nests (#232). */
export function keyTarget(w: World): number {
  return KEYS.points * Math.min(w.keys.length, KEYS.maxScored);
}

/** The team holding nest `id` (a key nest), or -1 while nobody does. */
export function keyTeam(w: World, id: number): number {
  const n = w.nests[id];
  return n.owner >= 0 && n.owner !== NEUTRAL ? w.teamOf[n.owner] : -1;
}

/** Whether key nest `id` scores for its holder now: fully held and uncontested. */
export function keyScoring(w: World, id: number): boolean {
  const n = w.nests[id];
  return keyTeam(w, id) >= 0 && n.control >= 1 && !n.contested;
}

/** Key nests team `t` holds fully and uncontested, whether or not it scores on them (#255). */
export function keyHeld(w: World, t: number): number {
  let held = 0;
  for (const k of w.keys) if (keyScoring(w, k) && keyTeam(w, k) === t) held++;
  return held;
}

/** What team `t` scores per tick: its held key nests if it holds the most, else 0 (#255). */
export function keyRate(w: World, t: number): number {
  return keyRates(w)[t];
}

/**
 * Whether key nest `id` scores for its holder now (#260): fully held and
 * uncontested (keyScoring), and its team holds the most (keyRate). `rates`
 * lets a caller checking many nests in one frame pass keyRates once.
 */
export function keyScores(w: World, id: number, rates: ArrayLike<number> = keyRates(w)): boolean {
  return keyScoring(w, id) && rates[keyTeam(w, id)] > 0;
}

/**
 * Key nests each team scores on now (#250), in one pass over the key nests.
 * Only the team holding strictly the most scores (#255): a lone edge holder
 * scores only while nobody else holds one, and a tie at the top scores nothing.
 * Returns a shared scratch array: read it before the next call, or copy it.
 */
export function keyRates(w: World): Int32Array {
  if (rateScratch.length < w.keyScore.length) rateScratch = new Int32Array(w.keyScore.length);
  rateScratch.fill(0);
  for (const k of w.keys) if (keyScoring(w, k)) rateScratch[keyTeam(w, k)]++;
  let top = -1, tied = false;
  for (let t = 0; t < w.keyScore.length; t++) {
    if (!rateScratch[t]) continue;
    if (top < 0 || rateScratch[t] > rateScratch[top]) (top = t), (tied = false);
    else if (rateScratch[t] === rateScratch[top]) tied = true;
  }
  for (let t = 0; t < w.keyScore.length; t++) if (t !== top || tied) rateScratch[t] = 0;
  return rateScratch;
}
let rateScratch = new Int32Array(0);

/**
 * Ticks until a side `togo` short of the target gets there at `rate` (#250):
 * scores land only on the victory checks (every VICTORY_EVERY ticks), so this
 * is the tick of the check that takes it over, not togo / rate. Infinity at
 * rate 0.
 */
function ticksToTarget(w: World, togo: number, rate: number): number {
  if (rate <= 0) return Infinity;
  if (togo <= 0) return 0;
  const checks = Math.ceil(togo / (VICTORY_EVERY * rate));
  return VICTORY_EVERY - (w.tick % VICTORY_EVERY) + VICTORY_EVERY * (checks - 1);
}

/** Ticks until team `t` wins on key nests at its current rate: Infinity while it scores on none. */
export function keyEta(w: World, t: number): number {
  return ticksToTarget(w, keyTarget(w) - w.keyScore[t], keyRate(w, t));
}

/** A side in a key-nest race: its score, the key nests it scores on now, and its keyEta. */
export interface KeySide {
  score: number;
  rate: number;
  eta: number;
}

/**
 * Whether side `a` is ahead of `b` in a key-nest race (#250): it wins sooner at
 * its rate. If both would cross the target on the same check, the sim gives the
 * win to the higher score at that check, so that decides it; while neither is
 * scoring, the higher score now. A top scorer that has stopped scoring is not
 * ahead of a side that will overtake it.
 */
function keyAhead(a: KeySide, b: KeySide): boolean {
  if (a.eta !== b.eta) return a.eta < b.eta;
  if (a.eta === Infinity) return a.score > b.score;
  const at = Math.ceil(a.eta / VICTORY_EVERY) * VICTORY_EVERY;
  return a.score + a.rate * at > b.score + b.rate * at;
}

/**
 * The side to headline in a key-nest race (#250): the one soonest to win at its
 * rate (see keyAhead); null if nobody has scored or is scoring.
 */
export function soonestKeyWin<S extends KeySide>(sides: Iterable<S>): S | null {
  let best: S | null = null;
  for (const s of sides) {
    if (s.eta === Infinity && s.score <= 0) continue;
    if (!best || keyAhead(s, best)) best = s;
  }
  return best;
}

/** The team to headline among those `alive` (soonestKeyWin), with its race. */
function keyHeadline(w: World, alive: (t: number) => boolean): (KeySide & { t: number }) | null {
  const rates = keyRates(w);
  const target = keyTarget(w);
  let best: (KeySide & { t: number }) | null = null;
  for (let t = 0; t < w.keyScore.length; t++) {
    const score = w.keyScore[t], rate = rates[t];
    if ((score <= 0 && rate === 0) || !alive(t)) continue;
    const s = { t, score, rate, eta: ticksToTarget(w, target - score, rate) };
    if (!best || keyAhead(s, best)) best = s;
  }
  return best;
}

/** The team with the highest key-nest score among the living, or -1 if nobody has scored. */
function keyLeader(w: World, alive: (t: number) => boolean): number {
  let best = -1;
  for (let t = 0; t < w.keyScore.length; t++) if (w.keyScore[t] > 0 && alive(t) && (best < 0 || w.keyScore[t] > w.keyScore[best])) best = t;
  return best;
}

/**
 * Key nests (#87), king of the hill: the team holding the most key nests
 * uncontested scores for each of them (#255; a tie at the top scores nothing),
 * and the first to keyTarget wins (the higher score, if two
 * get there in the same check). The side soonest to win (#250), once past
 * KEYS.threat of the target, is marked in domTicks, so bots, the HUD and the
 * music treat it as dominating: not a top scorer that has stopped scoring.
 */
function keyVictory(w: World, aliveTeams: Set<number>): void {
  const target = keyTarget(w);
  const rates = keyRates(w);
  for (const t of aliveTeams) w.keyScore[t] += VICTORY_EVERY * rates[t];
  const lead = keyLeader(w, (t) => aliveTeams.has(t));
  if (lead >= 0 && w.keyScore[lead] >= target) {
    w.over = true;
    w.winnerTeam = lead;
    w.winReason = 'domination';
    return;
  }
  const head = keyHeadline(w, (t) => aliveTeams.has(t));
  const threat = head && head.score >= KEYS.threat * target ? head.t : -1;
  for (let t = 0; t < w.domTicks.length; t++) {
    if (t === threat) {
      if (w.domTicks[t] === 0) pushFx(w, 'domStart', 0, 0, teamFace(w, t));
      w.domTicks[t] = w.keyScore[t];
    } else w.domTicks[t] = 0;
  }
}

export interface DominationStatus {
  team: number;
  /** faction to show for the team */
  face: number;
  /** ticks until the team wins */
  left: number;
  /** nests the team holds, and how many it needs */
  held: number;
  need: number;
  /** nests rivals must take back to break it */
  toBreak: number;
  /** how much of the countdown is left, 0–1 */
  frac: number;
  /**
   * key nests (#87): `held` is the key nests the team scores on now, `need` all
   * of them, and `left` the time to win at that rate (at one key nest when it
   * scores on none, which is `paused`)
   */
  keys?: boolean;
  paused?: boolean;
}

/**
 * Key nests (#254): show the big countdown banner? Only while the side soonest
 * to win is within `KEYS.banner` of it and still scoring; it goes the moment
 * that side stops. Domination by nest share always shows it.
 */
export function dominationBanner(ds: DominationStatus | null): boolean {
  if (!ds) return false;
  return !ds.keys || (!ds.paused && ds.left <= KEYS.banner);
}

/** The team currently dominating, or null. */
export function dominationStatus(w: World): DominationStatus | null {
  if (w.keys.length) {
    // Key nests: the side soonest to win at its rate, else the top scorer (#250).
    const head = keyHeadline(w, (t) => teamFace(w, t) >= 0);
    if (!head) return null;
    const target = keyTarget(w);
    const togo = Math.max(0, target - head.score);
    const left = head.rate > 0 ? head.eta : ticksToTarget(w, togo, 1);
    return { team: head.t, face: teamFace(w, head.t), left, frac: togo / target, held: head.rate, need: w.keys.length, toBreak: head.rate, keys: true, paused: head.rate === 0 };
  }
  for (let t = 0; t < w.domTicks.length; t++) {
    if (w.domTicks[t] <= 0) continue;
    let held = 0;
    for (const n of w.nests) if (n.owner >= 0 && n.owner !== NEUTRAL && w.teamOf[n.owner] === t) held++;
    const need = w.domNeed(t);
    const left = Math.max(0, DOMINATION.ticks - w.domTicks[t]);
    return { team: t, face: teamFace(w, t), left, frac: left / DOMINATION.ticks, held, need, toBreak: Math.max(1, held - need + 1) };
  }
  return null;
}
