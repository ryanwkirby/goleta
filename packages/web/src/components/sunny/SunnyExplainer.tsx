
import { Button } from "../ui.tsx";

/** Shown the first time the rule touches you, which is how you are meant to
 * learn it. It waits behind the announcement so you know what you are being
 * taught about. */
export function SunnyExplainer({ onDone }: { onDone: () => void }) {
  return (
    <div
      className={[
        "fixed inset-0 z-30 flex items-end justify-center bg-black/60 sm:items-center",
        "pt-[max(1rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))]",
        "pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))]",
      ].join(" ")}
    >
      <div className="flex w-full max-h-full max-w-md flex-col overflow-hidden rounded-2xl bg-felt-900 ring-1 ring-amber-300/30">
        <div className="overflow-y-auto p-5 pb-4">
          <h2 className="text-xl font-semibold text-amber-300">☀️ The Sunny Rule</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/80">
            Drawing a card when you had one you could have played is against the rules — and anyone can call you on it.
          </p>
          <ul className="ml-1.5 mt-3 list-inside list-disc space-y-1.5 text-sm leading-relaxed text-white/80 marker:text-white/40">
            <li>
              <strong className="text-white">To call it:</strong> tap the sun, then tap the card you say they should have played.
            </li>
            <li>
              <strong className="text-white">Right:</strong> they play that card, plus a second card as a punishment.
            </li>
            <li>
              <strong className="text-white">Wrong:</strong> nobody loses a card, but you can't call again for three draws.
            </li>
          </ul>
          <p className="mt-3 text-sm leading-relaxed text-white/80">
            Nothing here will tell you whether you're right. That's what the face-up hands are for.
          </p>
        </div>
        <div className="shrink-0 p-5 pt-0">
          <Button variant="primary" full onClick={onDone}>
            Understood
          </Button>
        </div>
      </div>
    </div>
  );
}
