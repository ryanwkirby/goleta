/**
 * It's you — from across the table, with the phone flat on the felt. Knowing it
 * was your turn used to require reading, and at a table of six the commonest
 * thing anybody said out loud was "it's you" (#190).
 *
 * It says **is it me**, and nothing else. **Nothing about your cards** — same
 * glow whether you hold a play or are about to be caught. **It does not replace
 * the prompt.**
 *
 * **It is not a timer, and the breathe is not one either** (#254). Nothing about
 * the animation varies with how long you have been sitting there: one period,
 * one pair of endpoints, the same at second one and second ninety. What is
 * banned is anything that reads as a countdown — a ramp, a brightening, a second
 * stage — because that is pressure on the decision the Sunny Rule wants people
 * to take their time over. A constant breathe is what keeps the eye seeing an
 * edge it would otherwise stop noticing. `index.css` has the shape of it.
 *
 * Driven by `waitingOn`, so it covers naming a suit under Power of Eights and
 * the card owed after a landed call. **It goes to the physical edge, not the
 * safe area** (#124), and `z-20` puts it under every dialog.
 */
export function TurnGlow() {
  return <div aria-hidden className="turn-glow pointer-events-none fixed inset-0 z-20" />;
}
