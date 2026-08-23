/**
 * A setting that is on or off, drawn as a label, a line saying what it does, and
 * a switch.
 *
 * Four places drew this by hand and drew it identically, down to `min-w-16 px-3
 * py-1.5 text-xs` and `role="switch"` (#227): **Musical chairs**, each of the
 * three **house rules**, **Make decisions** under the autopilot, and **Tutorial
 * mode**. `HintsRow` had already written the rule down without being able to act
 * on it — its own note says it uses "the plain On/Off the house-rules rows beside
 * it already use".
 *
 * **It is the other half of `TwoWay`, and the line between them is stated
 * there.** That component is never an On/Off: every one of its callers has two
 * answers a person would *say*, so neither end is drawn as the absence of the
 * other. These four genuinely are off when they are off. Which of the two a new
 * setting wants is decided by what it reads as, not by what it sends — a switch
 * here and a slider there is a distinction the app makes on purpose, so reach
 * for whichever matches and do not add a third shape.
 *
 * The blurb is a node rather than a string because two callers need one: Musical
 * chairs emphasises *Everyone*, and the autopilot's swaps with the state.
 */

import type { ReactNode } from "react";

import { Button } from "./ui.tsx";

export function SettingSwitch({
  label,
  blurb,
  on,
  onChange,
  className = "",
}: {
  /** Also the switch's accessible name: the visible label is what somebody
   * would call this setting, so nothing is gained by writing it twice. */
  label: string;
  blurb: ReactNode;
  on: boolean;
  /** The new state, not a toggle — the house-rules rows send a whole rewritten
   * `HouseRules` and the autopilot sends a mode, so neither of them can flip a
   * boolean and be done. */
  onChange: (on: boolean) => void;
  className?: string;
}) {
  return (
    <div className={["flex items-center gap-3", className].join(" ").trim()}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white">{label}</p>
        <p className="text-xs text-white/40">{blurb}</p>
      </div>
      <Button
        variant={on ? "primary" : "secondary"}
        className="min-w-16 px-3 py-1.5 text-xs"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
      >
        {on ? "On" : "Off"}
      </Button>
    </div>
  );
}
