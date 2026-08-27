
import type { Card } from "@goleta/engine";

import { isRed, SUIT_GLYPH, SUIT_LABEL } from "../../lib/cardShape.ts";
import type { CaughtNarration } from "../../lib/sunnyOffer.ts";
import { Button } from "../ui.tsx";
import { LAYER } from "../../lib/layers.ts";

/** A card named inline, in the suit's colour, the way the log names it. */
function CardChip({ card }: { card: Card }) {
  return (
    <span
      className={[
        "inline-block rounded px-1 py-px font-semibold tabular-nums",
        "bg-white",
        isRed(card.suit) ? "text-rose-600" : "text-slate-900",
      ].join(" ")}
      aria-label={`${card.rank} of ${SUIT_LABEL[card.suit].toLowerCase()}`}
    >
      <span aria-hidden>
        {card.rank}
        {SUIT_GLYPH[card.suit]}
      </span>
    </span>
  );
}

/**
 * The cards as a list — `2♣, 10♦ and 2♥`. Written out rather than joined with
 * commas throughout, because this is a sentence and the last card in it is about
 * to be named again on its own.
 */
function CardList({ cards }: { cards: Card[] }) {
  return (
    <>
      {cards.map((card, index) => (
        <span key={card.id}>
          {index === 0 ? null : index === cards.length - 1 ? " and " : ", "}
          <CardChip card={card} />
        </span>
      ))}
    </>
  );
}

/**
 * A call rewinds the game, takes two cards off you and hands everyone a new card
 * to match, and until #66 the table narrated none of it: the announcement
 * expired on a timer while the forced play sat one tap away. Only the offender
 * sees it, and it gives nothing away — the play named is one they have already
 * been caught not making.
 *
 * **Three steps are three steps** (#324). This was the wordiest thing in the
 * app: a four-sentence paragraph and then a numbered list whose every item was
 * itself a full sentence, put in front of somebody who has just been caught and
 * wants to know what it costs. The paragraph is one line and each step is a
 * fragment. Nothing here gets its words back: the cases that are not the
 * ordinary one say so rather than promising a step that will not come, and they
 * say it as briefly as the rest.
 *
 * **It was written for one offence and there are two** (#260, #363). A player
 * who drew three times legally, was handed a play by the third card, pressed
 * **I'm done** and got called on it was told that they drew when they hadn't and
 * that they had reached for an empty deck when the deck was full — the only two
 * sentences on the screen that say what happened, both wrong. The line and the
 * third step are `caughtNarration` in `lib/sunnyOffer.ts` now, with tests, since
 * nothing in this repo renders a component in a test and this file is where both
 * mistakes had been living.
 *
 * **The three steps are one thread, not three losses** (#381). Step 1 put a card
 * on the pile and step 3 said a *different* card was what everyone matched, with
 * nothing in between to say why — so the first instruction read as pointless.
 * What actually happens is a stack, and `docs/RULES.md` has had it all along:
 * the forced play lands, the punishment card is tucked **under** the pile (#364),
 * and then every illegally drawn card goes face up **on top of** the forced play.
 * So step 2 says where its card goes, which is the one difference between it and
 * step 3 that matters, and step 3 gives the cards back rather than losing them
 * again.
 *
 * **And it names the one card that ends up in play.** "That's what everyone
 * matches next" pointed at all three at once, where `turnUp` does
 * `s.activeSuit = last.suit` and the other two are simply gone — two answers in
 * three wrong, for the player least able to shrug it off. Which card that is is
 * `caughtNarration`'s to decide, not this file's, for the reason the offence and
 * the third step already are.
 *
 * **This does not relax #260.** Nothing on any screen may separate an honest end
 * from a dishonest one *before* a call: no disabled state, no hint, nothing in
 * the prompt or the log while the window is open. This is drawn after one has
 * landed, to the offender alone, about an offence the table has already been
 * told about — the announcement and the peel rule identically either way.
 */
export function SunnyCaught({
  callerName,
  skipped,
  narration,
  owesPunishment,
  nameOf,
  onDone,
}: {
  callerName: string;
  /** The plays that were open to you. Usually one; occasionally a choice. */
  skipped: Card[];
  /** Which offence it was, and which of the four things step three does — both
   * decided in `lib/sunnyOffer.ts`, neither inferred here. */
  narration: CaughtNarration;
  /** False when the skipped play is your last card: it eliminates you on the spot,
   * so promising a step that will never come would be its own small lie. */
  owesPunishment: boolean;
  nameOf: (playerId: string) => string;
  onDone: () => void;
}) {
  const only = skipped.length === 1 ? skipped[0] : null;
  const step3 = narration.step3;

  return (
    <div
      role="alertdialog"
      aria-modal
      aria-label="Caught by the Sunny Rule"
      className={[
        `fixed inset-0 ${LAYER.alert} flex items-end justify-center bg-black/70 sm:items-center`,
        "pt-[max(1rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))]",
        "pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))]",
      ].join(" ")}
    >
      <div className="flex w-full max-h-full max-w-md flex-col overflow-hidden rounded-2xl bg-felt-900 ring-1 ring-amber-300/40">
        <div className="overflow-y-auto p-5 pb-4">
          {/* The sun and the line under it both carry the rule, so the title
              need not name it a third time. */}
          <h2 className="text-xl font-semibold text-amber-300">
            <span aria-hidden>☀️</span> You were caught!
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-white/80">
            <strong className="text-white">{callerName}</strong> was right —{" "}
            {narration.offence === "endTurn"
              ? 'you said you were "done" when you had a playable card'
              : "you drew a card illegally"}
            . Your turn is forfeit.
          </p>

          <ol className="mt-4 space-y-2 text-sm leading-relaxed text-white/80">
            <li className="flex gap-2.5">
              <span className="font-semibold text-amber-300">1.</span>
              <span>
                {only ? (
                  <>
                    Play the <CardChip card={only} />.
                  </>
                ) : (
                  "Play the card you skipped."
                )}
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="font-semibold text-amber-300">2.</span>
              <span>
                {owesPunishment
                  ? "Give up any card — it goes under the pile, out of play."
                  : "That was your last card — no punishment to pay. It puts you out."}
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="font-semibold text-amber-300">3.</span>
              <span>
                {step3.kind === "returned" ? (
                  <>
                    Give back the <CardList cards={step3.cards} /> you drew.{" "}
                    {step3.cards.length > 1 ? (
                      <>
                        They go face up on top, and the <CardChip card={step3.board} /> is what
                        everyone matches next.
                      </>
                    ) : (
                      <>It goes face up on top, and that's what everyone matches next.</>
                    )}
                  </>
                ) : step3.kind === "recycled" ? (
                  "The deck is empty — the pile is shuffled back and a fresh card turned up."
                ) : step3.kind === "resumes" ? (
                  <>The game resumes: it's {nameOf(step3.playerId)}'s turn.</>
                ) : (
                  "Nothing to turn up."
                )}
              </span>
            </li>
          </ol>
        </div>

        <div className="shrink-0 p-5 pt-0">
          <Button variant="primary" full onClick={onDone}>
            Take my penalty
          </Button>
        </div>
      </div>
    </div>
  );
}
