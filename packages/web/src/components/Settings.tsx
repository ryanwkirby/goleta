/**
 * The table's settings, in one place so the lobby and the table show the same
 * switches rather than two drifting copies. **Where everybody is** takes effect
 * on the tap; **the house rules** take effect at the next deal, because the game
 * keeps its own copy from the moment it is dealt (#134).
 *
 * It also holds the cog behind the table, which since #253 is **one door with
 * two rooms** rather than two doors an inch apart — so the file is not the
 * host's alone any more, which is why it is no longer called `HostSettings`.
 */

import { useState } from "react";

import type { AutopilotMode, DealerMode, HouseRules } from "@goleta/engine";

import { AutopilotPicker } from "./Autopilot.tsx";
import { HintsRow } from "./Help.tsx";
import { SettingSwitch } from "./SettingSwitch.tsx";
import { TwoWay } from "./TwoWay.tsx";
import { Button, headerItem, Panel } from "./ui.tsx";
import { LAYER } from "../lib/layers.ts";

/**
 * Both halves are headed, and the heading is what makes a host able to see at a
 * glance which of them changes the game for everybody.
 *
 * **It has to look like the level above the rows** (#289). It used to draw the
 * five classes `DealerPicker`, `HouseRulesPicker`, `IrlToggle` and
 * `AutopilotPicker` each draw their own heading with — so the division #253
 * built came out as a flat list of six identical headings, and the one thing the
 * panel most needs to say was said in the same voice as the things it governs.
 * Bigger, brighter and not uppercase; the sub-headings are untouched.
 *
 * `text-base` rather than the `text-sm` one step up from them, because the
 * sub-headings are not the only thing it has to sit above: every row *label* in
 * here — **Musical chairs**, **The Sunny Rule** — is `text-sm font-semibold
 * text-white` already, and a parent that matches its own grandchildren is the
 * same failure one rung along.
 */
function SectionHeading({ children }: { children: string }) {
  return <p className="text-base font-semibold text-white">{children}</p>;
}

/**
 * Which of the panel's two pages is showing (#313).
 *
 * #253 put both settings rooms under one cog and #289 gave each a heading big
 * enough to see the division at a glance. Both were right and neither solved
 * what a host actually meets opening it mid-game: one column holding two
 * unrelated jobs, taller than the screen it is drawn on. For a host that came to
 * roughly 600px of content in a 640px box — it scrolls on a short portrait phone
 * and is nowhere near fitting a landscape one — and a non-host with the autopilot
 * on could still be asked to scroll to reach the second of their two controls.
 *
 * Scrolling is the wrong shape for this panel twice over. The room half is where
 * a host goes to change one thing and get back to a hand that is still running,
 * and the personal half's whole reason for existing is *I am stepping away*,
 * pressed by somebody who has already stopped looking at the screen.
 *
 * **Landscape may still scroll the room page and that is accepted.** Five groups
 * and a note do not fit in 300px however they are arranged, and the answer is the
 * `overflow-y-auto` that is already there — not a third page and not a
 * short-screen variant. Two navigation models for one panel is worse than a
 * scroll that engages on one device.
 */
type SettingsPage = "yours" | "room";

/**
 * The way between the two pages: a label and a chevron, the shape `Rule` in
 * `screens/Rules.tsx` already uses for a drill.
 *
 * **Deliberately not `TwoWay`**, which is the obvious wrong turn. A tab pair on
 * that track would put the panel's single loudest amber control on the one thing
 * in here that changes nothing, and `TwoWay` says in its own header what it is
 * for: two answers a person would *say*, to a question. *Which page am I looking
 * at* is not a setting and must not be drawn as one — and a tab bar would be a
 * third shape in a file that already has exactly two and says not to add one.
 */
function PageLink({
  label,
  back = false,
  onGo,
}: {
  label: string;
  /** The chevron points the way you are going. */
  back?: boolean;
  onGo: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onGo}
      className={[
        "flex min-h-11 w-full items-center gap-3 border-t border-white/10 pt-4 text-sm font-semibold",
        "text-white transition-colors hover:text-amber-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
      ].join(" ")}
    >
      {back ? (
        <span aria-hidden className="shrink-0 text-white/30">
          ‹
        </span>
      ) : null}
      <span className="min-w-0 flex-1 text-left">{label}</span>
      {back ? null : (
        <span aria-hidden className="shrink-0 text-white/30">
          ›
        </span>
      )}
    </button>
  );
}

/**
 * Drawn rather than typed (#296). `⚙` is a character, so what it looked like was
 * whatever the platform's font decided — on most of them a shaded, bevelled,
 * faintly three-dimensional gear that belonged next to nothing else in the app.
 * This is `DoorGlyph`'s terms exactly: 24-unit box, `1.8` stroke in
 * `currentColor`, round caps and joins, `h-5 w-5`, so the two marks in that row
 * of small print are drawn by the same hand.
 *
 * Six teeth with generous gaps rather than the eight a gear usually gets: at
 * 20px the gaps are what the eye reads, and a tighter tooth count closes them to
 * less than the stroke is wide and the whole thing blobs into a disc. The teeth
 * are trapezoids rather than radial ticks on a ring, which would have drawn a
 * sun — and the sun means the Sunny Rule on every surface in this app.
 */
function CogGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      <path d="M10.15 6.29L10.4 2.94A9.2 9.2 0 0 1 13.6 2.94L13.85 6.29A6 6 0 0 1 16.01 7.54L19.05 6.09A9.2 9.2 0 0 1 20.65 8.85L17.87 10.75A6 6 0 0 1 17.87 13.25L20.65 15.15A9.2 9.2 0 0 1 19.05 17.91L16.01 16.46A6 6 0 0 1 13.85 17.71L13.6 21.06A9.2 9.2 0 0 1 10.4 21.06L10.15 17.71A6 6 0 0 1 7.99 16.46L4.95 17.91A9.2 9.2 0 0 1 3.35 15.15L6.13 13.25A6 6 0 0 1 6.13 10.75L3.35 8.85A9.2 9.2 0 0 1 4.95 6.09L7.99 7.54A6 6 0 0 1 10.15 6.29Z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  );
}

/** Silent when the table plays the game as written. */
export const describeRules = (rules: HouseRules): string => {
  const on: string[] = [];
  if (!rules.sunny) on.push("no Sunny Rule");
  if (rules.eights === "nextPlayerNames") on.push("the Power of 8s");
  if (rules.seedEight === "dealerNames") on.push("Dealer's Choice on 8");
  if (on.length === 0) return "Playing the standard rules.";
  return `House rules: ${on.join(", ")}.`;
};

/** Silent when the deal rotates, which is the default: a table that has not
 * chosen anything is not being told about a choice (#198). */
export const describeDealing = (mode: DealerMode): string =>
  mode === "random" ? "The starting player is randomized each game." : "";

/** Silent when they don't (#199). Worth saying when they do, because seat order
 * is turn order and it decides who you are handing to. */
export const describeSeating = (shuffled: boolean): string =>
  shuffled ? "Musical chairs: everyone moves seats each game." : "";

/** Two named answers rather than a switch, for `IrlToggle`'s reason. What the
 * dealer decides is who opens, and the seeded 8 under Dealer's Choice. A random
 * dealer may land on the same seat twice; a table that objects wants rotation. */
const DEALERS: { value: DealerMode; label: string; blurb: string }[] = [
  // *Rotate left* names the movement rather than a destination (#289). "To the
  // left" was the rotation from the table's point of view — the deal moves one
  // seat and the player to the dealer's left opens, so who *starts* moves left —
  // and read as a place the deal was going rather than as the other half of a
  // pair with *Randomize*. `docs/RULES.md` still calls dealing dealing: this is
  // the lobby's vocabulary, not the game's (#245).
  { value: "rotate", label: "Rotate left", blurb: "The starting player moves one seat each game." },
  { value: "random", label: "Randomize", blurb: "The starting player is randomized each game." },
];

/**
 * A switch rather than two named answers, unlike the dealer beside it: this is a
 * thing a table either does or does not do.
 *
 * **One sentence in every room** (#289). It used to branch on `irl` and promise
 * an IRL table that "everyone is shown where to sit" — which is true, the
 * take-your-seat screen still appears (#199), but it is not what a row this
 * narrow should be spending its width on. What both rooms need to know is that
 * this moves *everybody*, because turn order is where you are sitting and at a
 * real table that means getting up. So the prop is gone with the branch.
 */
export function ShuffleSeatsToggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <SettingSwitch
      label="Musical chairs"
      blurb={
        <>
          <em>Everyone</em> shuffles seats each game, to shake things up.
        </>
      }
      on={on}
      onChange={onChange}
    />
  );
}

export function DealerPicker({
  mode,
  onChange,
}: {
  mode: DealerMode;
  onChange: (mode: DealerMode) => void;
}) {
  const chosen = DEALERS.find((option) => option.value === mode);

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-white/50">
        Who starts each game?
      </p>
      <TwoWay
        label="Who starts each game?"
        options={[DEALERS[0]!, DEALERS[1]!]}
        value={mode}
        onChange={onChange}
        className="mt-2"
      />
      <p className="mt-2 text-xs text-white/40">{chosen?.blurb}</p>
    </div>
  );
}

/**
 * Every one of these is a rule the game already had written down, and the
 * defaults are the game as written. **A row's description doesn't change when the
 * row is switched**, or the sentence a host is reading moves as they decide.
 * **The Sunny line offers the draw before it names the cost**, because stating
 * the violation as a condition reads as though the app will stop you.
 */
export function HouseRulesPicker({
  rules,
  onChange,
}: {
  rules: HouseRules;
  onChange: (rules: HouseRules) => void;
}) {
  const rows: { key: string; label: string; blurb: string; on: boolean; toggle: HouseRules }[] = [
    {
      key: "sunny",
      label: "The Sunny Rule",
      blurb: "You can draw any time, but others can call you out.",
      on: rules.sunny,
      toggle: { ...rules, sunny: !rules.sunny },
    },
    {
      key: "eights",
      label: "The Power of 8s",
      blurb: "The next player names the suit, not whoever played the 8.",
      on: rules.eights === "nextPlayerNames",
      toggle: {
        ...rules,
        eights: rules.eights === "nextPlayerNames" ? "playerNames" : "nextPlayerNames",
      },
    },
    {
      key: "seedEight",
      label: "Dealer's Choice on 8",
      blurb: "If the first card of the game is an 8, the dealer gets to choose the suit.",
      on: rules.seedEight === "dealerNames",
      toggle: {
        ...rules,
        seedEight: rules.seedEight === "dealerNames" ? "natural" : "dealerNames",
      },
    },
  ];

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-white/50">House rules</p>
      <ul className="mt-2 flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.key}>
            {/* The whole rewritten `HouseRules`, never a flipped boolean:
                `setHouseRules` replaces `room.options` wholesale so a game already
                dealt cannot be reached (`AGENTS.md`). */}
            <SettingSwitch
              label={row.label}
              blurb={row.blurb}
              on={row.on}
              onChange={() => onChange(row.toggle)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Real life leads, because it is the answer that changes the most. Remote play
 * is still what a new room *is* — see `createRoom`.
 *
 * **Both answers carry a line saying what they mean for the evening** (#305).
 * The labels say where everybody is and nothing about what follows from it, and
 * what follows is most of this app: which view the phones come up in, whether
 * the seat order is worth getting right, whether a propped-up screen can draw
 * for the seat on the clock. It is drawn for whichever answer is standing, in
 * the shape `AutopilotPicker` and `BotSpeedPicker` already use — one line under
 * the switch rather than two beside each other, because the track is one control
 * and a phone gives each half about half a sentence's width. */
const PLACES = [
  { value: "irl", label: "Real life", blurb: "Play against people at a table, in real life." },
  { value: "remote", label: "Remote play", blurb: "Play with your friends online, remotely." },
] as const;

/**
 * Where everybody is. Not a house rule and not next to them: it changes nothing
 * about the game, only how each phone draws it. **Both answers are named** — the
 * old shape stated one and left the host to infer that Off meant the rest of the
 * world. It comes before the seats because everything below hangs off it.
 */
export function IrlToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  // No gloss on the question: since #305 both answers carry a line saying what
  // they mean, and an aside under `uppercase tracking-wide` comes out the same
  // size and weight as the heading it is qualifying (#316). One constant still,
  // because it is the visible heading *and* `TwoWay`'s accessible name.
  const question = "Game mode";

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-white/50">{question}</p>
      <TwoWay
        label={question}
        options={PLACES}
        value={on ? "irl" : "remote"}
        onChange={(place) => onChange(place === "irl")}
        className="mt-2"
      />
      <p className="mt-2 text-xs text-white/40">{PLACES[on ? 0 : 1].blurb}</p>
    </div>
  );
}

/**
 * The way back to the settings once the cards are out (#134), and since #253
 * **one door with two rooms** rather than two doors an inch apart.
 *
 * #188 made the case for two — the host's cog says *table settings*, the
 * player's said *yours*, and a gear and a person are legible as different things
 * where two gears would not be. The reasoning was sound and the outcome was not:
 * the player's door held exactly one control, that control is also the last
 * thing on the rules screen, and **rules** is a labelled word in the same header.
 * So the glyph nobody recognised led to the one setting everybody could already
 * reach by pressing a word that says what it is.
 *
 * The distinction #188 was protecting survives as **two pages behind one cog**
 * (#313). It opens on *Your settings* for everybody seated, and a host — and only
 * a host — gets a row at the foot of that page through to *Room settings*, in the
 * shape `Rule` uses for a drill. A non-host sees one page and no navigation at
 * all: nothing naming a room they cannot enter.
 *
 * It was one scrolling column until then, headed in two halves. Splitting is what
 * buys a panel that fits: ~250–310px for the personal page and ~410 for the room
 * page, against ~560 of usable height on the shortest portrait phone worth
 * supporting. See `SettingsPage` for the measurements it was wrong at.
 *
 * **The bar for the personal half is unchanged**: it belongs to one player and
 * changes nothing about the room. That rules out everything in the other half.
 * It does **not** mean private — the hints toggle is announced when it goes on
 * and marks the seat for as long as it lasts (#187), and sharing a roof with the
 * host's settings must not start implying otherwise.
 *
 * **A watcher gets no cog at all**: the yours half is about cards they do not
 * have and the table half is not theirs.
 *
 * **The two settings in the host's half answer at different times, and the panel
 * says which.** **Bot pace is deliberately not in here**: it reads live, so
 * changing it mid-game moves a challenge window somebody is watching. **44px in
 * both layouts, and it exists in both** (#194) — hosts did not find the 16px
 * glyph, and it rendered only in a header `HandView` does not have.
 */
export function SettingsCog({
  isHost,
  hints,
  onHints,
  autopilot,
  onAutopilot,
  rules,
  irl,
  dealerMode,
  shuffleSeats,
  onRules,
  onIrl,
  onDealerMode,
  onShuffleSeats,
  label,
  className = "",
}: {
  /** Whether the table half is drawn at all. The personal half is everyone's. */
  isHost: boolean;
  hints: boolean;
  onHints: (on: boolean) => void;
  /** Whether this seat is playing itself for a while (#202). Yours alone to set
   * — the server stamps it from the connection — and public once it is on. */
  autopilot: AutopilotMode;
  onAutopilot: (mode: AutopilotMode) => void;
  rules: HouseRules;
  irl: boolean;
  dealerMode: DealerMode;
  shuffleSeats: boolean;
  onRules: (rules: HouseRules) => void;
  onIrl: (on: boolean) => void;
  onDealerMode: (mode: DealerMode) => void;
  onShuffleSeats: (on: boolean) => void;
  /**
   * The word under the glyph, in the upright header, where all four items are an
   * icon with a word beneath it (#330). Left off in the peek strip, which has no
   * room for words — the right-hand end of that row belongs to the card in play,
   * the prompt and the deck, and anything pushed off it wraps the pile onto a
   * second line, a card's height off the hand (#194).
   */
  label?: string;
  /** Where the caller wants it sat in its row. The size is not the caller's. */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  /** Which page is showing. Not remembered: closing forgets it and the next open
   * lands on *yours*, the reasoning that took `goleta:table-view` out — a
   * preference the app would have to store to answer a question that is one tap
   * to re-ask. */
  const [page, setPage] = useState<SettingsPage>("yours");
  const close = (): void => {
    setOpen(false);
    setPage("yours");
  };

  return (
    <>
      <button
        type="button"
        aria-label="Settings"
        aria-expanded={open}
        title="Settings"
        onClick={() => setOpen(true)}
        className={
          label
            ? [headerItem, className].join(" ")
            : [
                // 44px square, and the glyph is drawn to fill it: a big target around a
                // small mark still reads as small print.
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg",
                "text-white/60",
                "transition-colors hover:bg-white/5 hover:text-white",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
                className,
              ].join(" ")
        }
      >
        <CogGlyph />
        {label ? <span>{label}</span> : null}
      </button>

      {open ? (
        <div
          className={`fixed inset-0 ${LAYER.dialog} flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm`}
          role="dialog"
          aria-modal="true"
          aria-label={page === "room" ? "Room settings" : "Your settings"}
          onClick={close}
        >
          <Panel
            className="flex w-full max-h-full max-w-sm flex-col gap-4 overflow-y-auto"
            onClick={(event) => event.stopPropagation()}
          >
            {page === "room" ? (
              <>
                <div className="flex flex-col gap-2">
                  {/* The heading is the page's title now rather than a divider in a
                      column. Same component and same size: a page still has to say
                      which room you are standing in (#289). */}
                  <SectionHeading>Room settings</SectionHeading>
                  <IrlToggle on={irl} onChange={onIrl} />
                </div>

                {/* Still separated from the tap-to-take-effect switch above, because
                    the note at the foot is true of these and not of that one. */}
                <div className="flex flex-col gap-4">
                  <HouseRulesPicker rules={rules} onChange={onRules} />
                  {/* In here because of when it answers rather than what it is: read
                      once, at the deal, exactly like the switches above it. */}
                  <DealerPicker mode={dealerMode} onChange={onDealerMode} />
                  {/* **Below the starting player, and independent of it** (#289).
                      #245 put it above, on the argument that where people sit is
                      the bigger of the two and decides what the other is even
                      about. That is true of the *rules* and not of the *reading*:
                      who opens is the question a host has already been asked by
                      the lobby, and musical chairs is the one that changes what a
                      table has to physically do. It is last because it is the
                      loudest. */}
                  <ShuffleSeatsToggle on={shuffleSeats} onChange={onShuffleSeats} />
                  {/* Said once, under everything it is true of: the same sentence
                      four times is a warning, not a note. */}
                  <p className="text-xs text-white/40">
                    These apply at the next deal. This hand keeps the rules it was dealt under.
                  </p>
                </div>

                <PageLink label="Your settings" back onGo={() => setPage("yours")} />
              </>
            ) : (
              <>
                <div className="flex flex-col gap-4">
                  <SectionHeading>Your settings</SectionHeading>
                  <HintsRow on={hints} onChange={onHints} />
                  {/* Both halves of *yours* clear the bar #188 set: they belong to one
                      player and change nothing about the room. Neither is private —
                      hints are shouted (#187) and an autopiloted seat carries a
                      standing mark (#202). */}
                  <AutopilotPicker mode={autopilot} onChange={onAutopilot} />
                </div>

                {/* Only a host is told the other page exists. A non-host sees one
                    page and no navigation — nothing naming a room they cannot
                    enter. */}
                {isHost ? <PageLink label="Room settings" onGo={() => setPage("room")} /> : null}
              </>
            )}

            <Button variant="secondary" full onClick={close}>
              Done
            </Button>
          </Panel>
        </div>
      ) : null}
    </>
  );
}
