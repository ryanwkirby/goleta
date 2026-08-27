/**
 * How tall the event log's list may open, upright (#352, #358).
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
 * **#352 kept the old 176 as a floor and that undid it on every phone** (#358).
 * The fixed part of this column measures 591–611px depending on whether the
 * prompt wraps and whether **I'm done** is up, so the slack is roughly the
 * viewport less six hundred: 123px at 734, 139 at 750, 261 at 852. The floor is
 * the larger of the two numbers until somewhere around a **767–787px** viewport,
 * and iOS Safari with its address bar showing is under that on every iPhone. So
 * the log opened into exactly the constant it opened into before, scrolled
 * inside itself, and pushed the column past the bottom of the screen — "now the
 * page scrolls *and* the log scrolls, and the outer one moves everything while
 * the inner one is the one holding the thing you wanted to read", which was
 * #352's own complaint, back verbatim.
 *
 * **Opening the log must not make the page scrollable**, and that is the
 * property this is now written to. Everything else reported on #358 — a
 * document a few hundred pixels taller than its content, the felt under the log,
 * a rubber-band caught in a screenshot — only happens once the document is
 * taller than the viewport, which on the reported device is something opening
 * the log did.
 *
 * The floor that is left is **two lines**, and it is the smallest list worth
 * showing rather than a number that overrides the measurement. Where it binds it
 * still overflows, and that is the honest answer rather than something to absorb
 * into a constant: slack under two lines means a column that has already used
 * everything the viewport had, and a log that opened into nothing there would be
 * a control that does not work. A two-line list that costs the page a few pixels
 * of scroll is the better trade than a nine-line one that starts it.
 */

/** `text-xs` is a 16px line box; `space-y-1` puts 4px between entries. A
 * *wrapped* entry is two or three of these, so this is a floor in lines rather
 * than a promise about entries. */
const LINE = 16;
const GAP = 4;
/** The list's own `py-2`, and the `border-t` it is separated from the collapsed
 * line by. `box-sizing: border-box`, so `maxHeight` is over all of it. */
const FRAME = 17;

/** Two whole lines. Below this a list is a window rather than a list. */
export const LOG_MIN_LIST = FRAME + LINE * 2 + GAP;

/**
 * The most the open list may come to, in whole pixels.
 *
 * @param slack the room the piles are sitting in beyond what they need, read
 *   while the log is collapsed
 */
export const logList = (slack: number): number => Math.max(LOG_MIN_LIST, Math.floor(slack));
