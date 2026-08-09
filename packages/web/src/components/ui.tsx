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
