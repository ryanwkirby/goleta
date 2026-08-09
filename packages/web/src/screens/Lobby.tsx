import { useState, type ReactNode } from "react";

import type { BotSpeed, ClientMessage, HouseRules, RoomView } from "@goleta/engine";

import { QrCode } from "../components/QrCode.tsx";
import { Button, Panel } from "../components/ui.tsx";
import { joinLink } from "../net/route.ts";

/**
 * How everyone else gets in: read it out, or text it.
 *
 * Four characters and a link, and nothing whose height depends on a switch
 * further down the screen. The QR used to live in here and grew out of the
 * middle of it, which pushed the copy button down the moment the host said the
 * table was in person — the answer landing above the question that caused it.
 * It has its own block now, under the switch. See `JoinQr`.
 */
function RoomCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const link = joinLink(code);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Room code</p>
      <p className="mt-1 font-mono text-5xl font-semibold tracking-[0.3em] text-amber-300">
        {code}
      </p>
      <Button variant="ghost" className="mt-1" onClick={() => void copy()}>
        {copied ? "Link copied" : "Copy invite link"}
      </Button>
    </div>
  );
}

/**
 * The thing you hold up across a table.
 *
 * Not a replacement for the code — getting five people to a table used to mean
 * saying four characters aloud and watching four people type them *and* the
 * URL, and this is a faster path to exactly the same place. Anyone seated can
 * show it, host or not: whoever is dealing usually will, but restricting it
 * buys nothing and costs the one person whose phone is nearest.
 *
 * **Only up at an in-person table**, because holding a phone up across one is
 * the whole of what it is for. For players who are somewhere else it is a
 * picture of a link they cannot point a camera at, taking the top third of the
 * lobby to say so.
 *
 * It sits directly under the switch that turns it on, which is why it is its own
 * block rather than part of `RoomCode` — a host who has just said "in person"
 * should see the QR appear below the tap, not above it.
 *
 * Sized to be scannable from the other side of a table without taking the lobby
 * over: the seat list is what people are actually watching once they're in.
 */
function JoinQr({ code }: { code: string }) {
  return (
    <div className="text-center">
      <div className="flex justify-center">
        <QrCode
          value={joinLink(code)}
          label={`Scan to join room ${code}`}
          className="w-44 max-w-[55%] p-2.5"
        />
      </div>
      <p className="mt-2 text-xs text-white/40">Point a camera at it, or type the code.</p>
    </div>
  );
}

function SharedScreenInvite({
  code,
  onClose,
}: {
  code: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const link = joinLink(code, "table");

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Add a shared screen"
      onClick={onClose}
    >
      <Panel className="w-full max-w-sm text-center" onClick={(event) => event.stopPropagation()}>
        <p className="text-sm font-semibold text-white">Add a shared screen</p>
        <div className="mt-4 flex justify-center">
          <QrCode value={link} label={`Scan for shared screen in room ${code}`} className="w-64 p-4" />
        </div>
        <Button variant="ghost" className="mt-3" onClick={() => void copy()}>
          {copied ? "Link copied" : "Copy shared-screen link"}
        </Button>
        <Button variant="secondary" full className="mt-3" onClick={onClose}>
          Done
        </Button>
      </Panel>
    </div>
  );
}

const SPEEDS: { key: BotSpeed; label: string; blurb: string }[] = [
  { key: "human", label: "Human-like", blurb: "A few seconds a turn, like people play." },
  { key: "lightning", label: "Lightning", blurb: "As fast as the server can deal them." },
];

/**
 * What a table is playing, for everyone who isn't the host and can't see the
 * switches. Silent when the table plays the game as written.
 */
const describeRules = (rules: HouseRules): string => {
  const on: string[] = [];
  if (!rules.sunny) on.push("no Sunny Rule");
  if (rules.eights === "nextPlayerNames") on.push("the Power of Eights");
  if (rules.seedEight === "dealerNames") on.push("Dealer's Choice on Eight");
  if (on.length === 0) return "Playing the standard rules.";
  return `House rules: ${on.join(", ")}.`;
};

/**
 * The same sentence for the host, on the front of a drawer that is shut — plus
 * the bot pace, which is the other thing inside it that a table would notice.
 */
const describeTable = (room: RoomView, anyBots: boolean): string => {
  const rules = describeRules(room.houseRules);
  if (!anyBots) return rules;
  return `${rules} Bots at ${room.botSpeed === "human" ? "human-like" : "lightning"} speed.`;
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
function HouseRulesPicker({
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
 * The settings drawer, shut on arrival.
 *
 * Most tables play the game as written and never open this; the ones that do
 * are being deliberate about it, and a tap is no obstacle to that. Shut, it is
 * one line saying what the table is playing — which is the part a host who
 * isn't changing anything actually wants, and it used to be four rows of
 * switches they had to read to work out.
 *
 * The state lives here, so every arrival at a lobby starts collapsed. That is
 * the intent rather than a side effect: a host who opened it last game was
 * changing something last game.
 *
 * It sits alone on its panel now that the IRL toggle leads the lobby, so it has
 * nothing above it to be divided from and keeps no rule of its own.
 *
 * The triangle is deliberately much larger than the label it sits beside. It is
 * the only thing on the row saying there is anything behind it, and at body-text
 * size it read as punctuation. "Advanced" rather than "expert" for the same
 * reason: most tables can leave this shut, and none of them need to have played
 * before to open it.
 *
 * It is a **disclosure** triangle — `▸` shut, `▾` open — and not the `▾`/`▴` pair
 * it started as. That pair is a scroll gesture, "more below / less below", and it
 * said nothing about the one thing this row is for. Shut, this points at the
 * label it will open; open, it points down the panel it opened. Drawn as one
 * glyph rotated rather than two, so the turn is the animation.
 */
function TableSettings({ summary, children }: { summary: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-white">Advanced settings</span>
          <span className="block text-xs text-white/40">{summary}</span>
        </span>
        <span
          aria-hidden
          className={[
            "shrink-0 text-3xl leading-none text-white/60 transition-transform",
            open ? "rotate-90" : "",
          ].join(" ")}
        >
          ▸
        </span>
      </button>
      {open ? <div className="mt-3 flex flex-col gap-3">{children}</div> : null}
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
function IrlToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
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
 * Only worth showing once there's a bot to pace. It's a table setting rather
 * than a personal one — the bots are timed on the server, so everyone watches
 * the same game.
 */
function BotSpeedPicker({
  speed,
  onPick,
}: {
  speed: BotSpeed;
  onPick: (speed: BotSpeed) => void;
}) {
  const chosen = SPEEDS.find((option) => option.key === speed);

  return (
    <div className="border-t border-white/10 pt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Bot speed</p>
      <div className="mt-2 flex gap-2">
        {SPEEDS.map((option) => (
          <Button
            key={option.key}
            variant={option.key === speed ? "primary" : "secondary"}
            className="flex-1"
            aria-pressed={option.key === speed}
            onClick={() => onPick(option.key)}
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
 * Move this seat one place along the table.
 *
 * Arrows rather than a drag: a hand-rolled drag on a phone fights the page
 * scroll for the same gesture, and two buttons are reachable from a keyboard
 * and a screen reader without any of that. The ends are disabled — the server
 * treats a move off either end as nothing happening, so a stale tap costs an
 * error banner nobody needed.
 */
function MoveSeat({
  name,
  first,
  last,
  onMove,
}: {
  name: string;
  first: boolean;
  last: boolean;
  onMove: (direction: "up" | "down") => void;
}) {
  const arrow = "min-h-0 size-8 shrink-0 px-0 py-0 text-xs";

  return (
    <span className="flex items-center gap-1">
      <Button
        variant="secondary"
        className={arrow}
        aria-label={`Move ${name} up`}
        disabled={first}
        onClick={() => onMove("up")}
      >
        ↑
      </Button>
      <Button
        variant="secondary"
        className={arrow}
        aria-label={`Move ${name} down`}
        disabled={last}
        onClick={() => onMove("down")}
      >
        ↓
      </Button>
    </span>
  );
}

export function Lobby({
  room,
  playerId,
  send,
  onShowRules,
  onLeave,
}: {
  room: RoomView;
  playerId: string | null;
  send: (message: ClientMessage) => void;
  onShowRules: () => void;
  onLeave: () => void;
}) {
  const isHost = room.hostId === playerId;
  const enough = room.seats.length >= room.minPlayers;
  const tableFull = room.seats.length >= room.maxPlayers;
  const anyBots = room.seats.some((seat) => seat.bot);
  const winner = room.lastWinnerId
    ? room.seats.find((seat) => seat.id === room.lastWinnerId)
    : undefined;

  /**
   * Seat order is turn order in every room. It is only a table sitting in one
   * that has a real order for it to disagree with, so that is the only place
   * the arrows are worth the room they take — the numbers go out to everyone
   * there, host or not, because working out that the app deals across the table
   * is something the person sitting in the wrong place spots first.
   */
  const numbered = room.irl;
  const orderable = isHost && room.irl && room.seats.length > 1;

  /**
   * "Does the seat order look correct?", asked once, on the first deal into an
   * IRL room.
   *
   * A confirmation rather than a block, and a single line rather than an
   * explanation: getting it wrong is recoverable and getting it right is a
   * glance. Cleared by the deal it guards, so a table that has said yes is
   * never asked twice.
   *
   * Both answers say which one they are — "No, I'll fix it" and "Yes, let's
   * play". A pair of bare verbs made the reader work out which button meant no.
   */
  const [checkingOrder, setCheckingOrder] = useState(false);
  const [orderChecked, setOrderChecked] = useState(false);
  const [sharingScreen, setSharingScreen] = useState(false);
  // Turning IRL off, or losing a seat, takes the question away with it.
  const confirming = checkingOrder && room.irl && enough;

  const deal = (): void => {
    if (room.irl && !orderChecked) {
      setCheckingOrder(true);
      return;
    }
    send({ t: "start" });
  };

  const dealNow = (): void => {
    setOrderChecked(true);
    setCheckingOrder(false);
    send({ t: "start" });
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 p-5">
      <RoomCode code={room.code} />

      {winner ? (
        <Panel className="text-center">
          <p className="text-sm text-white/60">Last game</p>
          <p className="mt-1 text-lg font-semibold text-amber-300">
            {winner.name} kept the most cards
          </p>
        </Panel>
      ) : null}

      {/* Ahead of the names, because the answer decides how the rest of this
          screen — and every phone at the table — behaves. */}
      {isHost ? (
        <Panel>
          <IrlToggle on={room.irl} onChange={(on) => send({ t: "setIrl", on })} />
        </Panel>
      ) : null}

      {/* Directly under the switch that turns it on, and shown to everyone
          seated: the phone nearest the newcomer is the one that gets held up,
          and it isn't always the host's. */}
      {room.irl ? <JoinQr code={room.code} /> : null}

      <Panel>
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold text-white">
            Players{" "}
            <span className="text-white/40">
              ({room.seats.length}/{room.maxPlayers})
            </span>
          </h2>
          {!enough ? (
            <span className="text-xs text-amber-300">needs {room.minPlayers}</span>
          ) : null}
        </div>

        {orderable ? (
          <p className="mt-1 text-xs text-white/40">Put these in the order you're sitting.</p>
        ) : null}

        <ul className="mt-3 space-y-1.5">
          {room.seats.map((seat, index) => (
            /*
              Held at the height of the tallest row rather than fitted to its own
              contents. The host's row is the one with no remove button on it, so
              nothing inside it reaches `Button`'s `min-h-11` and it came out
              24px shorter than every row under it — a list whose odd one out is
              the row belonging to whoever is reading the screen. `min-h-16` is
              that button plus the row's own padding, which is what the seats
              carrying controls already measure.
            */
            <li
              key={seat.id}
              className="flex min-h-16 items-center gap-2 rounded-xl bg-white/5 px-3 py-2.5 text-sm"
            >
              {numbered ? (
                <span className="w-4 shrink-0 text-xs tabular-nums text-white/30">{index + 1}</span>
              ) : null}
              {/* Shrinks before the controls do: a long name in an IRL room
                  shares the row with a remove button and two arrows. */}
              <span className="min-w-0 truncate font-medium text-white">{seat.name}</span>
              {seat.isHost ? (
                <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[0.7rem] font-semibold text-amber-300">
                  host
                </span>
              ) : null}
              {seat.bot ? (
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[0.7rem] text-white/60">
                  bot
                </span>
              ) : null}
              {seat.id === playerId ? <span className="text-xs text-white/40">you</span> : null}
              {!seat.connected && !seat.bot ? (
                <span className="text-xs text-white/40">away</span>
              ) : null}
              <span className="ml-auto flex shrink-0 items-center gap-1">
                {isHost && seat.id !== room.hostId ? (
                  <Button
                    variant="ghost"
                    className="px-2 py-1 text-xs"
                    onClick={() => send({ t: "removeSeat", playerId: seat.id })}
                  >
                    remove
                  </Button>
                ) : null}
                {orderable ? (
                  <MoveSeat
                    name={seat.name}
                    first={index === 0}
                    last={index === room.seats.length - 1}
                    onMove={(direction) => send({ t: "moveSeat", playerId: seat.id, direction })}
                  />
                ) : null}
              </span>
            </li>
          ))}

          {/* Last in the list, because the end of the list is where the bot it
              adds turns up: the server pushes new seats onto the end. */}
          {isHost ? (
            <li>
              <Button
                variant="ghost"
                full
                className="justify-start rounded-xl border border-dashed border-white/15 px-3 py-2.5 text-white/60 hover:border-white/25"
                onClick={() => send({ t: "addBot" })}
                disabled={tableFull}
              >
                <span aria-hidden>+</span> Add a bot
              </Button>
            </li>
          ) : null}
          {room.irl ? (
            <li>
              <Button
                variant="ghost"
                full
                className="justify-start rounded-xl border border-dashed border-white/15 px-3 py-2.5 text-white/60 hover:border-white/25"
                onClick={() => setSharingScreen(true)}
              >
                <span aria-hidden>+</span> Add a shared screen
              </Button>
            </li>
          ) : null}
        </ul>
      </Panel>

      {sharingScreen ? (
        <SharedScreenInvite code={room.code} onClose={() => setSharingScreen(false)} />
      ) : null}

      {isHost ? (
        <>
          {/* On its own, under the names it needs four of. It shared a row with
              "Add a bot" and sat above the settings, which gave equal weight to
              the button a table presses once and the one it presses never. */}
          {confirming ? (
            <Panel>
              <p className="text-sm font-semibold text-white">
                Does the seat order look correct?
              </p>
              <div className="mt-3 flex gap-2">
                <Button className="flex-1" onClick={() => setCheckingOrder(false)}>
                  No, I'll fix it
                </Button>
                <Button variant="primary" className="flex-1" onClick={dealNow}>
                  Yes, let's play
                </Button>
              </div>
            </Panel>
          ) : (
            <Button
              variant="primary"
              full
              className="py-3.5 text-base"
              onClick={deal}
              disabled={!enough}
            >
              Continue
            </Button>
          )}

          <Panel>
            <TableSettings summary={describeTable(room, anyBots)}>
              <HouseRulesPicker
                rules={room.houseRules}
                onChange={(rules) => send({ t: "setHouseRules", rules })}
              />
              {anyBots ? (
                <BotSpeedPicker
                  speed={room.botSpeed}
                  onPick={(speed) => send({ t: "setBotSpeed", speed })}
                />
              ) : null}
            </TableSettings>
          </Panel>
        </>
      ) : (
        <Panel className="text-center text-sm text-white/60">
          Waiting for {room.seats.find((seat) => seat.isHost)?.name ?? "the host"} to deal.
          {room.irl ? (
            <span className="mt-1 block text-xs text-white/40">
              Everyone's in the same room — turn your phone sideways when the cards come out.
            </span>
          ) : null}
          <span className="mt-1 block text-xs text-white/40">{describeRules(room.houseRules)}</span>
          {anyBots ? (
            <span className="mt-1 block text-xs text-white/40">
              Bots play at {room.botSpeed === "human" ? "human-like" : "lightning"} speed.
            </span>
          ) : null}
        </Panel>
      )}

      <div className="mt-auto flex justify-between pt-2">
        <Button variant="ghost" onClick={onShowRules}>
          How to play
        </Button>
        <Button variant="ghost" onClick={onLeave}>
          Leave
        </Button>
      </div>
    </div>
  );
}
