import type { GameView } from '../game/gameView';

/** Resignation (#291): the pause menu's button, and the card that asks first. */
export const RESIGN_LABEL = 'Resign';

/** Whether the local player can resign now: seated, still in it, and the match not over. */
export function canResign(g: GameView): boolean {
  const f = g.world.factions[g.human];
  return g.human >= 0 && !!f && !f.eliminated && !g.world.over && !g.result && !g.spectating;
}

/** What resigning does, for the confirm card. */
export function resignText(net: boolean): string {
  return net
    ? 'Your swarm dies and your nests go unowned. You can watch the rest of the match. This can’t be undone.'
    : 'The match ends as a defeat. This can’t be undone.';
}

/** Give up: the sim knocks the player out (src/sim/commands.ts). */
export function resign(g: GameView): void {
  if (canResign(g)) g.session.issue({ t: 'resign', p: g.human });
}

/** A yes/no card over a local match (the room's has its own, `confirmNet` in main.ts). */
export function resignCard(yes: () => void, back: () => void): HTMLDivElement {
  const m = document.createElement('div');
  m.className = 'screen modal dim';
  m.innerHTML = '<div class="card"><h2>Resign?</h2><p></p><div class="row end"></div></div>';
  m.querySelector('p')!.textContent = resignText(false);
  const row = m.querySelector('.row')!;
  for (const b of [{ label: RESIGN_LABEL, primary: true, on: yes }, { label: 'Back', primary: false, on: back }]) {
    const btn = document.createElement('button');
    btn.textContent = b.label;
    if (b.primary) btn.className = 'primary';
    btn.addEventListener('click', b.on);
    row.appendChild(btn);
  }
  return m;
}
