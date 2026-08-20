/**
 * It's you — from across the table, with the phone flat on the felt.
 *
 * Knowing it was your turn used to require reading a prompt and a one-pixel
 * ring, and at a table of six the commonest thing anybody said out loud was
 * "it's you" (#190). The four edges light up in the amber the ring and the
 * prompt already use, for exactly as long as the table is waiting.
 *
 * It says **is it me**, and nothing else. **Nothing about your cards** — same
 * glow whether you hold a play, are stuck, or are about to be caught. **It is
 * not a timer**: no ramp, no pulse, because that would be pressure on the
 * decision the Sunny Rule wants people to take their time over, and a thing
 * that never moves is also the whole of what `prefers-reduced-motion` needs.
 * **It does not replace the prompt**, which still says what is being asked for.
 *
 * Driven by `waitingOn` rather than the turn, so it covers naming a suit under
 * Power of Eights and the card owed after a landed call.
 *
 * **It goes to the physical edge, not the safe area**: the felt bleeds there and
 * the content insets from it (#124). `z-20` puts it over the felt and under
 * every dialog — a ruling or a picker is a thing to read.
 */
export function TurnGlow() {
  return <div aria-hidden className="turn-glow pointer-events-none fixed inset-0 z-20" />;
}
