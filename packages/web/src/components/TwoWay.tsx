/**
 * A question with exactly two named answers, drawn as one sliding switch.
 *
 * Four places in this app asked one when it was written (#244), and all four used
 * to draw two filled rectangles side by side. Two buttons do not say *these are
 * the two ends of one thing*; they say *here are two buttons, one of which is
 * already pressed* — which is why the copy around each of them had to work so
 * hard to name both answers out loud. Naming them is right and is not what makes
 * them read as a pair. A track with a thumb on it is.
 *
 * `AutopilotPicker` is the newest (#291), and it arrived by the same argument
 * running backwards: it asked *stepping away?* and answered with three buttons,
 * two of which were the same answer at different strengths.
 *
 * **It is never an On/Off**, and that is the reason it exists rather than a
 * limitation. Every caller has two answers a person would *say*, so neither end
 * is drawn as the absence of the other: `ShuffleSeatsToggle` and the rows inside
 * `HouseRulesPicker` genuinely are off when they are off, and they are
 * deliberately not drawn with this. *I'm here* passes that bar and `off` in the
 * engine underneath it is beside the point — what a control is drawn as is
 * decided by what it reads as, not by what it sends.
 *
 * **One control, not two buttons**, to a screen reader as well: a `radiogroup`
 * of two radios rather than a pair of `aria-pressed` buttons. Roving `tabIndex`
 * makes the whole thing one tab stop, and the arrow keys move between the
 * answers — which is what a radio group is for and what a pair of buttons could
 * never be given.
 *
 * **Reduced motion gets the state change without the slide.** The thumb still
 * moves: it *is* the answer, not decoration.
 */

import { useRef } from "react";

export interface TwoWayOption<T extends string> {
  value: T;
  label: string;
}

export function TwoWay<T extends string>({
  label,
  options,
  value,
  onChange,
  className = "",
}: {
  /** The question, for a screen reader. The visible heading is the caller's —
   * one of them has no room for one. */
  label: string;
  options: readonly [TwoWayOption<T>, TwoWayOption<T>];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const chosen = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  /** Arrow keys move the answer *and* the focus, so the one tab stop is always
   * the one that is checked. Home and End are the ends of a two-item list. */
  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
    const wanted =
      event.key === "ArrowLeft" || event.key === "ArrowUp" || event.key === "Home"
        ? 0
        : event.key === "ArrowRight" || event.key === "ArrowDown" || event.key === "End"
          ? 1
          : null;
    if (wanted === null) return;

    event.preventDefault();
    buttons.current[wanted]?.focus();
    if (wanted !== chosen) onChange(options[wanted]!.value);
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={["relative flex rounded-full bg-white/10 p-1", className].join(" ")}
    >
      {/* The thumb, under the labels. Half the track less the padding, moved by
          its own width — so the two rest positions are the two insets and
          nothing has to know the track's width. */}
      <span
        aria-hidden
        style={{ transform: chosen === 1 ? "translateX(100%)" : undefined }}
        className={[
          "pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full",
          "bg-amber-400 transition-transform duration-200 ease-out motion-reduce:transition-none",
        ].join(" ")}
      />

      {options.map((option, index) => (
        <button
          key={option.value}
          ref={(element) => {
            buttons.current[index] = element;
          }}
          type="button"
          role="radio"
          aria-checked={index === chosen}
          // One tab stop for the pair: the checked answer is the way in, and the
          // arrows are the way across.
          tabIndex={index === chosen ? 0 : -1}
          onClick={() => onChange(option.value)}
          className={[
            "relative z-10 min-h-11 flex-1 rounded-full px-3 text-sm font-semibold",
            "transition-colors focus-visible:outline-none focus-visible:ring-2",
            "focus-visible:ring-amber-300",
            index === chosen ? "text-felt-950" : "text-white/70 hover:text-white",
          ].join(" ")}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
