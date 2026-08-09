import { Button, Panel } from "../components/ui.tsx";

/**
 * What a new player is told on their way in.
 *
 * The Sunny Rule gets an allusion and nothing more: reaching when you had a
 * play is a thing you can be caught doing. Not its name, not the window, not
 * naming the card, not the penalty. It is live from the first game, but you
 * meet it by having it called on you — and `SunnyExplainer` teaches it at that
 * moment, when it will actually stick. The hint is only there so the sun is not
 * the first you have heard of the idea.
 *
 * First time through, this is also where you say whether you want the training
 * wheels for that game. Asking is the point: being given help you didn't ask
 * for is how a game teaches you it thinks you need it.
 */
export function Rules({
  onDone,
  ctaLabel = "Got it",
  onChooseHints,
}: {
  onDone: () => void;
  ctaLabel?: string;
  /** Present only on the way in. Absent when the rules are simply reopened. */
  onChooseHints?: (wanted: boolean) => void;
}) {
  return (
    <Panel className="max-w-lg">
      <h2 className="text-xl font-semibold text-white">How goleta works</h2>
      <p className="mt-1 text-sm text-white/60">It's Crazy Eights, backwards.</p>

      <ol className="mt-5 space-y-4 text-sm leading-relaxed text-white/80">
        <li>
          <strong className="text-white">
            You want to <em>keep</em> your cards.
          </strong>{" "}
          Run out and you're out of the game. The last player still holding cards wins.
        </li>
        <li>
          <strong className="text-white">
            Every hand is <em>face up</em>.
          </strong>{" "}
          Nobody's cards are a secret, all game. Whether someone had a play they skipped is there
          to be seen — spotting it is on you.
        </li>
        <li>
          <strong className="text-white">
            If you <em>can</em> play, you <em>must</em>.
          </strong>{" "}
          Match the card showing by rank or suit, and you have no choice — you play it. A hand full
          of playable cards is a hand that's draining away.
        </li>
        <li>
          <strong className="text-white">
            Being <em>stuck</em> is good.
          </strong>{" "}
          With nothing playable you draw a card, which is exactly what you want. Still stuck? Draw
          again, up to three.
        </li>
        <li>
          <strong className="text-white">
            Eights are <em>wild</em>.
          </strong>{" "}
          An 8 plays on anything, so holding one means you can never draw, and drawing one ends
          your turn on the spot. Naming the next suit is what you get back.
        </li>
      </ol>

      <p className="mt-5 rounded-xl bg-white/5 p-3 text-sm text-white/70">
        The one thing you're not allowed to do is draw when you had a play. If someone gets shady
        about it, you can call them out — shine a little sunlight on the situation. You'll find out
        how when it happens.
      </p>

      {onChooseHints ? (
        <div className="mt-5 border-t border-white/10 pt-4">
          <p className="text-sm text-white/70">
            For your first game the table can dim the cards you can't play, so your move is
            always the obvious one. After that it stops either way.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button variant="primary" className="flex-1" onClick={() => onChooseHints(true)}>
              Dim them for me
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => onChooseHints(false)}>
              I'll spot them myself
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="primary" full className="mt-5" onClick={onDone}>
          {ctaLabel}
        </Button>
      )}
    </Panel>
  );
}
