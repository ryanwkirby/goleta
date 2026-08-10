/**
 * Offering the propped-up screen a way out of the browser chrome. **A pilot.**
 *
 * The shared screen is the one device in the room that gets opened once and
 * left alone for an evening, the one giving up the most to chrome because
 * nobody is going to pick it up and tidy it, and the only device here where
 * asking somebody to install something is sane: it happens once, by the host,
 * before anything is running.
 *
 * **Built to be ripped out.** The open question is whether an install prompt
 * belongs in this app at all — the whole identity model is *no accounts, scan a
 * code, play*, and "add this to your home screen" is the first thing here that
 * sounds like a signup even though it isn't one. So it goes on exactly one
 * surface and nothing is allowed to start depending on it, in the same way
 * nothing depends on a shared screen existing at all. Removing it is deleting
 * this file, the manifest and its `<link>`, and one paragraph of `AGENTS.md`.
 *
 * **Which offer you get is decided by what the device can do, never by a user
 * agent.** Four capability questions, in order:
 *
 *   1. Already standalone — nothing to offer, and nothing is drawn.
 *   2. `beforeinstallprompt` fired — this browser will install on request, so
 *      ask it to. Android, and desktop Chrome and Edge.
 *   3. `"standalone" in navigator` — the browser has iOS's home-screen app
 *      model, which is the capability, so the offer is words and the Share
 *      sheet. There is no event to hook on iOS and nothing to call. This is why
 *      an iPad gets the install rather than the fullscreen: fullscreen there
 *      leaves a **non-dismissible overlay button**, which on a screen propped
 *      for a whole evening is a permanent artifact in the corner of the one
 *      display everybody is looking at.
 *   4. Fullscreen exists — a laptop or a TV browser, where an install means
 *      little and `requestFullscreen` is simply the better answer.
 *
 * **Why this is safe here and would not be on a phone.** An installed web app
 * gets its own storage container, separate from Safari's. A phone that
 * installed after joining would come back as a *new player* with no `playerId`
 * and no rejoin token, and its seat would be orphaned. The shared screen holds
 * neither — it is a watcher (#16) with no identity at all — so it has nothing
 * to lose crossing that boundary.
 */

import { useEffect, useState } from "react";

import { useFullscreen } from "../lib/fullscreen.ts";
import { Button } from "./ui.tsx";

/**
 * That this screen has said no. Remembered, because a nudge that came back
 * every time the host walked past would be the thing the pilot is checking for.
 *
 * A decision, not a device state — which is what separates it from the
 * fullscreen offer, where nothing is persisted because the browser already
 * reports whether it is held.
 */
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
      // Chrome fires this instead of showing its own bar, and expects the page
      // to hold it and call `prompt()` off a gesture.
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
    // Quiet, and out of the way of the code and the QR that are the actual job
    // of this screen. It says what it buys, because "install" on its own reads
    // like an account request in an app that has gone to some trouble not to
    // have accounts.
    //
    // Down in the bottom band with the seat names, which leave the middle of
    // that edge free (`tableEdges.ts`) — and capped, because an uncapped pill
    // grew across the board and sat on the QR it is meant to be quieter than.
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
