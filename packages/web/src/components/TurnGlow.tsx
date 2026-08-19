/**
 * It's you — from across the table, with the phone flat on the felt.
 *
 * Knowing it was your turn used to require reading. The prompt says *Your
 * turn.* and your hand picks up a one-pixel amber ring, and at a table of six
 * people who are looking at each other rather than at their phones, both get
 * missed: the commonest thing anybody had to say out loud was "it's you"
 * (#190). So the four edges of the display light up in the same amber the
 * ring and the prompt already use, for exactly as long as the table is waiting.
 *
 * What it says is **is it me**, and nothing else at all:
 *
 * - **Nothing about your cards.** The same glow whether you hold a play or
 *   not, whether you are stuck, whether you are about to be caught. The app
 *   does not tell you which of your cards are playable and this is not a way in
 *   (see `AGENTS.md`).
 * - **It is not a timer.** No ramp, no pulse, no intensifying. A glow that grew
 *   would be pressure on precisely the decision the Sunny Rule wants people to
 *   take their time over — and a thing that never moves is also the simplest
 *   possible answer to `prefers-reduced-motion`: there is nothing to reduce.
 * - **It does not replace the prompt.** The prompt still says what is being
 *   asked for, in words, and the hand keeps its ring. This is the cue you catch
 *   without reading anything.
 *
 * It is driven by `waitingOn`, not by whose turn it is, so it covers the two
 * moments the table waits on you while somebody else holds the turn: naming a
 * suit under the Power of Eights, and the punishment card owed after a landed
 * call.
 *
 * **It goes to the physical edge, not to the safe area.** The felt already
 * bleeds there and the content insets from it (#124); this belongs with the
 * felt. `fixed inset-0` and nothing else — no padding, no insets, no `env()`.
 *
 * `z-20` puts it over the felt and the table's own furniture and under every
 * dialog in the app, which start at `z-30`. That is the right way round: a
 * ruling, a graduation or a picker is a thing to read, and an edge of light
 * behind the scrim of one is light nobody needs.
 */
export function TurnGlow() {
  return <div aria-hidden className="turn-glow pointer-events-none fixed inset-0 z-20" />;
}
