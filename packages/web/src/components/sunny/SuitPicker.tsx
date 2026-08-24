/**
 * Choosing the suit, without being shut in a box to do it.
 *
 * **It asks for a choice rather than a name** (#305). *Name a suit* is the
 * game's own word for it — `docs/RULES.md` and the engine keep it, and it is
 * still what the table is told about somebody else — but it is not what anybody
 * sitting down says they are doing. That word now lives on the `aria-label` and
 * on the prompt line above, rather than on a heading of its own: see below.
 * Choosing well means counting what everyone else is holding — the whole table
 * is face up for that reason — so a scrim would take the evidence away at the
 * one moment you need it. Your own cards aren't tappable during this phase
 * anyway.
 *
 * **There is no heading, because the line above is already it** (#350). This
 * had an `<h2>Choose a suit</h2>` and the aside beside it in one
 * `justify-between` row, and upright on a phone the row wanted 376px of the
 * 342px it had: the aside truncated after `players'` and the heading found the
 * rest by wrapping, so the picker's title read *Choose a* / *suit* with the
 * aside `items-baseline`-aligned against the first half of it. What made that
 * worth deleting rather than re-laying-out is that `turnPrompt` returns
 * "Choose a suit." for this phase when it is yours (`lib/format.ts`), and the
 * docked picker renders directly under that line — so the fix takes away a
 * duplicate rather than an answer. `aria-label` keeps the picker named.
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
      aria-label="Choose a suit"
      className={[
        "z-20 rounded-2xl bg-felt-900/95 shadow-xl ring-1 ring-amber-300/40 backdrop-blur",
        compact ? "p-2" : "sticky bottom-2 p-3",
      ].join(" ")}
    >
      {/* The whole width, and allowed to wrap rather than truncate: it needs
          273px, which every phone in portrait has to itself and none of them had
          to share (#350). A narrower one takes two lines; nothing is cut. */}
      {compact ? null : (
        <p className="text-xs text-white/50">
          Take your time — look at the next players' cards.
        </p>
      )}
      <div className={["grid grid-cols-4", compact ? "gap-1.5" : "mt-2 gap-2"].join(" ")}>
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
