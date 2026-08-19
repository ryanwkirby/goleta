/**
 * How long a moment the whole table is in lasts.
 *
 * Three numbers, and what makes them one file is that none of them is a
 * decision any single screen gets to make. A judged call is watched on a
 * player's phone and on the screen propped in the middle of the table, and it
 * has to be the same length on both — the shared screen once held a ruling
 * until the *next* call, which at a quiet table is the rest of the game (#185),
 * precisely because one of these lived in `Table.tsx`.
 *
 * They already referred to each other in prose from two different modules
 * ("next to `PEEL_MS` and `ANNOUNCE_MS`", "beside `PEEL_MS`") while sitting in
 * `motion/plan.ts` and `lib/judgedCall.ts` respectively. That split is also
 * what put `lib` and `motion` in a cycle: the two hooks that time these moments
 * are pure enough to live in `lib`, and had to reach into the flight planner to
 * find out how long the moment was (#224).
 *
 * This is the length of the *moment*. How a flight is drawn inside one —
 * `RESHUFFLE_CARDS`, `RESHUFFLE_BEAT_MS`, the stagger — stays with the planner,
 * which is the thing that draws it.
 */

/**
 * How long the pile spends peeled back over a judged call before anything is
 * allowed to move again: long enough to fan the pile aside and then read the
 * two cards that decide it, since a glimpse of the evidence would be
 * decoration rather than evidence.
 *
 * The table sees the evidence, then the ruling, then the consequence — a rewind
 * that started underneath the evidence would be the consequence arriving first.
 * `Table.tsx` holds the peel itself up for exactly this long, and the ruling
 * banner follows it. (#63)
 */
export const PEEL_MS = 1700;

/**
 * How long the table looks at "X called it on Y" before anything else.
 *
 * The second half of the beat, and it lives here beside `PEEL_MS` for the same
 * reason: it is the length of a moment the whole table is in, not a decision
 * either screen gets to make on its own. It used to be a constant in
 * `Table.tsx`, which is how the shared screen came to have no timer at all —
 * it read `peeling` off this hook and then held the ruling until the *next*
 * call, which at a quiet table is the rest of the game (#185).
 */
export const ANNOUNCE_MS = 3200;

/**
 * How long the whole table stops for a reshuffle (#209).
 *
 * It is one of the biggest things that happens in a game and it used to pass in
 * under half a second — three face-down cards at 260ms on a 60ms stagger, and
 * less than that in practice, because a recycle always arrives batched with the
 * `drew` and `turnedUp` around it and `BATCH_CAP_MS` squeezed the whole burst
 * into 900ms. What people at the table saw was the deck count jumping, the pile
 * dropping to one card, the card to match changing, and play carrying on. They
 * read it as the game skipping ahead and asked what had happened.
 *
 * Five seconds, next to `PEEL_MS` and `ANNOUNCE_MS`, because it is the same
 * kind of number: the length of a moment the whole table is in, rather than a
 * decision any one screen gets to make. It is affordable because this happens
 * once or twice in a game rather than once a turn — if a variant ever makes it
 * frequent, this is the figure to revisit.
 */
export const RESHUFFLE_MS = 4800;
