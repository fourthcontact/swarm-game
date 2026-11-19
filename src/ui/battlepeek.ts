/**
 * A closer look at a battle before you fight it (#249): its map large, with
 * every home labelled and a key to what's on it, and a card for each rival
 * (temper, warlord trait, production). Both open inside the node card, in
 * place of its contents, with a Back button: tooltips alone did nothing on touch.
 */

import { mountCreatures } from '../art/creature';
import { nodeSetup, warlordOf, type Rival } from '../campaign/battle';
import type { RunNode, RunState } from '../campaign/run';
import { TRAITS } from '../campaign/warlords';
import { FACTION_HEX, FACTION_NAMES } from '../content/factions';
import { DIFFICULTY_NAMES, type Personality } from '../sim/ai/bot';
import { battleMapCanvas, battleMarks, cardMap, homeOf } from './runmapfx';
import { esc } from './dom';

export const TEMPER_LABEL: Record<Personality, string> = { rusher: 'Rusher', turtler: 'Turtler', expander: 'Expander', opportunist: 'Opportunist' };
export const TEMPER_HINT: Record<Personality, string> = {
  rusher: 'attacks early and often',
  turtler: 'digs in and defends',
  expander: 'grabs nests fast',
  opportunist: 'preys on the weakest',
};

/** A rival's name as the cards show it: a warlord's own, else its creature's. */
export const rivalName = (r: Rival): string => (r.warlord ? `♛ ${esc(r.warlord.name)}` : esc(r.creature.name));

/** Rival portraits (#72) as slots for `mountCreatures`; `names` adds each one's name and temper; `tap`: each opens its card (#249). */
export function rivalStrip(list: Rival[], names: boolean, cls = '', tap = false): string {
  const one = (r: Rival, i: number) =>
    `<span class="rival"${tap ? ` role="button" tabindex="0" data-rival="${i}"` : ''} style="--c:${FACTION_HEX[r.faction]}" title="${r.creature.name}: ${TEMPER_LABEL[r.personality]}, ${TEMPER_HINT[r.personality]}">
      <span class="portrait" data-creature="${i}"></span>${names ? `<span class="who"><b>${rivalName(r)}</b><small>${r.warlord ? TRAITS[r.warlord.trait].name : TEMPER_LABEL[r.personality]}</small></span>` : ''}
    </span>`;
  return `<div class="rival-strip ${cls}">${list.map(one).join('')}</div>`;
}

/** Wire a strip's portraits (or anything with data-rival) to open that rival's card. */
export function onRival(root: ParentNode, open: (i: number) => void): void {
  root.querySelectorAll<HTMLElement>('[data-rival]').forEach((e) => {
    const go = () => open(Number(e.dataset.rival));
    e.addEventListener('click', go);
    e.addEventListener('keydown', (k) => {
      if (k.key !== 'Enter' && k.key !== ' ') return;
      k.preventDefault();
      go();
    });
  });
}

const head = (title: string) => `<button class="icon close" data-a="close" aria-label="Close">✕</button><h3>${title}</h3>`;

/** One rival, everything known about it before the fight. */
export function showRival(panel: HTMLElement, run: RunState, n: RunNode, foes: Rival[], i: number, h: { back: () => void; close: () => void }): void {
  const r = foes[i];
  const slot = nodeSetup(run, n.id).players.filter((p) => p.bot)[i];
  const rows: string[] = [`<dt>Temper</dt><dd>${TEMPER_LABEL[r.personality]}: ${TEMPER_HINT[r.personality]}</dd>`];
  if (slot?.bot) rows.push(`<dt>Strength</dt><dd>${DIFFICULTY_NAMES[slot.bot.difficulty]}</dd>`);
  if (slot?.prod !== undefined && Math.abs(slot.prod - 1) > 0.005) rows.push(`<dt>Production</dt><dd>×${slot.prod.toFixed(2)}${slot.prod > 1 ? ': spawns faster than you' : ': spawns slower than you'}</dd>`);
  if (r.warlord) {
    const t = TRAITS[r.warlord.trait];
    rows.push(`<dt>Trait</dt><dd><b>${esc(t.name)}</b>: ${esc(t.text)}</dd>`);
    if (t.noPowers) rows.push(`<dt>Powers</dt><dd>None</dd>`);
    const lord = warlordOf(run, n.id);
    if (lord && lord.faction === r.faction && lord.weakened) rows.push(`<dt>Weakened</dt><dd>×${lord.weakened} by the Bloom eating its domain</dd>`);
  }
  panel.classList.remove('wide');
  panel.innerHTML = `
    ${head(r.warlord ? 'Warlord' : 'Rival')}
    <div class="rival-card" style="--c:${FACTION_HEX[r.faction]}">
      <span class="portrait" data-creature="0"></span>
      <span class="who"><b>${rivalName(r)}</b><small>${FACTION_NAMES[r.faction]} ${r.warlord ? 'warlord' : 'rival'}</small></span>
    </div>
    <dl>${rows.join('')}</dl>
    <button data-a="back">Back</button>`;
  mountCreatures(panel, [r.creature], 72, true);
  panel.querySelector('[data-a=close]')!.addEventListener('click', h.close);
  panel.querySelector('[data-a=back]')!.addEventListener('click', h.back);
}

/** The battle map large: homes labelled (tap a rival's to see its card), and a key. */
export function showBigMap(
  panel: HTMLElement,
  run: RunState,
  n: RunNode,
  foes: Rival[],
  me: string,
  h: { back: () => void; close: () => void; rival: (i: number) => void },
): void {
  const m = cardMap(run, n);
  const marks = battleMarks(run, n);
  panel.classList.add('wide');
  // Fit the space the card has, width and height, leaving room for the title, key and Back.
  const host = panel.parentElement;
  const long = Math.max(m.width, m.height);
  const room = { w: (host?.clientWidth ?? 760) - 80, h: (host?.clientHeight ?? 600) - 210 };
  const px = Math.round(Math.max(220, Math.min(720, (room.w * long) / m.width, (room.h * long) / m.height)));
  const pct = (x: number, y: number) => `left:${((100 * x) / m.width).toFixed(2)}%;top:${((100 * y) / m.height).toFixed(2)}%`;
  const tags: string[] = [];
  const mine = homeOf(m, 0);
  if (mine) tags.push(`<span class="home-tag you" style="${pct(mine.x, mine.y)};--c:${me}">You</span>`);
  foes.forEach((r, i) => {
    const at = homeOf(m, i + 1);
    if (at) tags.push(`<span class="home-tag" role="button" tabindex="0" data-rival="${i}" style="${pct(at.x, at.y)};--c:${FACTION_HEX[r.faction]}">${rivalName(r)}</span>`);
  });
  if (marks.heart) tags.push(`<span class="home-tag heart" style="${pct(marks.heart.x, marks.heart.y)}">The heart</span>`);
  const key: string[] = [`<li><i class="dot" style="--c:${me}"></i>Your start</li>`];
  if (foes.length) key.push(`<li>${foes.map((r) => `<i class="dot" style="--c:${FACTION_HEX[r.faction]}"></i>`).join('')}Rival homes</li>`);
  key.push('<li><i class="dot neutral"></i>Neutral nests</li>');
  if (m.nests.some((x) => x.key)) key.push('<li><i class="ring gold"></i>Key nests</li>');
  if (m.fortress) key.push('<li><i class="ring citadel"></i>Citadel</li>');
  if (m.terrain.walls.length) key.push('<li><i class="bar wall"></i>Walls</li>');
  if (marks.heart) key.push('<li><i class="star"></i>The heart</li>', '<li><i class="ring bloom"></i>Bloom nests: each one standing shields the heart</li>');
  if (m.terrain.crystals.length) key.push('<li><i class="dot crystal"></i>Crystals</li>');
  if (m.terrain.fields.some((f) => f.kind === 'nebula')) key.push('<li><i class="bar nebula"></i>Nebula</li>');
  if (m.terrain.fields.some((f) => f.kind === 'rift')) key.push('<li><i class="bar rift"></i>Rift</li>');
  if (m.terrain.cave) key.push('<li><i class="bar rock"></i>Cave rock</li>');
  panel.innerHTML = `
    ${head('Battle map')}
    <div class="big-map">${tags.join('')}</div>
    <ul class="map-key">${key.join('')}</ul>
    <button data-a="back">Back</button>`;
  panel.querySelector('.big-map')!.prepend(battleMapCanvas(run, n, px, me));
  panel.querySelector('[data-a=close]')!.addEventListener('click', h.close);
  panel.querySelector('[data-a=back]')!.addEventListener('click', h.back);
  onRival(panel, h.rival);
}
