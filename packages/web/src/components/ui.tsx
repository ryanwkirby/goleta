import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "sunny" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-amber-400 text-felt-950 hover:bg-amber-300 active:bg-amber-500",
  secondary: "bg-white/10 text-white hover:bg-white/20 active:bg-white/25",
  ghost: "text-white/70 hover:text-white hover:bg-white/10",
  sunny:
    "bg-gradient-to-b from-amber-300 to-amber-500 text-felt-950 shadow-amber-500/40 shadow-lg hover:from-amber-200 hover:to-amber-400",
  danger: "bg-rose-500/90 text-white hover:bg-rose-500",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  full?: boolean;
}

export function Button({
  variant = "secondary",
  full = false,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold",
        // Comfortably tappable on a phone without looking clumsy on a desktop.
        "min-h-11 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
        "disabled:cursor-not-allowed disabled:opacity-40",
        VARIANTS[variant],
        full ? "w-full" : "",
        className,
      ].join(" ")}
    />
  );
}

export function Panel({
  children,
  className = "",
  ...props
}: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={[
        "rounded-2xl bg-black/25 p-5 ring-1 ring-white/10 backdrop-blur-sm",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/50">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs text-white/40">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl bg-white/10 px-4 py-3 text-base text-white placeholder:text-white/30 " +
  "ring-1 ring-white/15 focus:outline-none focus:ring-2 focus:ring-amber-300";

/**
 * A room code drawn as the control that copies its link (#243).
 *
 * The code is the biggest thing on the screen it is on and the thing a host
 * reaches for, and two other places in this app already say *tap it to copy*
 * about a code — so drawing it as a `<p>` was the app telling people to do
 * something that did nothing.
 *
 * **A real button, not a click handler on some text**: keyboard reachable, and
 * labelled with what it copies rather than with the four characters it draws,
 * which a screen reader would otherwise spell out as the whole of what pressing
 * it means. The labelled button stays beside it, because it is the path that
 * says out loud what tapping the code does.
 *
 * The size and colour are the caller's — a lobby draws this at reading-across-a-
 * room size and the in-game panel at reading-out size.
 */
export function CodeButton({
  code,
  label,
  onCopy,
  className = "",
}: {
  code: string;
  /** What pressing it does, said as a sentence. Not the code. */
  label: string;
  onCopy: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onCopy}
      className={[
        "block w-full rounded-xl transition-colors hover:brightness-110",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
        className,
      ].join(" ")}
    >
      {code}
    </button>
  );
}

/**
 * One item in the upright table's header: a drawn glyph with a word under it
 * (#330).
 *
 * That row was two glyphs, a word and a picture of a door, all in the same small
 * grey print, so nothing in it said which of them were the same kind of thing —
 * and hosts did not find the cog until it was made 44px (#194). The target was
 * never what was missing; legibility was.
 *
 * The shape lives here rather than in the header because two of the four items
 * draw their own trigger: `SettingsCog` and `LeaveControl` each hold a dialog
 * open, so they take the class from here instead of being wrapped in it.
 *
 * Still comfortably over 44px in both directions — the word is what makes it
 * taller, and in the upright column that comes out of the felt between the seat
 * strip and the piles, which is `flex-1` and centred, rather than out of the
 * cards.
 */
export const headerItem =
  "flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1.5 " +
  "min-w-11 text-[0.7rem] leading-none text-white/60 transition-colors " +
  "hover:bg-white/5 hover:text-white " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300";
