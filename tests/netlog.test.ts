import { describe, expect, it } from 'vitest';
import { encodeMsg } from '../src/net/codec';
import { netLog, netMsg, netNote } from '../src/net/netlog';
import { PROTOCOL_VERSION } from '../src/net/protocol';
import { play, room } from './rig';

describe('the net log (#216)', () => {
  it('logs lobby messages both ways, with what matters in each, and leaves match traffic out', () => {
    const rm = room();
    rm.host();
    rm.guest('A');
    const log = netLog();
    expect(log).toMatch(/> A host names H/);
    expect(log).toMatch(/< A hello token/);
    expect(log).toMatch(/> A lobby phase lobby host H \[H A o o o o\] #[0-9a-f]{6}/);
    netMsg('>', 'B', encodeMsg({ k: 'ping', t: 1 } as never));
    expect(netLog()).not.toMatch(/ ping/);
  });

  it('leaves out the room sent again unchanged, but not a change or a drop', () => {
    const rm = room();
    const h = rm.host();
    rm.guest('B');
    const count = () => netLog().split('\n').filter((l) => /> B lobby/.test(l)).length;
    const n = count();
    rm.clock.now += 3000;
    h.lobby.update();
    expect(count()).toBe(n);
    h.lobby.setTeams(true);
    expect(count()).toBe(n + 1);
  });

  it('says why a send was dropped', () => {
    netMsg('x', 'peerXYZ', encodeMsg({ k: 'hello', proto: PROTOCOL_VERSION, build: 'b', mobile: false, char: 1, token: 't' }), 'link held');
    expect(netLog()).toMatch(/x peerXY hello token {2}\[link held\]/);
  });

  it('keeps only the last thousand lines', () => {
    for (let i = 0; i < 1200; i++) netNote(`line ${i}`);
    const lines = netLog().split('\n');
    expect(lines).toHaveLength(1000);
    expect(lines.at(-1)).toMatch(/line 1199$/);
  });
  it('logs who hosts after a takeover, the way back to the lobby, and a room from a host we don’t follow (#233)', () => {
    // the log is the module's, shared by every test: read only what each scenario adds, after its own mark
    let marks = 0;
    const since = () => {
      const mark = `-- mark ${++marks} ${Math.random()}`;
      netNote(mark);
      return () => {
        const lines = netLog().split('\n');
        const at = lines.findIndex((l) => l.endsWith(mark));
        expect(at).toBeGreaterThanOrEqual(0);
        return lines.slice(at + 1);
      };
    };
    const r = play({ guests: ['A', 'B'], bot: false });
    r.run(3000);
    const seatH = r.matches.get('H')!.session.localSeat;
    const first = since();
    r.quit('H');
    r.run(3000);
    const one = first();
    expect(one.some((l) => l.includes(`== taking over as host: seat ${seatH} (H) left`))).toBe(true);
    expect(one.some((l) => /== the host is seat \d \((A|B)\) now/.test(l))).toBe(true);
    // two pages think they host: the one we don't follow sends its room, and we say so once
    const p = play({ guests: ['A', 'B'], bot: false });
    p.run(1000);
    p.takeRoom('B');
    const second = since();
    p.h.lobby.backToLobby();
    p.flush();
    p.clock.now += 3000;
    p.h.lobby.update();
    p.flush();
    const two = second();
    expect(two.some((l) => l.includes('== back to the lobby, bringing everyone'))).toBe(true);
    expect(two.filter((l) => l.includes('!! ignored a room from H: we follow B'))).toHaveLength(1);
  });
});
