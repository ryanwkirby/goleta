/**
 * Offering the propped-up screen a way out of the browser chrome. **A pilot.**
 *
 * The shared screen is opened once and left alone for an evening, gives up the
 * most to chrome, and is the only device here where asking somebody to install
 * something is sane.
 *
 * **Built to be ripped out.** The open question is whether an install prompt
 * belongs in this app at all — the identity model is *no accounts, scan a code,
 * play*. Nothing may start depending on it; removing it is deleting this file,
 * the manifest and its `<link>`, and one paragraph of `AGENTS.md`.
 *
 * **Which offer you get is four capability questions, never a user agent:**
 * already standalone (nothing), `beforeinstallprompt` (ask it to install),
 * `"standalone" in navigator` (iOS's model, so words and the Share sheet — and
 * why an iPad gets this rather than fullscreen, which leaves a non-dismissible
 * overlay button on a screen nobody will tidy), then plain fullscreen.
 *
 * **Safe here and not on a phone:** an installed web app gets its own storage
 * container, so a phone that installed after joining would come back as a new
 * player with an orphaned seat. A shared screen holds no identity at all (#16).
 */

import { useEffect, useState } from "react";

import { useFullscreen } from "../lib/fullscreen.ts";
import { Button } from "./ui.tsx";

/** Remembered, because a nudge that came back every time the host walked past
 * would be the thing the pilot is checking for. A decision, not a device state —
 * which is what separates it from the fullscreen offer. */
const DISMISSED = "goleta:table-install-dismissed";

/** Chrome's deferred install prompt, which is not in `lib.dom`. */
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
}

const isStandalone = (): boolean => {
  if (typeof window === "undefined") return false;
  const legacy = (navigator as Navigator & { standalone?: boolean }).standalone;
  return legacy === true || window.matchMedia("(display-mode: standalone)").matches;
};

/** The browser has iOS's home-screen app model, so the Share sheet installs. */
const HAS_SHARE_SHEET_INSTALL = typeof navigator !== "undefined" && "standalone" in navigator;

export function TableInstall() {
  const fullscreen = useFullscreen();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISSED) === "1";
    } catch {
      return false;
    }
  });
  const [standalone] = useState(isStandalone);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);

  useEffect(() => {
    const capture = (event: Event): void => {
      // Chrome fires this instead of showing its own bar, and expects the page to
      // hold it and call `prompt()` off a gesture.
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", capture);
    return () => window.removeEventListener("beforeinstallprompt", capture);
  }, []);

  const dismiss = (): void => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED, "1");
    } catch {
      /* a screen that can't remember asks again, which is the lesser problem */
    }
  };

  if (dismissed || standalone) return null;

  const offer = prompt
    ? {
        blurb: "Install it and the browser bars go away for good.",
        action: (
          <Button
            variant="secondary"
            onClick={() => {
              void prompt.prompt().catch(() => undefined);
            }}
          >
            Install
          </Button>
        ),
      }
    : HAS_SHARE_SHEET_INSTALL
      ? {
          // No event to hook and nothing to call, so the gesture is the offer.
          blurb: "Share → Add to Home Screen, and the browser bars go away for good.",
          action: null,
        }
      : fullscreen.offer
        ? {
            blurb: "Go full screen and the browser bars get out of the way.",
            action: (
              <Button variant="secondary" onClick={fullscreen.request}>
                Full screen
              </Button>
            ),
          }
        : null;

  if (!offer) return null;

  return (
    // Quiet, and out of the way of the code and the QR that are this screen's
    // actual job. It says what it buys, because "install" alone reads like an
    // account request. Down in the bottom band, which the seat names leave free
    // in the middle (`tableEdges.ts`), and capped — an uncapped pill grew across
    // the board and sat on the QR it is meant to be quieter than.
    <div className="absolute bottom-2 left-1/2 flex max-w-136 -translate-x-1/2 items-center gap-4 rounded-2xl bg-black/30 px-5 py-2.5 text-base text-white/50 ring-1 ring-white/10">
      <p className="text-balance">{offer.blurb}</p>
      {offer.action}
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 rounded-md px-2 py-1 text-white/40 transition-colors hover:text-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
      >
        No thanks
      </button>
    </div>
  );
}
