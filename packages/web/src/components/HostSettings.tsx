/**
 * The host's controls over the table, in one place so the lobby and the table
 * show the same switches rather than two drifting copies.
 *
 * Two kinds, and they are not alike. **Where everybody is** changes how every
 * phone draws the game and takes effect on the tap. **The house rules** change
 * what is played and take effect at the next deal — the game keeps its own copy
 * from the moment it is dealt, which is what lets a host reach them mid-game at
 * all (#134). Neither knows where it is being shown.
 */

import { useState } from "react";

import type { DealerMode, HouseRules } from "@goleta/engine";

import { Button, Panel } from "./ui.tsx";

/** What a table is playing, for everyone who isn't the host. Silent when the
 * table plays the game as written. */
export const describeRules = (rules: HouseRules): string => {
  const on: string[] = [];
  if (!rules.sunny) on.push("no Sunny Rule");
  if (rules.eights === "nextPlayerNames") on.push("the Power of Eights");
  if (rules.seedEight === "dealerNames") on.push("Dealer's Choice on Eight");
  if (on.length === 0) return "Playing the standard rules.";
  return `House rules: ${on.join(", ")}.`;
};


/** Silent when the deal rotates, which is the default: a table that has not
 * chosen anything is not being told about a choice (#198). */
export const describeDealing = (mode: DealerMode): string =>
  mode === "random" ? "The dealer is drawn at random each game." : "";

/** Silent when they don't (#199). Worth saying when they do, because seat order
 * is turn order and it decides who you are handing to. */
export const describeSeating = (shuffled: boolean): string =>
  shuffled ? "The seats are shuffled each game." : "";

/**
 * Two named answers rather than a switch, for `IrlToggle`'s reason: a question
 * with two real answers should say both out loud.
 *
 * What the dealer decides is who opens — going first is not nothing when playing
 * is compulsory — and the seeded 8 under Dealer's Choice. A random dealer may
 * land on the same seat twice; a table that finds that annoying wants rotation.
 */
const DEALERS: { key: DealerMode; label: string; blurb: string }[] = [
  { key: "rotate", label: "Pass it along", blurb: "The deal moves one seat each game." },
  { key: "random", label: "Draw for it", blurb: "A seat is picked at random each game." },
];

/**
 * A switch rather than two named answers, unlike the dealer beside it: *pass it
 * along* and *draw for it* are two conventions, whereas this is a thing a table
 * either does or does not do.
 *
 * The copy says what it costs an IRL table, because that is what somebody has to
 * agree to: turn order is where you are sitting, so shuffling it means getting
 * up. The screen that says where to go is the other half of the feature.
 */
export function ShuffleSeatsToggle({
  on,
  irl,
  onChange,
}: {
  on: boolean;
  /** Whether this table is in one room, which changes what it costs. */
  irl: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white">Shuffle the seats</p>
        <p className="text-xs text-white/40">
          {irl
            ? "Turn order changes each game, and everyone is shown where to sit."
            : "Turn order changes each game, so you don't play the same neighbours all night."}
        </p>
      </div>
      <Button
        variant={on ? "primary" : "secondary"}
        className="min-w-16 px-3 py-1.5 text-xs"
        role="switch"
        aria-checked={on}
        aria-label="Shuffle the seats"
        onClick={() => onChange(!on)}
      >
        {on ? "On" : "Off"}
      </Button>
    </div>
  );
}

export function DealerPicker({
  mode,
  onChange,
}: {
  mode: DealerMode;
  onChange: (mode: DealerMode) => void;
}) {
  const chosen = DEALERS.find((option) => option.key === mode);

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Who deals</p>
      <div className="mt-2 flex gap-2">
        {DEALERS.map((option) => (
          <Button
            key={option.key}
            variant={option.key === mode ? "primary" : "secondary"}
            className="flex-1"
            aria-pressed={option.key === mode}
            onClick={() => onChange(option.key)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      <p className="mt-2 text-xs text-white/40">{chosen?.blurb}</p>
    </div>
  );
}


/**
 * Every one of these is a rule the game already had written down, and the
 * defaults are the game as written.
 *
 * **A row's description doesn't change when the row is switched.** It used to
 * rewrite itself between "what this rule does" and "Off. what happens instead",
 * so the sentence a host was reading to decide moved the moment they decided.
 *
 * Two things the wording is careful about. **The Sunny line offers the draw
 * before it names the cost**, because stating the violation as a condition reads
 * as though the app is about to stop you, and it never will. And **Dealer's
 * Choice on Eight carries its condition in its name**, since the rule does
 * nothing unless the card turned up happens to be an 8.
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
      label: "The Power of Eights",
      blurb: "The next player names the suit, not whoever played the 8.",
      on: rules.eights === "nextPlayerNames",
      toggle: {
        ...rules,
        eights: rules.eights === "nextPlayerNames" ? "playerNames" : "nextPlayerNames",
      },
    },
    {
      key: "seedEight",
      label: "Dealer's Choice on Eight",
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
          <li key={row.key} className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">{row.label}</p>
              <p className="text-xs text-white/40">{row.blurb}</p>
            </div>
            <Button
              variant={row.on ? "primary" : "secondary"}
              className="min-w-16 px-3 py-1.5 text-xs"
              role="switch"
              aria-checked={row.on}
              aria-label={row.label}
              onClick={() => onChange(row.toggle)}
            >
              {row.on ? "On" : "Off"}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}


/** In person leads, because it is the answer that changes the most. Remote play
 * is still what a new room *is* — see `createRoom` — and the order of the
 * buttons has nothing to do with which is selected. */
const PLACES: { key: string; label: string; irl: boolean }[] = [
  { key: "irl", label: "In person", irl: true },
  { key: "remote", label: "Remote play", irl: false },
];


/**
 * Where everybody is. Not a house rule and not next to them: it changes nothing
 * about the game, only how each phone draws it. The copy says what it is for
 * rather than naming a layout.
 *
 * **Both answers are named**, as two halves of a switch: the old shape stated
 * one and left the host to infer that Off meant the rest of the world. Naming
 * both is also what made the explanatory line under them redundant.
 *
 * The one host control with no "between games only" on it, and the one left
 * outside the settings drawer. It comes before the seats because everything
 * below it hangs off the answer.
 */
export function IrlToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-white/50">
        Where is everyone?
      </p>
      <div className="mt-2 flex gap-2">
        {PLACES.map((place) => (
          <Button
            key={place.key}
            variant={place.irl === on ? "primary" : "secondary"}
            className="flex-1"
            aria-pressed={place.irl === on}
            onClick={() => onChange(place.irl)}
          >
            {place.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

/**
 * The host's way back to the table's settings once the cards are out (#134).
 * Host only, and only while a game is running: in the lobby every one of these
 * switches is already on the page.
 *
 * **The two settings inside answer at different times, and the panel says
 * which.** Where everybody is takes effect on the tap; the house rules take
 * effect at the next deal and cannot reach this hand. Being told that is the
 * difference between a control that looks broken and one that isn't.
 *
 * **Bot pace is deliberately not in here**: it reads live, every time a bot is
 * scheduled, so changing it mid-game moves a challenge window somebody is
 * watching. The lobby is where it stays.
 *
 * **44px in both layouts, and it exists in both** (#194). It was a 16px glyph in
 * a 24px box in a header of small grey print, and hosts did not find it — and it
 * rendered only in the upright header, which `HandView` does not have, so a host
 * at an IRL table could not reach their own settings at all. One size and one
 * look in both places: it is the same door.
 */
export function HostSettingsCog({
  rules,
  irl,
  dealerMode,
  shuffleSeats,
  onRules,
  onIrl,
  onDealerMode,
  onShuffleSeats,
  className = "",
}: {
  rules: HouseRules;
  irl: boolean;
  dealerMode: DealerMode;
  shuffleSeats: boolean;
  onRules: (rules: HouseRules) => void;
  onIrl: (on: boolean) => void;
  onDealerMode: (mode: DealerMode) => void;
  onShuffleSeats: (on: boolean) => void;
  /** Where the caller wants it sat in its row. The size is not the caller's. */
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Table settings"
        aria-expanded={open}
        title="Table settings"
        onClick={() => setOpen(true)}
        className={[
          // 44px square, and the glyph is drawn to fill it: a big target around a
          // small mark still reads as small print.
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg",
          "text-xl leading-none text-white/60",
          "transition-colors hover:bg-white/5 hover:text-white",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
          className,
        ].join(" ")}
      >
        <span aria-hidden>⚙</span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Table settings"
          onClick={() => setOpen(false)}
        >
          <Panel
            className="flex w-full max-w-sm flex-col gap-4"
            onClick={(event) => event.stopPropagation()}
          >
            <IrlToggle on={irl} onChange={onIrl} />

            <div className="flex flex-col gap-4 border-t border-white/10 pt-4">
              <HouseRulesPicker rules={rules} onChange={onRules} />
              {/* In here because of when it answers rather than what it is: read
                  once, at the deal, exactly like the switches above it. */}
              <DealerPicker mode={dealerMode} onChange={onDealerMode} />
              {/* Independent of the dealer: that one changes who deals, this one
                  changes who follows whom. */}
              <ShuffleSeatsToggle on={shuffleSeats} irl={irl} onChange={onShuffleSeats} />
              {/* Said once, under everything it is true of: the same sentence four
                  times is a warning, not a note. */}
              <p className="text-xs text-white/40">
                These apply at the next deal. This hand keeps the rules it was dealt under.
              </p>
            </div>

            <Button variant="secondary" full onClick={() => setOpen(false)}>
              Done
            </Button>
          </Panel>
        </div>
      ) : null}
    </>
  );
}
