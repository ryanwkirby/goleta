/**
 * How long a moment the whole table is in lasts. None of these is a decision any
 * one screen gets to make: a judged call is watched on a phone and on the screen
 * in the middle of the table, and it has to be the same length on both — one of
 * them lived in `Table.tsx`, which is how the shared screen came to hold a
 * ruling until the *next* call (#185).
 */

/**
 * Long enough to fan the pile aside and read the two cards that decide it: a
 * glimpse of the evidence would be decoration rather than evidence (#63).
 *
 * **2600 rather than 1700** (#324). This is the one moment the whole table
 * watches and it was also the hardest thing here to follow — a comparison
 * between two cards several feet away, made by people who are looking at each
 * other rather than at the screen. `compress`'s `floor` in `motion/plan.ts` is
 * set from the cursor past this hold rather than from a constant, so it moves
 * with this figure and the peel is still safe from `BATCH_CAP_MS`. A recycle
 * landing in the same breath still queues behind it: the peel goes first,
 * always (#209).
 */
export const PEEL_MS = 2600;

/** The second half of the beat, here for `PEEL_MS`'s reason (#185). Longer for
 * #324's reason as well — and what it now holds is a card and a word rather than
 * four facts in two sentences, so the extra time is for looking up, not
 * reading. */
export const ANNOUNCE_MS = 4200;

/** It used to pass in under half a second, batched with the `drew` and
 * `turnedUp` around it, and people read it as the game skipping ahead (#209). */
export const RESHUFFLE_MS = 4800;

/** Somebody leaving is not an event with cards in it, so it needs no room to be
 * watched in — only long enough to be read across a table while the game carries
 * on underneath it (#256). Shorter than the reshuffle, which is a moment the
 * table is *in*. */
export const DEPARTURE_MS = 3600;
