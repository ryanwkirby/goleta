/**
 * The stack, named once (#297).
 *
 * Everything here is drawn `fixed` against the viewport at the root of the page,
 * so these are the pieces that genuinely stack against each other. The `z-10`s
 * and `z-20`s scattered inside components — a lifted card, the peel's marks, a
 * docked picker over the felt — are ordering within their own positioned parent
 * and are deliberately not in this list. Adding them would suggest they compete
 * with these, and they cannot.
 *
 * The bug that produced it: `FlightLayer` portals to `document.body`, which
 * makes it the last child of the page, and it was `z-50` — the same rung as the
 * settings dialog and the invite. A tie is broken by DOM order, so a card drawn,
 * played or dealt underneath an open panel flew **across the front of it**. Bots
 * keep moving under a dialog by design, so that was most of what happened while
 * somebody read the settings.
 *
 * **Cards fly over the table and under everything laid on top of it.** That is
 * the whole rule, and it is why `flights` has a rung of its own between the glow
 * and the panels rather than sharing one with either.
 *
 * The numbers exist to be compared, so they live together. **Do not write a bare
 * `z-…` on anything that is `fixed` to the viewport** — put it here, where the
 * next person can see what it is being ordered against.
 */
export const LAYER = {
  /** The felt, the table and everything on it: no class at all. Named so the
   * list is the whole stack rather than the top of it. */
  felt: "",

  /** The amber edge saying the table is waiting on you (#190). Under everything,
   * because it is the room rather than a thing in it. */
  glow: "z-20",

  /**
   * Cards in the air (`motion/TableMotion.tsx`). Above the table they are
   * crossing and below every panel over it.
   *
   * The shared table screen is a **different layer** and is not on this list:
   * `TableFlights` lives inside the board's transform and aims in design pixels
   * (#200), so it is ordered against the board's own pieces rather than against
   * these.
   */
  flights: "z-25",

  /**
   * A screen opened **over** the table rather than instead of it: the rules
   * (#360). It has a rung of its own because the table is still running
   * underneath, and both of its neighbours have a claim on it.
   *
   * Above `flights`, because #297's rule is that cards fly over the table and
   * under everything laid on top of it, and this is now something laid on top of
   * it. Below `overlay`, because the table can still need to say something while
   * somebody reads: a Sunny ruling is the one thing nobody may miss, and it is
   * drawn by the table this is covering.
   *
   * **Not `dialog`.** That rung is the top of the stack and is for something
   * opened over a screen — a cog, an invite, a confirmation. This *is* a screen,
   * and the whole point of giving it a rung down here is that it can be
   * interrupted.
   */
  reading: "z-28",

  /** Full-screen panels that announce, teach or ask: the Sunny announcement and
   * explainer, the graduation question, the leave dialog. */
  overlay: "z-30",

  /** The ones that have to sit over a panel: a session refusal, being caught,
   * and being shown where to sit. */
  alert: "z-40",

  /** The ones somebody opened on purpose and is reading: the cog, the invite,
   * the lobby's confirmations. Nothing may be drawn over these. */
  dialog: "z-50",
} as const;
