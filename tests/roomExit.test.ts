import { describe, expect, it } from 'vitest';
import { END_MATCH, endNetSpec, LEAVE_HOSTING, leaveConfirm, LEAVE_ROOM, netMenuSpec, RESTART_MATCH } from '../src/ui/roomExit';

/** Ways out of a room (#292). */
describe('room exits', () => {
  it('the host only brings everyone back from the end screen', () => {
    const s = endNetSpec(true);
    expect(s.buttons.map((b) => b.id)).toEqual(['lobby']);
    expect(s.buttons[0].primary).toBe(true);
    expect(s.wait).toBe(false);
  });

  it('a guest waits on the host, and can still leave the room', () => {
    const s = endNetSpec(false);
    expect(s.buttons).toEqual([{ id: 'leave', label: LEAVE_ROOM }]);
    expect(s.wait).toBe(true);
    expect(s.note).toMatch(/host/);
  });

  it('leaving always says where it goes and asks to stay', () => {
    for (const where of ['end', 'watching', 'match'] as const) {
      const c = leaveConfirm(where);
      expect(c.text).toMatch(/main menu/);
      expect(c.yes).toBe(LEAVE_ROOM);
      expect(c.text.includes('goes on without you')).toBe(where !== 'end');
    }
    expect(leaveConfirm('watching').no).toBe('Keep watching');
    expect(leaveConfirm('end').no).toBe('Stay');
  });

  it('names who takes over hosting', () => {
    expect(leaveConfirm('match', 'Vex').text).toMatch(/Vex takes over hosting/);
    expect(leaveConfirm('match').text).not.toMatch(/takes over/);
  });
});

describe('room menu (#292)', () => {
  it('the host gets playing buttons, then a hosting group with the way out', () => {
    const s = netMenuSpec(true, true, 'Resign');
    expect(s.main.map((b) => b.id)).toEqual(['resign']);
    expect(s.hosting.map((b) => b.label)).toEqual([RESTART_MATCH, END_MATCH, LEAVE_HOSTING]);
  });

  it('a guest has no hosting group, and leaves with the playing buttons', () => {
    const s = netMenuSpec(false, true, 'Resign');
    expect(s.main.map((b) => b.label)).toEqual(['Resign', LEAVE_ROOM]);
    expect(s.hosting).toEqual([]);
  });

  it('no Resign once out of it', () => {
    expect(netMenuSpec(true, false, 'Resign').main).toEqual([]);
    expect(netMenuSpec(false, false, 'Resign').main.map((b) => b.id)).toEqual(['leave']);
  });
});
