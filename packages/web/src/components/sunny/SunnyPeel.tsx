import { type CSSProperties } from "react";

import type { Card, SunnyEvidence } from "@goleta/engine";

import { PlayingCard } from "../Card.tsx";
import { SUIT_LABEL, type CardSize } from "../../lib/cardShape.ts";

/** A card said aloud, for the one caption a screen reader gets. */
const spoken = (card: Card): string => `${card.rank} of ${SUIT_LABEL[card.suit]}`;

/**
 * A card the evidence is pointing at: the table's usual amber ring, plus a word
 * for what it is.
 *
 * `lift` raises it clear of whatever it is sitting on, which is what pulls a
 * named card back out of the faded part of the pile when they have already
 * played it. The card in play doesn't take it — it is drawn over the pile's own
 * top card, and lifting it would show a second card's edge underneath.
 */
function Marked({
  card,
  label,
  size,
  lift = false,
  irl = false,
}: {
  card: Card;
  label: string;
  size: CardSize;
  lift?: boolean;
  irl?: boolean;
}) {
  return (
    <span
      className={[
        "relative inline-flex ring-2 ring-amber-400",
        size === "lg" ? "rounded-xl" : "rounded-lg",
        lift ? "-translate-y-3" : "",
      ].join(" ")}
    >
      <span
        className={[
          "absolute -top-4 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full",
          "bg-felt-950/90 px-1.5 text-[0.6rem] font-semibold uppercase tracking-wider text-amber-300",
        ].join(" ")}
      >
        {label}
      </span>
      <PlayingCard card={card} size={size} mirrored={irl} />
    </span>
  );
}

/**
 * The evidence, held up at the pile: what was actually in play when they
 * reached, and the card the caller says they should have played instead.
 *
 * The pile peels back to get there. Everything played on top of the offence
 * fans aside and drops to near-transparent, leaving the card that was in play
 * underneath — which is where the ruling was made, and where it can be read
 * rather than believed. It runs identically for a call that landed and a call
 * that missed: the difference the table is meant to see is whether the two
 * marked cards match, not which banner follows. (#63)
 *
 * Two cards are marked and no others. A wrong call names a card that was in a
 * hand full of other cards, and lighting up the one they *should* have named
 * would hand over the answer the ruling itself withholds — and make the next
 * call automatic. This shows what was claimed and what was on the table; it
 * does not grade the claim.
 *
 * Drawn absolutely, out of the pile card it sits on, so the row underneath
 * neither moves nor gives up its anchor: a card flying to the pile mid-peel
 * lands exactly where it always would, under the evidence. Nothing here reads
 * live state either — it is all off the event — so a bot playing on into the
 * peel can't pull the presentation out from under itself.
 */
export function SunnyPeel({
  evidence,
  named,
  callerName,
  targetName,
  irl = false,
}: {
  evidence: SunnyEvidence;
  /** The card the caller named. Marked wherever it now happens to be. */
  named: Card;
  callerName: string;
  targetName: string;
  irl?: boolean;
}) {
  const { inPlay, since, activeSuit } = evidence;
  // They may have gone on to play the very card they stand accused of holding.
  const buried = since.some((card) => card.id === named.id);
  const suitNote = activeSuit === inPlay.suit ? "" : `, with ${SUIT_LABEL[activeSuit]} called`;

  return (
    <>
      {/* The evidence in words, said before the ruling is, so a screen reader
          gets the two in the same order as the table. */}
      <p role="status" className="sr-only">
        {targetName} reached for the deck with the {spoken(inPlay)} in play{suitNote}.{" "}
        {callerName} says they should have played the {spoken(named)}.
      </p>

      {/* What was in play at the reach, over whatever is showing now. On a call
          that landed they are already the same card, which is what lets the
          peel hand off into the rewind without the pile jumping. */}
      <span aria-hidden className="pointer-events-none absolute left-0 top-0">
        <Marked card={inPlay} label="was in play" size="lg" irl={irl} />
      </span>

      {/* Played since the offence, fanned off the top — oldest first, so the
          last one out is the card that was showing a moment ago. They overlap
          to a sliver of rank and suit, the same trade the seat fans make, which
          is what keeps the fan inside a phone. The rules keep it short anyway:
          the window shuts on the next player's first action, so there is rarely
          more than one card up here and often none, in which case this is empty
          and the peel is a plain highlight of the pair. */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-full top-1/2 z-10 -ml-10 flex -translate-y-1/2"
      >
        {since.map((card, index) => (
          <span
            key={card.id}
            className={[
              "relative animate-peel-aside",
              index === 0 ? "" : since.length > 2 ? "-ml-16" : "-ml-14",
            ].join(" ")}
            style={
              {
                "--peel-from": `calc(-3rem - ${index} * 0.75rem)`,
                "--peel-tilt": `${(index + 1) * 5}deg`,
                ...(card.id === named.id ? { "--peel-opacity": 1 } : {}),
              } as CSSProperties
            }
          >
            {card.id === named.id ? (
              <Marked card={card} label="named" size="md" lift irl={irl} />
            ) : (
              <PlayingCard card={card} size="md" mirrored={irl} />
            )}
          </span>
        ))}
      </span>

      {/* Still in their hand, so it is shown beside the card it was supposed to
          be played on. The pairing is the whole message. */}
      {buried ? null : (
        <span
          aria-hidden
          className={[
            "pointer-events-none absolute right-full top-1/2 z-10 mr-6",
            "-translate-y-1/2 animate-peel-mark",
          ].join(" ")}
        >
          <Marked card={named} label="named" size="md" lift irl={irl} />
        </span>
      )}
    </>
  );
}
