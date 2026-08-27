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
 * it means. The second trigger stays beside it and is `CopyControl` — see
 * `CodeRow`, which is what both places draw.
 *
 * The size and colour are the caller's — a lobby draws this at reading-across-a-
 * room size and the in-game panel at reading-out size. It is `block` and **not**
 * `w-full`: it sits in a centred row now rather than filling a column.
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
        "block rounded-xl px-1 transition-colors hover:brightness-110",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
        className,
      ].join(" ")}
    >
      {code}
    </button>
  );
}

/**
 * Two sheets, one behind the other. Drawn on the same terms as `CogGlyph`,
 * `BookGlyph` and `QrGlyph` — 24-unit box, `fill="none"`, 1.8 strokes in
 * `currentColor`, round caps and joins — because a character would be whatever
 * the platform's font decided, which is the argument that took the emoji out of
 * the cog (#296).
 */
function CopyGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 5.8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h.8" />
    </svg>
  );
}

/** The same box, so the swap does not move anything beside it. */
function TickGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M5 12.5 10 17.5 19 6.5" />
    </svg>
  );
}

/**
 * The second trigger on a room code, drawn where every other app in the world
 * draws one (#366).
 *
 * It was a full-width word — *Copy invite link* — sitting directly under the one
 * thing on the panel that is meant to be read out across a table. A copy control
 * belongs **beside the value it copies**, on the same line, because that
 * adjacency is what says *this text is the thing that gets copied* — which is
 * exactly the fact #243 established and then drew as a caption.
 *
 * **The sentence is not lost, it moves.** It is the same one `CodeButton`
 * already carries, into `aria-label` and `title`, and the words *Link copied*
 * into an `sr-only` live region — because a glyph that changes silently is not
 * feedback for anybody who is not looking at it. A clipboard that throws leaves
 * the glyph alone: `copied` never goes true, so the app never claims something
 * that did not happen (#243).
 *
 * 44px, in a panel held out to somebody at arm's length.
 */
export function CopyControl({
  label,
  copied,
  onCopy,
}: {
  /** What pressing it does, said as a sentence — the same one the code carries. */
  label: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onCopy}
      className={[
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
        copied ? "text-amber-300" : "text-white/50 hover:bg-white/10 hover:text-white",
        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
      ].join(" ")}
    >
      {copied ? <TickGlyph /> : <CopyGlyph />}
      <span className="sr-only" aria-live="polite">
        {copied ? "Link copied" : ""}
      </span>
    </button>
  );
}

/**
 * A room code and the glyph that copies its link, on one row.
 *
 * **The code stays optically centred**, which is the one piece of arithmetic in
 * here: hanging a control off the right of a centred code shifts the characters
 * left by half an icon, and the code is what somebody reads out. The control's
 * width is reserved on the other side of it too.
 *
 * Both triggers share one `useCopyLink` with each other, so either tap copies
 * and either tap lights the same feedback (#243). That is the caller's to hold —
 * this draws what it is given.
 */
export function CodeRow({
  code,
  label,
  copied,
  onCopy,
  className = "",
  codeClassName = "",
}: {
  code: string;
  label: string;
  copied: boolean;
  onCopy: () => void;
  className?: string;
  /** Size and colour of the characters. A lobby and a held-out panel differ. */
  codeClassName?: string;
}) {
  return (
    <div className={["flex items-center justify-center gap-1", className].join(" ")}>
      <span aria-hidden className="h-11 w-11 shrink-0" />
      <CodeButton code={code} label={label} onCopy={onCopy} className={codeClassName} />
      <CopyControl label={label} copied={copied} onCopy={onCopy} />
    </div>
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
