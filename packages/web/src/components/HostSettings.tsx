/**
 * The host's controls over the table, in one place so the lobby and the table
 * show the same switches rather than two drifting copies of them.
 *
 * There are two of them and they are not alike, which is the whole shape of
 * this module. **Where everybody is** changes how every phone draws the game
 * and takes effect the moment it is tapped. **The house rules** change what is
 * played and take effect at the next deal, never at this one — the game keeps
 * its own copy of them from the moment it is dealt, which is what lets the host
 * reach them mid-game at all (#134).
 *
 * Neither knows where it is being shown. The lobby lays them out down a panel;
 * the table stacks them in a popover behind a cog. Anything that depends on
 * which of those it is belongs to the caller.
 */

import { useState } from "react";

import type { HouseRules } from "@goleta/engine";

import { Button, Panel } from "./ui.tsx";

/**
 * What a table is playing, for everyone who isn't the host and can't see the
 * switches. Silent when the table plays the game as written.
 */
export const describeRules = (rules: HouseRules): string => {
  const on: string[] = [];
  if (!rules.sunny) on.push("no Sunny Rule");
  if (rules.eights === "nextPlayerNames") on.push("the Power of Eights");
  if (rules.seedEight === "dealerNames") on.push("Dealer's Choice on Eight");
  if (on.length === 0) return "Playing the standard rules.";
  return `House rules: ${on.join(", ")}.`;
};


/**
 * The house rules, as a row of switches.
 *
 * Every one of these is a rule the game already had written down — two
 * alternates from the original rules, plus the Sunny Rule, which not every
 * table wants to play with. Defaults are the game as written, so a host who
 * never opens this gets exactly what they got before.
 *
 * **A row's description doesn't change when the row is switched.** It used to
 * rewrite itself between "what this rule does" and "Off. what happens instead",
 * which meant the sentence a host was reading to decide moved the moment they
 * decided, and flipping a switch twice to reread it landed somewhere different
 * each time. One fixed line saying what the rule does; the switch says whether
 * the table is playing it. Nothing here implies a table that drops one is
 * playing a lesser game.
 *
 * Two things the wording is careful about. **The Sunny line offers the draw
 * before it names the cost** — "you can draw any time, but others can call you
 * out" — because stating the violation as a condition reads as though the app is
 * about to stop you, and it never will: the draw pile stays tappable with no
 * warning, which is the whole rule (see AGENTS.md). And **Dealer's Choice on
 * Eight carries its condition in its name**, since the rule does nothing at all
 * unless the card turned up to start happens to be an 8 — about one game in
 * thirteen. `docs/RULES.md` still calls it Dealer's Choice, which is its name in
 * the original written rules.
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


/**
 * The two answers, named. `irl` is the flag each one sets.
 *
 * In person leads, because it is the answer that changes the most: it numbers
 * the seats, offers the order arrows, puts the QR up, and sends every phone into
 * the landscape hand view. Remote play is still what a new room *is* — see
 * `createRoom` — and the order of the buttons has nothing to do with which one
 * is selected.
 */
const PLACES: { key: string; label: string; irl: boolean }[] = [
  { key: "irl", label: "In person", irl: true },
  { key: "remote", label: "Remote play", irl: false },
];


/**
 * Where everybody is.
 *
 * Not a house rule and not next to them: it changes nothing about the game,
 * only about how each phone draws it. The copy says what it is for rather than
 * naming a layout — nobody sitting down to play has an opinion about landscape
 * hand views, and everybody has one about whether their friends are in the room.
 *
 * **Both answers are named**, as two halves of a switch rather than an On/Off
 * beside a sentence. The old shape stated one of them — "We're all in the same
 * room" — and left the host to infer that Off meant the rest of the world; a
 * question with two real answers should say both out loud, the same way the
 * seat-order check does.
 *
 * **And nothing explains them.** There was a line under the pair describing what
 * in-person mode does to a phone — a QR, a hand, landscape — which is two
 * mechanisms answering a question already asked in four words. Naming both
 * answers is what made it redundant: a host picking between "in person" and
 * "remote play" is not deciding about a layout, and the QR appearing directly
 * under the tap says the rest better than a sentence above it could.
 *
 * The one host control with no "between games only" on it, so it stays put once
 * a game is running. A table that only works out halfway through the first hand
 * that they are all sat together shouldn't have to finish the game first.
 *
 * It is also the one host control left outside the settings drawer, and it comes
 * before the seats rather than after them. It isn't a rule — it changes what
 * every person in the room does with their phone — and everything below it hangs
 * off the answer: whether the seats are numbered and orderable, whether the seat
 * order is checked before the deal, whether each phone shows a hand or a table,
 * and whether the QR is worth putting up at all.
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
 *
 * A cog in the corner of the table, host only, and only while a game is
 * running: in the lobby every one of these switches is already on the page,
 * unrolled, and a second door into the same room would just be somewhere else
 * to look for them.
 *
 * It replaced a bare `in person: on` button sitting in the header, which was
 * the only host control that survived the lobby and read like a status line
 * somebody had left switched on. The cog says there is a room behind it; the
 * button said there was a fact.
 *
 * **The two settings inside it answer at different times, and the panel says
 * which.** Where everybody is takes effect on the tap — no rule and no timer
 * reads it, so nothing has to wait. The house rules take effect at the next
 * deal and cannot reach this hand, which holds the copy it was dealt under. A
 * host changing the rules mid-game is setting up the next one, and being told
 * that is the difference between a control that looks broken and one that
 * isn't.
 *
 * **Bot pace is deliberately not in here.** It reads live, every time a bot is
 * scheduled, so changing it mid-game moves a challenge window somebody is
 * already watching — the one thing on the lobby's settings panel that is a
 * genuine "between games only", and the server still refuses it. The lobby is
 * where it stays.
 *
 * **It is drawn at 44px in both layouts, and it exists in both** (#194). It was
 * a `text-base` glyph in a `p-1` box — sixteen pixels of ink and a 24px target,
 * in a header of small grey print, at the far left where the eye does not go —
 * and hosts did not find it. It is also the host's only way back to everything
 * the lobby held, so being hard to spot is the whole of what is wrong with it.
 * 44px is the number the rest of this app designs to (`handFan.ts` has the same
 * floor, for the same reason), and the ink is drawn to match rather than left
 * as punctuation in a bigger box.
 *
 * And it used to render only in the upright header, which `HandView` does not
 * have — so a host at an IRL table, which is to say a host holding a phone
 * sideways, which is the entire point of that view, could not reach their own
 * settings without turning the phone upright. It goes in the peek strip's
 * small-print cluster now, which is the one part of that row allowed to wrap.
 *
 * One size and one look in both places, deliberately: it is the same door, and
 * a control that changed shape with the orientation would read as two.
 */
export function HostSettingsCog({
  rules,
  irl,
  onRules,
  onIrl,
  className = "",
}: {
  rules: HouseRules;
  irl: boolean;
  onRules: (rules: HouseRules) => void;
  onIrl: (on: boolean) => void;
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
          // 44px square, the floor everything here is designed to. The glyph is
          // drawn at a size that fills it rather than sitting in the middle of
          // it: a big target around a small mark still reads as small print.
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

            <div className="border-t border-white/10 pt-4">
              <HouseRulesPicker rules={rules} onChange={onRules} />
              {/* Said once, under the switches, rather than against each of
                  them: it is true of all three and the same sentence three
                  times is a warning, not a note. */}
              <p className="mt-3 text-xs text-white/40">
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
