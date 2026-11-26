/**
 * The run map's node card as a sheet (#272). On a phone held upright the card covers the map's
 * lower part; the map then pans within the strip above it and glides the chosen node into that strip.
 * When the sheet goes (closed, rotated to landscape, or the card went wide), the map glides back.
 */
import type { Cam } from './campaign';

export interface SheetHost {
  canvas: HTMLCanvasElement;
  /** the node card */
  panel: HTMLElement;
  /** the card's backdrop; hidden when no card is open */
  veil: HTMLElement;
  /** the run map's screen, which carries `touring` during the tour */
  screen: HTMLElement;
  dpr: () => number;
  cam: () => Cam | null;
  /** the current view: map units to canvas pixels */
  view: () => { s: number; oy: number };
  /** where the camera is gliding to, if anywhere */
  flying: () => Cam | null;
  glide: (to: Cam) => void;
  /** clamp a camera to the whole canvas, with no sheet */
  settle: (cam: Cam) => void;
  /** the chosen node's map position, if a card is open for one */
  chosen: () => { y: number } | null;
}

export interface MapSheet {
  /** canvas pixels at the bottom hidden under the sheet */
  pad: () => number;
  /** the card is open for a node at map height `y`: work out the sheet, and glide the node above it */
  fit: (y: number) => void;
  /** the card is gone */
  drop: () => void;
  dispose: () => void;
}

export function mapSheet(h: SheetHost): MapSheet {
  let pad = 0;
  const drop = () => {
    if (!pad) return;
    pad = 0;
    const cam = h.cam();
    if (!cam) return;
    const to = { ...cam };
    h.settle(to);
    h.glide(to);
  };
  const fit = (ny: number) => {
    const cls = document.body.classList;
    const sheet = !h.veil.hidden && !h.panel.classList.contains('wide') && cls.contains('mobile') && !cls.contains('land') && !h.screen.classList.contains('touring');
    const top = h.panel.getBoundingClientRect().top - h.canvas.getBoundingClientRect().top;
    // Rotated to landscape, or the card went wide: no sheet, so glide back rather than stay clamped.
    if (!sheet || top <= 0) return drop();
    const k = h.dpr();
    pad = Math.max(0, Math.round(h.canvas.clientHeight * k) - top * k);
    const cam = h.cam();
    if (!cam || !pad) return;
    const v = h.view();
    const y = (v.oy + ny * v.s) / k;
    if (y > 24 && y < top - 40) return;
    const cy = ny + pad / v.s / 2;
    if (h.flying()?.cy === cy) return; // already gliding there
    h.glide({ ...cam, cy });
  };
  // The sheet's height changes with its content (the brood pick, a rival's card) and with a resize or rotation: keep the pad in step.
  const obs = new ResizeObserver(() => {
    const n = h.chosen();
    if (n && !h.veil.hidden) fit(n.y);
    else drop();
  });
  obs.observe(h.panel);
  obs.observe(h.canvas);
  return { pad: () => pad, fit, drop, dispose: () => obs.disconnect() };
}
