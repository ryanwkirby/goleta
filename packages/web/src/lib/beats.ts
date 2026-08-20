/**
 * How long a moment the whole table is in lasts. None of these is a decision any
 * one screen gets to make: a judged call is watched on a phone and on the screen
 * in the middle of the table, and it has to be the same length on both. One of
 * them lived in `Table.tsx`, which is how the shared screen came to hold a
 * ruling until the *next* call (#185).
 *
 * This is the length of the *moment*; how a flight is drawn inside one stays
 * with the planner.
 */

/** Long enough to fan the pile aside and read the two cards that decide it — a
 * glimpse of the evidence would be decoration rather than evidence. Evidence,
 * then ruling, then consequence (#63). */
export const PEEL_MS = 1700;

/** The second half of the beat, here for `PEEL_MS`'s reason (#185). */
export const ANNOUNCE_MS = 3200;

/**
 * How long the whole table stops for a reshuffle (#209). It used to pass in
 * under half a second, batched with the `drew` and `turnedUp` around it, and
 * people read it as the game skipping ahead. Affordable because it happens once
 * or twice a game.
 */
export const RESHUFFLE_MS = 4800;
