import type { ReactNode } from "react";

import { DEFAULT_HOUSE_RULES, type HouseRules } from "@goleta/engine";

import { HintsQuestion } from "../components/Help.tsx";
import { Button, Panel } from "../components/ui.tsx";
import { useIsShort } from "../lib/viewport.ts";

/** Headlines carry the game on their own — read as a list they are the whole
 * thing in six lines. The sentence under each is for the second read, or when
 * somebody at the table asks (#195).
 *
 * `when` is what a table has to be playing for the line to be drawn. Absent
 * means always. */
const RULES: {
  key: string;
  headline: ReactNode;
  /** A function where the table can change what the rule *is* — the variation
   * belongs in the line it changes rather than as a line of exceptions (#221).
   * A `ReactNode` is never callable, so the union needs no discriminator. */
  detail: ReactNode | ((rules: HouseRules) => ReactNode);
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
    // The reversal is the whole game, so the clause carrying it is the one with
    // the emphasis on it (#305). "Match the card showing by rank or suit" read
    // as an instruction to go looking for a match, which is the opposite of what
    // a player wants and is the mistake the Sunny Rule feeds on.
    detail: (
      <>
        If you have a card that matches the center card (by suit or by rank), you have no
        choice — you <em>have to</em> play it.
      </>
    ),
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
    //
    // The hint is set apart because it is the one sentence on this screen that
    // says how to play *well* rather than what is legal, and it should not be
    // read as part of the rule it hangs off (#305).
    //
    // **It is the one line a house rule rewrites** (#221). Under the Power of
    // Eights the standard sentence is not merely incomplete, it is false: you do
    // not choose the suit, the seat after you does. A player briefed only by this
    // screen played an 8, waited for the picker, and watched it open on somebody
    // else's phone with nothing anywhere saying why.
    //
    // **The hint has to turn over with it**, which is the part that is easy to
    // miss. *Look at your neighbours' hands first* is advice about a choice you
    // are no longer making, so left standing it would be the same failure one
    // sentence later. What replaces it is `docs/RULES.md` § The Power of Eights,
    // which is emphatic that this hands the next player something good: they
    // "will name something they can't follow and draw off the back of it".
    //
    // Dealer's Choice is deliberately **not** in here. It only does anything when
    // the opening card happens to be an 8, and briefing every new player on that
    // in advance costs more attention than the case is worth; `docs/RULES.md`
    // stays canonical and answers it at the table.
    detail: (rules) =>
      rules.eights === "nextPlayerNames" ? (
        <>
          An 8 plays on anything, but the <em>next</em> player chooses the suit — and then
          has to follow it. <em>(Hint: they'll name a suit they can't play, so they get to draw.)</em>
        </>
      ) : (
        <>
          An 8 plays on anything, and after playing one, you get to choose the suit.{" "}
          <em>(Hint: Look at your neighbors' hands first!)</em>
        </>
      ),
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
 * **The panel scrolls inside itself**, with the last decision under it — this is
 * opened mid-hand from a sideways phone now (#195).
 *
 * **On a short screen the question is the end of the scroll rather than a pinned
 * footer** (#305). Pinned costs about 160px — a heading, a 44px switch, its
 * blurb and the button — and a landscape phone gives the whole panel
 * `100dvh - 2.5rem`, so what was left for the rules themselves was under 200px:
 * two collapsed headlines and the top of a third. #187 pinned it so that the
 * last decision before the first hand could never be below the fold, which holds
 * wherever there is a fold to be below; here the pin was burying the thing it
 * was protecting. The button stays pinned either way — it is the way out, and it
 * costs one row.
 */
export function Rules({
  onDone,
  ctaLabel = "Continue",
  hints,
  onChooseHints,
  houseRules = DEFAULT_HOUSE_RULES,
}: {
  onDone: () => void;
  /** **Continue in both states** (#305). It said *Play* over a running game,
   * which is the one place it is not a play button: this screen is opened
   * mid-hand from the header now, and what is under it is a turn that is already
   * somebody's. */
  ctaLabel?: string;
  /** Whether the table is marking up your playable cards right now. */
  hints: boolean;
  onChooseHints: (wanted: boolean) => void;
  /** What this table is playing, so the screen does not describe a rule nobody
   * here can use. Defaults to the game as written. */
  houseRules?: HouseRules;
}) {
  const rules = RULES.filter((rule) => !rule.when || rule.when(houseRules));
  // Height, not orientation: it is the room under the list that runs out. See
  // `useIsShort`.
  const short = useIsShort();
  const hintsQuestion = <HintsQuestion on={hints} onChange={onChooseHints} />;

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
              <Rule
                headline={rule.headline}
                detail={
                  typeof rule.detail === "function" ? rule.detail(houseRules) : rule.detail
                }
              />
            </li>
          ))}
        </ol>

        {short ? (
          <div className="mt-4 border-t border-white/10 pb-5 pt-4">{hintsQuestion}</div>
        ) : null}
      </div>

      {/* The last decision before the first hand, so it is never below the fold
          on a screen that has one — with the way out under it rather than
          instead of it. It used to replace the continue button, which made it
          read as a fork (#187). On a short screen it has moved up into the
          scroll above and only the button is left here (#305). */}
      <div className="shrink-0 border-t border-white/10 pt-4">
        {short ? null : hintsQuestion}
        <Button variant="primary" full className={short ? "" : "mt-4"} onClick={onDone}>
          {ctaLabel}
        </Button>
      </div>
    </Panel>
  );
}
