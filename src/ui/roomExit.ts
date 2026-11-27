/**
 * Ways out of a room (#292): one label for leaving, the end screen's buttons,
 * and the card that asks before you go. Playtesters read "Leave" as "back to
 * the lobby", so leaving always says it's the room you leave, and asks first.
 */

/** Every button that takes you out of the room says this. */
export const LEAVE_ROOM = 'Leave room';
export const BACK_TO_LOBBY = 'Back to lobby';

export interface EndNetSpec {
  buttons: { id: 'leave' | 'lobby'; label: string; primary?: boolean }[];
  note: string;
  /** a guest waits on the host: the note gets a spinner */
  wait: boolean;
}

/**
 * A room's end-screen buttons. The host only brings everyone back (leaving
 * the room is the lobby's job); a guest waits, and can still leave.
 */
export function endNetSpec(host: boolean): EndNetSpec {
  return host
    ? { buttons: [{ id: 'lobby', label: BACK_TO_LOBBY, primary: true }], note: 'Brings everyone back to the lobby to play again or change the settings.', wait: false }
    : { buttons: [{ id: 'leave', label: LEAVE_ROOM }], note: 'Waiting for the host to bring everyone back to the lobby…', wait: true };
}

export interface LeaveConfirm {
  title: string;
  text: string;
  yes: string;
  no: string;
}

/**
 * The card before leaving: from the end screen, while watching after a
 * defeat, or mid-match from the pause menu. `nextHost` is who takes over
 * hosting if we leave.
 */
export function leaveConfirm(where: 'end' | 'watching' | 'match', nextHost?: string): LeaveConfirm {
  const parts = ['You go back to the main menu and won’t be in this group’s next match.'];
  if (where !== 'end') parts.push('The match goes on without you.');
  if (nextHost) parts.push(`${nextHost} takes over hosting.`);
  parts.push(where === 'end' ? 'To play again with them, stay: the host brings everyone back to the lobby.' : 'To play again with them, stay until the end: the host brings everyone back to the lobby.');
  return { title: 'Leave the room?', text: parts.join(' '), yes: LEAVE_ROOM, no: where === 'watching' ? 'Keep watching' : 'Stay' };
}
