/**
 * "I'm done" — the end of a drawn-out turn, said rather than done to you (#260).
 *
 * The turn used to end itself after a third fruitless draw, which was one action
 * doing two things: the second shut the challenge window on the first, with the
 * next seat on the clock the instant the third card landed. The third reach is
 * the hardest one to judge, because by then the offender is holding three more
 * cards than the table has been reading. Now the window stays open for as long
 * as the player takes.
 *
 * **Pressing it while holding a play is permitted, silently.** Must-play has not
 * changed, so it is a lie, and it is a Sunny violation like a reach for the deck.
 * It is the first rule in `AGENTS.md` § "Rules that look like bugs and are not"
 * applied to a second control, so all of it holds here: **no disabled state, no
 * confirmation, no "are you sure?", no hint**, and nothing on any screen — before
 * or after — separating an honest end from a dishonest one. It looks exactly the
 * same either way, which is what makes it worth building.
 *
 * **It is drawn whenever `canEndTurn` is**, and that flag says nothing about
 * your cards: it is exactly as true when the third draw handed you a play as
 * when it left you stuck.
 *
 * **Nowhere near the draw pile**, in either layout. It can now commit an offence,
 * so #189's argument about a fat target beside the deck applies to it in reverse.
 * And **never under the cards**: `handHeight` reads the room the row is left, so
 * a control appearing there would resize the hand under a thumb (#131).
 */

import { Button } from "./ui.tsx";

export function EndTurnButton({
  onEndTurn,
  className = "",
}: {
  onEndTurn: () => void;
  className?: string;
}) {
  return (
    <Button variant="primary" className={`px-6 ${className}`} onClick={onEndTurn}>
      I'm done
    </Button>
  );
}
