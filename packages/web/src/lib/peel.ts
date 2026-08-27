/**
 * When each piece of the peel moves, inside the beat the peel already has
 * (#356).
 *
 * **The length of the hold was not the length of the movement.** `PEEL_MS` is
 * 2600, and everything in it used to be over inside the first fifth: every card
 * played since the reach slid aside at once in 420ms, and the named card arrived
 * 200ms into that and was there by 540. Then the screen was a still photograph
 * for two seconds. That reads as *flash, then wait*, which is what people
 * describe as it going past too fast — the hold was never what they missed, the
 * transition was.
 *
 * What it reads as now is the thing the existing pieces were always doing, given
 * the time to do it:
 *
 * 1. The card in play now **slides aside and dims**, uncovering what was really
 *    in play at the reach. More than one card can have landed since, and they go
 *    **one after another, oldest first**, so the table watches the pile being
 *    wound back rather than being handed a fan.
 * 2. Only once the board is back to the reach does the **named card arrive**
 *    beside it. Its own beat, not a 200ms overlap with the one above.
 * 3. Then a stillness, and then the ruling.
 *
 * **Step 3 is a figure rather than whatever is left over**, and it is what keeps
 * this honest as the number of cards grows: the aside phase is given a fixed
 * room, and a longer queue tightens the stagger inside it instead of eating into
 * the settle or running past `PEEL_MS`. A peel whose last card arrived as the
 * announcement did would be the old bug the other way round.
 *
 * It is arithmetic, so it is here rather than in `SunnyPeel.tsx` — nothing in
 * this repo renders a component in a test.
 *
 * Two things it does not touch. **A wrong call peels identically to a right
 * one**, at the same speed for the same length of time: the schedule is a
 * function of how many cards have landed since the reach and of nothing else,
 * which is what keeps it from being the tell #50 removed (#63). And the whole of
 * it fits inside `PEEL_MS`, so `compress`'s `floor` in `motion/plan.ts` — set off
 * the cursor past that hold — still clears it, and a recycle in the same breath
 * still queues behind the peel (#209).
 */

import { PEEL_MS } from "./beats.ts";

/** One card sliding aside and dimming. 620 rather than #63's 420: this is the
 * beat that has to read as *deliberate* from across a table. */
const ASIDE_MS = 620;

/** Between one card starting aside and the next. Slightly under `ASIDE_MS`, so
 * the pile winds back as a sequence with the cards just overlapping rather than
 * as a queue of separate events. */
const STAGGER_MS = 520;

/** The board is back; nothing moves. Short, but it is what makes the named card
 * a second beat rather than the tail of the first. */
const GAP_MS = 260;

/** The named card arriving beside the card it should have been played on. */
const MARK_MS = 520;

/** The finished pairing, standing still, before the ruling is said. The two
 * ringed cards are the whole message and they have to be *looked at*. */
const SETTLE_MS = 700;

/** All the aside phase may spend. Whatever is left of the hold once the named
 * card's beat and the stillness after it are reserved. */
const ASIDE_ROOM = PEEL_MS - SETTLE_MS - MARK_MS - GAP_MS;

export interface PeelSchedule {
  /** How long each card takes to slide aside. */
  asideMs: number;
  /** Added per card, oldest first, so they go one after another. */
  staggerMs: number;
  /** From the top of the peel to the named card starting to arrive. */
  markDelayMs: number;
  /** How long it takes to arrive. */
  markMs: number;
}

/**
 * @param since how many cards have landed on the pile since the reach. Usually
 *   none or one — the window shuts on the next player's first action — but it is
 *   not bounded, so the stagger is.
 */
export const peelSchedule = (since: number): PeelSchedule => {
  const cards = Math.max(0, Math.floor(since));
  // One card has nothing to be staggered against; none has nothing to slide.
  const staggerMs =
    cards < 2 ? 0 : Math.max(0, Math.min(STAGGER_MS, (ASIDE_ROOM - ASIDE_MS) / (cards - 1)));
  const asideEnd = cards === 0 ? 0 : staggerMs * (cards - 1) + ASIDE_MS;
  return {
    asideMs: ASIDE_MS,
    staggerMs: Math.round(staggerMs),
    markDelayMs: Math.round(asideEnd + GAP_MS),
    markMs: MARK_MS,
  };
};

/** When the last thing to move has finished, for the test that holds the whole
 * schedule inside the hold it is drawn in. */
export const peelEndsAt = (schedule: PeelSchedule): number =>
  schedule.markDelayMs + schedule.markMs;
