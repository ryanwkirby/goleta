/**
 * The sun: the way an accusation starts.
 *
 * **Rules converge here.** `AGENTS.md` § "Rules that look like bugs and are not"
 * is the authority; in brief:
 *
 * - **One look, and a bigger sun must never become a brighter one when a call
 *   would land** (#50, #189). Nothing on the client knows whether it would.
 * - **The disabled variant is the only second look**, and it is your own missed
 *   call still being served — sent to nobody else, so a locked-out caller is
 *   indistinguishable from any other on every screen but their own.
 * - **44px, and nowhere near the draw pile** in either layout (#189).
 * - **Tapping it opens the picker and does not call.** An accusation names a
 *   card, so the tap that starts one cannot be the tap that commits it.
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
 * you do *to a name in a list*. It means only that somebody reached for the
 * deck; whether they were allowed to is on the table in front of you.
 *
 * Opening the picker also sends `composingCall`, which holds the bots (#73).
 */
export function SunnyCall({
  targetName,
  lockedDraws = 0,
  onCall,
  className = "",
}: {
  targetName: string;
  lockedDraws?: number;
  onCall?: () => void;
  className?: string;
}) {
  const locked = lockedDraws > 0;
  const label = locked
    ? `Your last call missed — ${lockedDraws} more ${lockedDraws === 1 ? "draw" : "draws"} before you can call again`
    : `Call the Sunny Rule on ${targetName}`;

  return (
    <button
      type="button"
      onClick={locked ? undefined : onCall}
      disabled={locked}
      title={label}
      aria-label={label}
      className={[
        // `min-h-11` rather than a fixed height: 44px is a floor here, as in
        // `handFan.ts` and for the same reason.
        "flex min-h-11 shrink-0 items-center gap-2 rounded-full px-3.5 py-2",
        "text-sm font-semibold shadow-lg ring-1 backdrop-blur-sm transition-colors",
        // Near-black with an amber edge rather than a flood: a thing to notice, not a
        // verdict, and the table's amber already means *waiting on you* (#190).
        locked
          ? "cursor-not-allowed bg-black/50 text-white/25 ring-white/10"
          : "bg-black/65 text-amber-200 ring-amber-300/50 hover:bg-black/80 hover:text-amber-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
        className,
      ].join(" ")}
    >
      <span aria-hidden className="h-6 w-6 shrink-0">
        <SunGlyph />
      </span>
      <span className="whitespace-nowrap">call it on {targetName}</span>
    </button>
  );
}
