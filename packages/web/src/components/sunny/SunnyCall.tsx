/**
 * The sun: the way an accusation starts. **Rules converge here**; `AGENTS.md` is
 * the authority. **One look, and a bigger sun must never become a brighter one
 * when a call would land** (#50, #189) — nothing on the client knows whether it
 * would. **The disabled variant is your own missed call still being served**,
 * sent to nobody else. **44px, and nowhere near the draw pile** in either
 * layout. **Tapping it opens the picker and does not call.**
 *
 * **Quiet, and still large** (#257). #189 made it big because a 20px circle in a
 * scrolling seat strip was a missed call, and that was right; it overshot on
 * presence. A call window opens on **every draw**, which is most turns of most
 * games, so a bold amber sentence was the widest thing over the felt almost
 * continuously — for an action that is correctly used rarely. It is small print
 * and the app's ordinary grey now, and the target is untouched: a smaller-looking
 * control, not a smaller one. Amber at this table means *the game is waiting on
 * you* (#190), and this is not that.
 */

/** A plain outline. It is furniture until it has something to say. */
function SunGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      className="h-full w-full"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.4v2.6M12 19v2.6M2.4 12h2.6M19 12h2.6M5.2 5.2l1.9 1.9M16.9 16.9l1.9 1.9M18.8 5.2l-1.9 1.9M7.1 16.9l-1.9 1.9" />
    </svg>
  );
}

/**
 * It used to be a 20px circle wedged between a name and a card count, in a strip
 * that scrolls sideways, for the one control whose window closes when the next
 * player acts — a missed tap was usually a missed call (#189).
 *
 * **Leaving the seat is what makes it say who.** There is only ever one
 * `sunnyTargetId`, so the control names them, which stops the call being a thing
 * you do *to a name in a list*. Opening the picker also holds the bots (#73).
 *
 * A sun with a name **under** it rather than a sentence with a sun in front of
 * it: the glyph does the work of being findable and the name does the work of
 * saying who, and neither needs "call it on" to say so. A nameless sun would not
 * do — naming one person is the point.
 */
export function SunnyCall({
  targetName,
  lockedReaches = 0,
  onCall,
  inline = false,
  className = "",
}: {
  targetName: string;
  lockedReaches?: number;
  onCall?: () => void;
  /**
   * Glyph and name side by side rather than stacked, for the peek strip's left
   * cluster (#329). That cluster is the only part of a row that must never wrap
   * — the right-hand end is the draw pile, and anything pushed off it wraps the
   * pile onto a second line, a card's height off the hand — so a control there
   * has to read as one line of small print, the way the fullscreen offer beside
   * it does. It is a layout, exactly as `className` is: **nothing here varies
   * with whether a call would land**, and it never will (#50).
   */
  inline?: boolean;
  className?: string;
}) {
  const locked = lockedReaches > 0;
  const label = locked
    ? `Your last call missed — ${lockedReaches} more ${lockedReaches === 1 ? "reach" : "reaches"} before you can call again`
    : `Call the Sunny Rule on ${targetName}`;

  return (
    <button
      type="button"
      onClick={locked ? undefined : onCall}
      disabled={locked}
      title={label}
      aria-label={label}
      className={[
        // `min-h-11`/`min-w-11` rather than fixed: 44px is a floor here, as in
        // `handFan.ts` and for the same reason. What #257 shrank is the ink.
        "flex min-h-11 min-w-11 shrink-0 items-center justify-center",
        inline ? "flex-row gap-1.5" : "flex-col gap-0.5",
        "rounded-xl px-2 py-1 transition-colors",
        // A dark backing and nothing else. It is drawn over the felt and, with a
        // wide fan, over a corner of a card, so it needs something to stand on —
        // but no amber and no ring: this is small print, not a verdict.
        "bg-black/40 backdrop-blur-sm",
        locked ? "cursor-not-allowed text-white/25" : "text-white/60 hover:text-white/90",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
        className,
      ].join(" ")}
    >
      <span aria-hidden className="h-5 w-5 shrink-0">
        <SunGlyph />
      </span>
      {/* Truncated rather than wrapped: this is one line of small print under a
          glyph, and a two-line name would move the sun. */}
      <span className="max-w-20 truncate text-[0.65rem] font-medium leading-none">
        {targetName}
      </span>
    </button>
  );
}
