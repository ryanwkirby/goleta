import type { ReactNode } from "react";

import { DEFAULT_HOUSE_RULES, type HouseRules } from "@goleta/engine";

import { HintsToggle } from "../components/Help.tsx";
import { Button, Panel } from "../components/ui.tsx";

/** Headlines carry the game on their own — read as a list they are the whole
 * thing in six lines. The sentence under each is for the second read, or when
 * somebody at the table asks (#195).
 *
 * `when` is what a table has to be playing for the line to be drawn. Absent
 * means always. */
const RULES: {
  key: string;
  headline: ReactNode;
  detail: ReactNode;
  when?: (rules: HouseRules) => boolean;
}[] = [
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
      "Can't play any cards? Great! You get to draw. Still stuck? Draw again, up to three times.",
  },
  {
    key: "eights",
    headline: (
      <>
        Eights are <em>wild</em>.
      </>
    ),
    // The natural-8 exception used to be spelled out here (#151) and the trade
    // was taken the other way in #250: it is a fringe case that costs a player
    // nothing when it happens, and it was buying that with the only sentence on
    // this screen that could tell somebody how to play *well*. `docs/RULES.md`
    // § Natural eights stays canonical and answers it at the table. If it
    // confuses people again the answer is a line at the pile, where the
    // confusion happens — `lib/pile.ts` already tells *named* from *owed* — not
    // this sentence coming back.
    detail:
      "An 8 plays on anything, and after playing one, you get to name the suit. Hint: Look at the cards of the players next to you before choosing.",
  },
  {
    key: "sunny",
    headline: (
      <>
        People might try to <em>cheat</em>.
      </>
    ),
    // It was a tinted paragraph hanging off the bottom of the list until #249 —
    // the only thing on the screen you could not open, so it read as a footnote
    // about the rule this whole game is built around, and it was shown to tables
    // that had switched it off.
    //
    // It stays an allusion. **You meet the Sunny Rule by having it called on
    // you**, and `SunnyExplainer` teaches the whole mechanic at that moment,
    // when it sticks — so this names no window, no naming of a card, no
    // punishment card and no lockout. Nothing here may make that redundant.
    detail:
      "Don't draw cards unless you're forced to. If someone's cheating, you can shine sunlight ☀️ on them to call them out.",
    when: (rules) => rules.sunny,
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
 * What a new player is told on their way in. **Headlines, collapsed** (#196) —
 * it used to be a wall of text on the first screen anybody sees, and a screen
 * that opened with one rule expanded would say which one matters most.
 *
 * **Six of them when the table plays the Sunny Rule, five when it doesn't**
 * (#249). Absent is the plainest way to say a table isn't playing something —
 * a line saying so would describe a lesser game. The Sunny line is still an
 * allusion and nothing more: you meet that rule by having it called on you, and
 * `SunnyExplainer` teaches it when it will stick.
 *
 * Where there is no table to ask — the screen is reachable before one exists —
 * it describes the game as written, which includes the Sunny Rule.
 *
 * **The hints offer is a toggle, and it is here every time** (#187). It says
 * nothing about the mechanism and says the one thing that matters: switching it
 * on is something the table can see.
 *
 * **The panel scrolls inside itself**, with the last decision pinned under it —
 * this is opened mid-hand from a sideways phone now (#195).
 */
export function Rules({
  onDone,
  ctaLabel = "Got it",
  hints,
  onChooseHints,
  houseRules = DEFAULT_HOUSE_RULES,
}: {
  onDone: () => void;
  ctaLabel?: string;
  /** Whether the table is marking up your playable cards right now. */
  hints: boolean;
  onChooseHints: (wanted: boolean) => void;
  /** What this table is playing, so the screen does not describe a rule nobody
   * here can use. Defaults to the game as written. */
  houseRules?: HouseRules;
}) {
  const rules = RULES.filter((rule) => !rule.when || rule.when(houseRules));

  return (
    <Panel
      // Definite rather than `max-h-full`: this panel's parent is sized by `flex-1`
      // off a `min-height` column, and a percentage maximum against an indefinite
      // height resolves to no maximum at all. `dvh` takes the browser's own
      // chrome off, which on a landscape phone is most of the argument.
      className="flex max-h-[calc(100dvh-2.5rem)] w-full max-w-lg flex-col overflow-hidden"
    >
      {/* Bleeds to the panel's edges and puts the padding back on itself, so the
          scrollbar runs down the panel rather than an inset column. */}
      <div className="-mx-5 -mt-5 min-h-0 flex-1 overflow-y-auto px-5 pt-5">
        <h2 className="text-xl font-semibold text-white">How goleta works</h2>
        <p className="mt-1 text-sm text-white/60">It's Crazy Eights, backwards.</p>

        <ol className="mt-4">
          {rules.map((rule) => (
            <li key={rule.key}>
              <Rule headline={rule.headline} detail={rule.detail} />
            </li>
          ))}
        </ol>

      </div>

      {/* The last decision before the first hand, so it must never be below the
          fold — with the way out under it rather than instead of it. It used to
          replace the continue button, which made it read as a fork (#187). */}
      <div className="shrink-0 border-t border-white/10 pt-4">
        <HintsToggle on={hints} onChange={onChooseHints} />
        <Button variant="primary" full className="mt-4" onClick={onDone}>
          {ctaLabel}
        </Button>
      </div>
    </Panel>
  );
}
