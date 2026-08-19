import type { ReactNode } from "react";

import { Button, Panel } from "../components/ui.tsx";

/**
 * The five rules, as the headline everybody reads and the sentence some people
 * want.
 *
 * The headlines were already written to carry the game on their own, which is
 * what made the collapse possible: read as a list they are the whole game in
 * five lines and about eight seconds. The sentence under each is what you want
 * on the second read, or when somebody at the table asks — and since #195 that
 * second read happens mid-hand, from a phone held sideways.
 */
const RULES: { key: string; headline: ReactNode; detail: ReactNode }[] = [
  {
    key: "keep",
    headline: (
      <>
        You want to <em>keep</em> your cards.
      </>
    ),
    detail: "Run out and you're out of the game. The last player still holding cards wins.",
  },
  {
    key: "faceUp",
    headline: (
      <>
        Everyone's cards are <em>face up</em>.
      </>
    ),
    detail: "Everyone can see everyone else's cards, all game.",
  },
  {
    key: "must",
    headline: (
      <>
        If you <em>can</em> play, you <em>must</em>.
      </>
    ),
    detail:
      "Match the card showing by rank or suit, and you have no choice — you play it.",
  },
  {
    key: "stuck",
    headline: (
      <>
        Being stuck is <em>good</em>.
      </>
    ),
    detail:
      "With nothing playable, you draw a card (which is exactly what you want). Still stuck? Draw again, up to three.",
  },
  {
    key: "eights",
    headline: (
      <>
        Eights are <em>wild</em>.
      </>
    ),
    // The one item here that was actively wrong by omission, so its second
    // sentence is reachable rather than cut. *An 8 plays on anything and you
    // name the suit* is true of an 8 played from a hand and of nothing else,
    // and a table meets the exception in its first minute: roughly one game in
    // thirteen opens on an 8 nobody names a suit for, and a bot sheds an 8 at
    // the first opportunity, so a second one lands on it and is named for. A
    // player briefed only by this screen has been given no way to tell those
    // apart, and what it looks like is the app breaking its own rule (#151).
    detail:
      "An 8 plays on anything, and after playing one, you get to name the suit. An 8 turned up off the deck was played by nobody, so nobody names anything — it's just an 8 of the suit printed on it.",
  },
];

/**
 * One rule, closed.
 *
 * Native `<details>`/`<summary>`, which is keyboard reachable and announced as
 * a disclosure for nothing — a pair of divs and a `useState` would be the same
 * picture with all of that to rebuild by hand.
 *
 * The default marker is hidden on both engines it has one on, and replaced with
 * a chevron that turns: the browser's triangle sits before the text and pushes
 * the headline off the margin the rest of the screen keeps.
 */
function Rule({ headline, detail }: { headline: ReactNode; detail: ReactNode }) {
  return (
    <details className="group border-b border-white/10 last:border-b-0">
      <summary
        className={[
          "flex cursor-pointer list-none items-center gap-3 py-2.5 text-sm font-semibold",
          "text-white [&::-webkit-details-marker]:hidden",
          "transition-colors hover:text-amber-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
        ].join(" ")}
      >
        <span className="min-w-0 flex-1">{headline}</span>
        <span
          aria-hidden
          className="shrink-0 text-white/30 transition-transform group-open:rotate-90"
        >
          ›
        </span>
      </summary>
      <p className="pb-3 pr-6 text-sm leading-relaxed text-white/70">{detail}</p>
    </details>
  );
}

/**
 * What a new player is told on their way in.
 *
 * **Five headlines, collapsed** (#196). It used to be five bold lines each
 * followed by a sentence or two, and then a paragraph about the Sunny Rule —
 * a wall of text on the first screen anybody sees, at the moment they want to
 * start playing. All-collapsed is the right default: a screen that opened with
 * one rule expanded would be telling you which one matters most, and they do
 * not rank.
 *
 * The Sunny Rule gets an allusion and nothing more: reaching when you had a
 * play is a thing you can be caught doing. Not its name, not the window, not
 * naming the card, not the penalty. It is live from the first game, but you
 * meet it by having it called on you — and `SunnyExplainer` teaches it at that
 * moment, when it will actually stick. The hint is only there so the sun is not
 * the first you have heard of the idea. It stays unexpanded and unnamed for the
 * same reason: there is nothing under it to open.
 *
 * First time through, this is also where you say whether you want the training
 * wheels for that game. Asking is the point: being given help you didn't ask
 * for is how a game teaches you it thinks you need it.
 *
 * That offer is a question and two named answers, and says nothing about the
 * mechanism. What the help does, how long it lasts and what happens after are
 * three things you learn by playing one game with it — and a paragraph
 * explaining all three is a paragraph read by somebody who hasn't seen a card
 * yet.
 *
 * **The panel scrolls inside itself rather than scrolling the page**, with the
 * last decision pinned under it. This screen is opened mid-hand from a phone
 * held sideways now (#195), where the whole viewport is about 320 pixels tall,
 * and a footer that scrolled away would put the way out of the rules below the
 * fold on the one device that reached them in a hurry. It is the shape
 * `Graduation` and `SunnyExplainer` already use.
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
    <Panel
      // Definite rather than `max-h-full`: this panel's parent is sized by
      // `flex-1` off a `min-height` column, and a percentage maximum against an
      // indefinite height resolves to no maximum at all. `2.5rem` is the wrapper
      // padding that surrounds it. `dvh` is what takes the browser's own chrome
      // off, which on a landscape phone is most of the argument.
      className="flex max-h-[calc(100dvh-2.5rem)] w-full max-w-lg flex-col overflow-hidden"
    >
      {/* Bleeds to the panel's edges and puts the padding back on itself, so
          the scrollbar runs down the panel rather than down an inset column. */}
      <div className="-mx-5 -mt-5 min-h-0 flex-1 overflow-y-auto px-5 pt-5">
        <h2 className="text-xl font-semibold text-white">How goleta works</h2>
        <p className="mt-1 text-sm text-white/60">It's Crazy Eights, backwards.</p>

        <ol className="mt-4">
          {RULES.map((rule) => (
            <li key={rule.key}>
              <Rule headline={rule.headline} detail={rule.detail} />
            </li>
          ))}
        </ol>

        <p className="mt-4 rounded-xl bg-white/5 p-3 text-sm text-white/70">
          Don't draw cards unless you're forced to. If someone's acting shady, you can call them out
          — shine some sunlight on the situation. ☀️
        </p>
      </div>

      {/* The last thing on the screen and the last decision before the first
          hand, so it is the thing that must never be below the fold. */}
      <div className="shrink-0 pt-4">
        {onChooseHints ? (
          <div className="border-t border-white/10 pt-4">
            <p className="text-sm text-white/70">Want some help your first game?</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Button variant="primary" className="flex-1" onClick={() => onChooseHints(true)}>
                Yes, guide me
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => onChooseHints(false)}>
                No, I've got it
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="primary" full onClick={onDone}>
            {ctaLabel}
          </Button>
        )}
      </div>
    </Panel>
  );
}
