/**
 * Handing your seat over for a while, and the table being told (#202).
 *
 * **It is public and standing.** At a real table you can see somebody has gone;
 * the app does not hide it, and the mark is also the explanation for why a seat
 * is suddenly playing differently. It is deliberately not the lobby's *away*,
 * which is a socket that has dropped — a different thing, and recoverable.
 *
 * **Not amber.** Amber at this table means the game is waiting on you (#190),
 * and a seat playing itself is the opposite of that.
 */

import type { AutopilotMode } from "@goleta/engine";

import { Button } from "./ui.tsx";

/** What each mode is called, and what it actually does. Written from the
 * player's side: the question somebody has is *am I going to hold this up*. */
const MODES: { value: AutopilotMode; label: string; blurb: string; mark: string }[] = [
  {
    value: "off",
    label: "I'm here",
    blurb: "You play your own turns.",
    mark: "",
  },
  {
    value: "forced",
    label: "Only when forced",
    blurb:
      "Your seat plays for you when there's exactly one legal move, and waits for you on anything that's a real choice — naming a suit, or picking a card to give up.",
    mark: "auto",
  },
  {
    value: "bot",
    label: "Play for me",
    blurb:
      "Your seat plays like a bot at this table would, which by the reversed logic is rather well. It never calls the Sunny Rule on anybody.",
    mark: "auto+",
  },
];

const modeOf = (mode: AutopilotMode) => MODES.find((option) => option.value === mode) ?? MODES[0]!;

/** Said out loud rather than shortened, because a mark on somebody else's seat
 * has to be readable by somebody who has never turned it on. */
const SAID: Record<AutopilotMode, string> = {
  off: "",
  forced: "playing itself when there is only one legal move",
  bot: "being played by the autopilot",
};

/**
 * The standing mark on a seat. Short, because the seat strip is the narrowest
 * surface at this table and a hand you cannot read is a play you cannot spot —
 * so the mode is one character's difference on screen and a whole sentence to a
 * screen reader.
 */
export function AutopilotMark({
  mode,
  name,
  className = "",
}: {
  mode: AutopilotMode;
  name?: string;
  className?: string;
}) {
  if (mode === "off") return null;
  const label = name ? `${name}'s seat is ${SAID[mode]}` : `This seat is ${SAID[mode]}`;

  return (
    <span
      title={label}
      aria-label={label}
      role="img"
      className={[
        "shrink-0 rounded-full bg-white/10 px-1.5 font-medium text-white/60",
        className,
      ].join(" ")}
    >
      <span aria-hidden>{modeOf(mode).mark}</span>
    </span>
  );
}

/**
 * The control, for the *yours* half of the cog (#253): it belongs to one player
 * and changes nothing about the room.
 *
 * Three answers, so it is not `TwoWay` — that component is for a question with
 * exactly two named answers and none of these is the other's opposite. Off leads
 * because it is where everybody starts and where coming back puts you.
 */
export function AutopilotPicker({
  mode,
  onChange,
}: {
  mode: AutopilotMode;
  onChange: (mode: AutopilotMode) => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-white/50">
        Stepping away?
      </p>
      <div className="mt-2 flex gap-2" role="group" aria-label="Stepping away?">
        {MODES.map((option) => (
          <Button
            key={option.value}
            variant={option.value === mode ? "primary" : "secondary"}
            className="flex-1 px-2 text-xs"
            aria-pressed={option.value === mode}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      <p className="mt-2 text-xs text-white/40">{modeOf(mode).blurb}</p>
      {mode === "off" ? null : (
        <p className="mt-1 text-xs text-white/40">
          The table can see this, and it stops the moment you play a card yourself.
        </p>
      )}
    </div>
  );
}
