
import { Button } from "../ui.tsx";
import { LAYER } from "../../lib/layers.ts";

/** Shown the first time the rule touches you, which is how you are meant to
 * learn it. It waits behind the announcement so you know what you are being
 * taught about.
 *
 * **It opens on the rule, not on the offence** (#293). The emphasis is on
 * *have*, because that word is the whole rule: drawing is the reward, and you
 * only get it when you are stuck. "Anyone can call you on it" is not lost — the
 * first bullet under it is **To call it**, and the two below that are what
 * happens either way.
 *
 * It used to close on "Nothing here will tell you whether you're right." The
 * property is not going anywhere: nothing on any client knows whether a call
 * would land, and nothing ever will (#50). What went is the app pointing at its
 * own absence, on the one panel somebody reads while they are already confused
 * about what just happened to them. */
export function SunnyExplainer({ onDone }: { onDone: () => void }) {
  return (
    <div
      className={[
        `fixed inset-0 ${LAYER.overlay} flex items-end justify-center bg-black/60 sm:items-center`,
        "pt-[max(1rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))]",
        "pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))]",
      ].join(" ")}
    >
      <div className="flex w-full max-h-full max-w-md flex-col overflow-hidden rounded-2xl bg-felt-900 ring-1 ring-amber-300/30">
        <div className="overflow-y-auto p-5 pb-4">
          <h2 className="text-xl font-semibold text-amber-300">☀️ The Sunny Rule</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/80">
            It's against the rules to draw a card when you don't <em>have</em> to.
          </p>
          <ul className="ml-1.5 mt-3 list-inside list-disc space-y-1.5 text-sm leading-relaxed text-white/80 marker:text-white/40">
            <li>
              <strong className="text-white">To call it:</strong> tap the sun, then tap the card you say they should have played.
            </li>
            <li>
              <strong className="text-white">Right:</strong> they play that card, then sacrifice a second one as punishment.
            </li>
            <li>
              <strong className="text-white">Wrong:</strong> nobody loses a card, but you can't call again until the table has reached for the deck three more times.
            </li>
          </ul>
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
