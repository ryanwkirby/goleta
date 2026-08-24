/**
 * How tall the event log's list may open, upright (#352).
 *
 * It used to be `max-h-44` — 176px, whatever the screen was — and upright that
 * is the wrong shape twice over. The column arranges itself around the piles:
 * the block holding them is `flex-1 justify-center`, so on a tall phone it is
 * carrying a couple of hundred pixels of bare felt the log could have had.
 * Opening the log took a fixed slab out of that and handed back a small
 * scrolling box on a screen with room to spare.
 *
 * **The room is the slack the piles are sitting in, and it is read once, while
 * the log is still shut.** That is the whole of what keeps this safe. The log
 * growing *is* the slack shrinking — one for one, because the piles' block is
 * what gives it up — so a cap that followed the slack live would be a cap that
 * changed every time it was applied, and a fraction of a pixel landing on either
 * side of a floor is then an animation that never settles. Shut, the piles are
 * holding all of it and nothing is asking the log how big it already is.
 *
 * The floor is what the log has always been given, so nothing gets *worse* on a
 * short screen: the column overflows and the page scrolls, exactly as before.
 * What is new is only that a tall screen stops wasting the difference.
 */

/** `max-h-44`, the fixed cap this replaces. */
export const LOG_MIN_LIST = 176;

/**
 * The most the open list may come to, in whole pixels.
 *
 * @param slack the room the piles are sitting in beyond what they need, read
 *   while the log is collapsed
 */
export const logList = (slack: number): number => Math.max(LOG_MIN_LIST, Math.floor(slack));
