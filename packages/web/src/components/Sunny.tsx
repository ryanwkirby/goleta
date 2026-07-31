import type { GameView, RoomView } from "@goleta/engine";

import { Button } from "./ui.tsx";

/**
 * The call button.
 *
 * It appears after *any* draw by someone else — not only when a call would
 * land. Showing it selectively would tell you the answer, which is the one
 * thing the server refuses to do.
 */
export function SunnyCall({
  game,
  room,
  onCall,
}: {
  game: GameView;
  room: RoomView;
  onCall: () => void;
}) {
  if (!game.sunnyCallable || !game.sunnyTargetId) return null;
  const target = room.seats.find((seat) => seat.id === game.sunnyTargetId)?.name ?? "them";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <Button
        variant="sunny"
        onClick={onCall}
        className="pointer-events-auto animate-pulse px-6 py-3 text-base"
      >
        <span aria-hidden>☀️</span> Sunny Rule on {target}!
      </Button>
    </div>
  );
}

/**
 * Shown the first time the rule touches you — which is how you're meant to
 * learn it. It is deliberately left out of the joining explainer.
 */
export function SunnyExplainer({ onDone }: { onDone: () => void }) {
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-2xl bg-felt-900 p-5 ring-1 ring-amber-300/30">
        <h2 className="text-xl font-semibold text-amber-300">☀️ The Sunny Rule</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/80">
          Nobody told you about this one on the way in. Here it is.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-white/80">
          If you take a card from the deck when you had a card you could have played, anyone else
          can call <strong className="text-white">Sunny Rule</strong> on you. Get caught and you
          lose the card you drew, give up another card of your choosing, and{" "}
          <em>still</em> have to make the play you were dodging.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-white/80">
          Calling it when they were innocent costs you a card instead. Accusations aren't free.
        </p>
        <Button variant="primary" full className="mt-5" onClick={onDone}>
          Understood
        </Button>
      </div>
    </div>
  );
}

export function SuitPicker({ onPick }: { onPick: (suit: "C" | "D" | "H" | "S") => void }) {
  const suits = [
    { key: "H", glyph: "♥", label: "Hearts", red: true },
    { key: "D", glyph: "♦", label: "Diamonds", red: true },
    { key: "S", glyph: "♠", label: "Spades", red: false },
    { key: "C", glyph: "♣", label: "Clubs", red: false },
  ] as const;

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl bg-felt-900 p-5 ring-1 ring-white/15">
        <h2 className="text-center text-lg font-semibold text-white">Name a suit</h2>
        <p className="mt-1 text-center text-sm text-white/60">
          The next player has to match it. Pick one you don't hold.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {suits.map((suit) => (
            <button
              key={suit.key}
              type="button"
              onClick={() => onPick(suit.key)}
              className={[
                "flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl bg-white",
                "text-3xl font-semibold shadow-lg transition-transform hover:-translate-y-0.5",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
                suit.red ? "text-rose-600" : "text-slate-900",
              ].join(" ")}
            >
              <span aria-hidden>{suit.glyph}</span>
              <span className="text-xs font-medium text-slate-500">{suit.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
