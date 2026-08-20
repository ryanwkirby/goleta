
/**
 * Naming the suit, without being shut in a box to do it. Choosing well means
 * counting what everyone else is holding — the whole table is face up for that
 * reason — so a scrim would take the evidence away at the one moment you need
 * it. Your own cards aren't tappable during this phase anyway.
 */
export function SuitPicker({
  onPick,
  compact = false,
}: {
  onPick: (suit: "C" | "D" | "H" | "S") => void;
  /**
   * Landscape: one row of four, shorter, and the aside goes. Docked into the
   * hand column, which is *measured* — `handHeight` sizes the player's cards to
   * what this leaves (#166), so a row added here comes off their cards.
   */
  compact?: boolean;
}) {
  const suits = [
    { key: "H", glyph: "♥", label: "Hearts", red: true },
    { key: "D", glyph: "♦", label: "Diamonds", red: true },
    { key: "S", glyph: "♠", label: "Spades", red: false },
    { key: "C", glyph: "♣", label: "Clubs", red: false },
  ] as const;

  return (
    <section
      aria-label="Name a suit"
      className={[
        "z-20 rounded-2xl bg-felt-900/95 shadow-xl ring-1 ring-amber-300/40 backdrop-blur",
        compact ? "p-2" : "sticky bottom-2 p-3",
      ].join(" ")}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-amber-300">Name a suit</h2>
        {compact ? null : (
          <p className="truncate text-xs text-white/50">
            Take your time — look at the next players' cards.
          </p>
        )}
      </div>
      <div className={["grid grid-cols-4", compact ? "mt-1.5 gap-1.5" : "mt-2 gap-2"].join(" ")}>
        {suits.map((suit) => (
          <button
            key={suit.key}
            type="button"
            onClick={() => onPick(suit.key)}
            aria-label={suit.label}
            className={[
              "flex flex-col items-center justify-center gap-0.5 rounded-xl bg-white",
              compact ? "min-h-11 text-xl" : "min-h-14 text-2xl",
              "font-semibold shadow-lg transition-transform hover:-translate-y-0.5",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
              suit.red ? "text-rose-600" : "text-slate-900",
            ].join(" ")}
          >
            <span aria-hidden>{suit.glyph}</span>
            <span className="text-[0.65rem] font-medium text-slate-500">{suit.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
