/**
 * Which modals the menu's demo battle pauses under. Under these the loop keeps
 * the score going but neither steps nor draws the demo, and the canvas keeps
 * its last frame.
 *
 * The run map and the room (#184) cover everything. The run's own screens
 * (debrief, reward and recruit picks) do too (#270): they follow a run battle,
 * which leaves through the main menu and so starts the demo, and a battle
 * running behind them only costs frame rate.
 */
export const COVERS = 'covers';

export function coversDemo(cls: { contains(c: string): boolean }): boolean {
  return cls.contains('runmap') || cls.contains('opaque') || cls.contains(COVERS);
}
