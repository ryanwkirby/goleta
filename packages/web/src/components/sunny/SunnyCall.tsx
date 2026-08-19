
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
 * The way you start an accusation, and the most time-critical control here.
 *
 * It used to be a 20px circle wedged between somebody's name and their card
 * count, in a strip that scrolls sideways — half a thumb, aimed at by eye,
 * for the one thing in this app whose window closes when the next player takes
 * their first action. A missed tap was usually a missed call (#189). So: the
 * same sun, at the 44px everything here is designed to, somewhere a thumb can
 * find without aiming.
 *
 * **Leaving the seat is what makes it say who.** There is only ever one
 * `sunnyTargetId`, so the control can name them — *call it on Angela* — which
 * is more legible than a glyph beside a name in a scrolling strip ever was, and
 * it stops the call being a thing you do *to a name in a list*.
 *
 * One state, and that is the entire point. It appears when a draw is standing
 * and you are free to call, and it means only that: somebody reached for the
 * deck. Whether they were allowed to is on the table in front of you, in their
 * hand, and working it out is the game. Nothing here brightens, ramps or
 * otherwise leaks the answer, and a bigger sun must not become a brighter one
 * when a call would land — nothing on the client knows that and nothing ever
 * will (`AGENTS.md`, #50).
 *
 * **Tapping it opens the picker; it does not call.** An accusation names a
 * card, so the tap that starts one cannot be the tap that commits it — and
 * opening the picker also sends `composingCall`, which holds the bots (#73), so
 * the bigger target buys time twice over.
 *
 * `lockedDraws` is the one thing that changes its appearance, and it isn't
 * about the draw at all: it is your own missed call still being served. The
 * server sends it to nobody else, so a caller serving one looks exactly the
 * same on everybody else's screen.
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
        // `min-h-11` rather than a fixed height: 44px is a floor here, exactly
        // as it is in `handFan.ts`, and for the same reason.
        "flex min-h-11 shrink-0 items-center gap-2 rounded-full px-3.5 py-2",
        "text-sm font-semibold shadow-lg ring-1 backdrop-blur-sm transition-colors",
        // Near-black with an amber edge, not a flood of amber: this is a thing
        // to notice, not a verdict, and the table's amber already means *the
        // game is waiting on you* at the edges of the screen (#190).
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
