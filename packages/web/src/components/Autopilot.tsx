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

import { TwoWay } from "./TwoWay.tsx";
import { Button } from "./ui.tsx";

/**
 * **Two answers, because the heading asks a yes/no question** (#291). It used to
 * offer three — *I'm here* / *Only when forced* / *Play for me* — two of which
 * are the same answer at different strengths, sharing the panel's width at
 * `text-xs` on a phone. Whether you are stepping away is the question; how far
 * the seat should go while you are is a second one, and it is only worth asking
 * once the first has been answered.
 *
 * The engine's three modes are untouched, and so is every message on the wire.
 * This is the control, not the state behind it.
 */
const ANSWERS = [
  { value: "off", label: "I'm here" },
  { value: "on", label: "Autoplay" },
] as const;

/** Written from the player's side: the question somebody has is *am I going to
 * hold this up*. Two blurbs for two answers, plus the switch's own line.
 *
 * **Short enough to be read standing up** (#305). The Autoplay line was
 * forty-two words — two subordinate clauses naming both of the choices it stops
 * at, and a third saying it never calls the Sunny Rule — read by somebody who is
 * already on their way out of the room. What they need is that the seat keeps up
 * and gives itself back. The two choices it stops at are in the panel's prose
 * and in `AGENTS.md`, and that it never accuses is a property of the thing
 * rather than something the person leaving has to be told. */
const BLURB: Record<"off" | "on", string> = {
  off: "You play your own turns.",
  on: "Plays automatically for you when there's exactly one legal move, but waits for you to return when there's a choice.",
};

/** The second question's two answers, in the player's own voice (#305).
 *
 * **The line about the table being able to see it has gone with them**, and the
 * mark has not: a seat on autopilot carries a standing one in the strip, on the
 * shared screen and in the lobby for as long as it lasts, and any intent from
 * your own connection ends the whole thing. Both halves of that sentence were
 * true and both are said better by the app doing them — the same trade #290 took
 * on the hints question, which stopped claiming the table could see it while the
 * shout and the seat mark carried on saying so. */
const DECIDES: Record<"off" | "on", string> = {
  off: "Don't make decisions on my behalf.",
  on: "Choose which cards to play for me.",
};

/** One character's difference on screen, a whole sentence to a screen reader —
 * see `AutopilotMark`. Keyed by the engine's mode rather than by the control's
 * answer, because that is what a seat actually carries. */
const MARK: Record<AutopilotMode, string> = {
  off: "",
  forced: "auto",
  bot: "auto+",
};

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
 *
 * **`left` is its own word** (#256), not a third autopilot mode. A seat somebody
 * has stepped away from is coming back; a seat somebody has left is not, and the
 * autopilot is only there to play the hand out. Both are distinct from the
 * lobby's *away*, which is a socket that dropped.
 */
export function AutopilotMark({
  mode,
  left = false,
  name,
  className = "",
}: {
  mode: AutopilotMode;
  /** They said they were going, and their hand is being played out (#256). */
  left?: boolean;
  name?: string;
  className?: string;
}) {
  if (left) {
    const gone = name ? `${name} left the table` : "This player left the table";
    return (
      <span
        title={gone}
        aria-label={gone}
        role="img"
        className={[
          "shrink-0 rounded-full bg-white/10 px-1.5 font-medium text-white/45",
          className,
        ].join(" ")}
      >
        <span aria-hidden>left</span>
      </span>
    );
  }

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
      <span aria-hidden>{MARK[mode]}</span>
    </span>
  );
}

/**
 * The control, for the *yours* half of the cog (#253): it belongs to one player
 * and changes nothing about the room.
 *
 * **Two answers and then, if you took the second, one more question** (#291).
 * *Stepping away?* is a yes/no, so it is drawn with `TwoWay` — the same sliding
 * switch the other named pairs in this app use, which reads as the two ends of
 * one thing rather than as three buttons one of which is pressed. It was three
 * `Button`s until then, and #244's argument against them applies here as it did
 * everywhere else.
 *
 * **Autoplay engages `forced`, never `bot`.** A seat that plays only when there
 * is exactly one lawful move has decided nothing in anybody's name; *Make
 * decisions* is what asks for that, it appears only once Autoplay is on, and it
 * is off when Autoplay is engaged. So nothing is decided for somebody until they
 * ask for it.
 *
 * The three modes underneath (`off` / `forced` / `bot`) and every message on the
 * wire are exactly as they were — and everything in the autopilot bullet holds:
 * it runs on the server with the bots through `decideBotIntent`, so an
 * autopiloted seat can never reach for the deck holding a play; **it never
 * accuses**; the mark is public and standing; nobody may set it for anybody
 * else, because the server stamps the seat from the connection.
 */
export function AutopilotPicker({
  mode,
  onChange,
}: {
  mode: AutopilotMode;
  onChange: (mode: AutopilotMode) => void;
}) {
  const away = mode !== "off";

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-white/50">
        Stepping away?
      </p>
      <TwoWay
        label="Stepping away?"
        options={ANSWERS}
        value={away ? "on" : "off"}
        // Engaging it lands on `forced`; coming back is `off` whichever of the
        // two the seat was in.
        onChange={(answer) => onChange(answer === "on" ? "forced" : "off")}
        className="mt-2"
      />
      <p className="mt-2 text-xs text-white/40">{BLURB[away ? "on" : "off"]}</p>
      {away ? (
        <div className="mt-3 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white">Make decisions</p>
            {/* Both answers said in the player's own voice, and which one is
                shown follows the switch (#305). It described itself in the third
                person — *on, it chooses too* — which is a sentence about the
                software rather than about the thing being asked for. */}
            <p className="text-xs text-white/40">{DECIDES[mode === "bot" ? "on" : "off"]}</p>
          </div>
          <Button
            variant={mode === "bot" ? "primary" : "secondary"}
            className="min-w-16 px-3 py-1.5 text-xs"
            role="switch"
            aria-checked={mode === "bot"}
            aria-label="Make decisions"
            onClick={() => onChange(mode === "bot" ? "forced" : "bot")}
          >
            {mode === "bot" ? "On" : "Off"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
