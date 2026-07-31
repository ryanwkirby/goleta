import { Button, Panel } from "../components/ui.tsx";

/**
 * What a new player is told on their way in.
 *
 * The Sunny Rule is deliberately absent. It is live from the first game, but
 * you meet it by having it called on you — and the app explains it at that
 * moment, when it will actually stick.
 */
export function Rules({ onDone, ctaLabel = "Got it" }: { onDone: () => void; ctaLabel?: string }) {
  return (
    <Panel className="max-w-lg">
      <h2 className="text-xl font-semibold text-white">How goleta works</h2>
      <p className="mt-1 text-sm text-white/60">
        It's Crazy Eights, backwards. Read this bit — the backwards part matters.
      </p>

      <ol className="mt-5 space-y-4 text-sm leading-relaxed text-white/80">
        <li>
          <strong className="text-white">You want to keep your cards.</strong> Run out and you're
          out of the game. The last player still holding cards wins.
        </li>
        <li>
          <strong className="text-white">If you can play, you must.</strong> Match the card showing
          by rank or suit, and you have no choice — you play it. A hand full of playable cards is a
          hand that's draining away.
        </li>
        <li>
          <strong className="text-white">Being stuck is good.</strong> With nothing playable you
          draw a card, which is exactly what you want. Still stuck? Draw again, up to three.
        </li>
        <li>
          <strong className="text-white">Eights in your hand are wild</strong> and let you name the
          next suit. They're also a liability: an 8 plays on anything, so while you hold one you can
          always play, which means you can never draw. An 8 turned up off the deck is just an
          ordinary 8 — its own suit, nobody names anything.
        </li>
        <li>
          <strong className="text-white">When the deck runs out</strong> the whole played pile gets
          shuffled back into it, and a fresh card is turned up. The card everyone was matching
          changes — that's normal, not a glitch.
        </li>
      </ol>

      <p className="mt-5 rounded-xl bg-white/5 p-3 text-sm text-white/70">
        Everyone's cards are face up to begin with, so you can see how the game moves. The host
        turns them face down when the table is ready.
      </p>

      <Button variant="primary" full className="mt-5" onClick={onDone}>
        {ctaLabel}
      </Button>
    </Panel>
  );
}
