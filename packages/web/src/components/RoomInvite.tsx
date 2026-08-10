/**
 * The room code, and the two things a code is for.
 *
 * In the lobby the invite is the screen — a code, a link and, at an in-person
 * table, a QR sitting under the switch that asked for it. Once the cards are
 * out there is no lobby to go back to, and the code shrank to four characters
 * in the corner that said what the room was called and did nothing. Somebody
 * arriving at a table mid-game is the ordinary case at a real one, and the
 * answer was "read this out and have them type it" (#135).
 *
 * Tapping it opens both invites behind one toggle, because a code is the
 * address of the room and the two arrivals it can bring are a **person** and a
 * **screen**. They are the same four characters and different links, which is
 * exactly the sort of thing a QR should be hiding.
 *
 * **A player is offered first**, and is what the dialog opens on: it is the
 * common arrival, and a shared screen is a thing a table sets up once. The
 * order is not about which is selected — it is what somebody holding the phone
 * out to a newcomer reaches for.
 *
 * **The code is on the panel in full, above the QR.** A camera is the fast path
 * and not the only one — a laptop across the room has no camera pointed
 * anywhere useful, and reading four characters out loud is how this actually
 * goes at a table. The QR is the convenience; the code is the invite.
 *
 * Anybody at the table can open it, not just the host. Handing somebody the way
 * in is not a host power at a real table, and nothing behind here changes the
 * room — it is two links and the code, all three of which every player can
 * already see or say out loud.
 */

import { useState } from "react";

import { QrCode } from "./QrCode.tsx";
import { Button, Panel } from "./ui.tsx";
import { useDismissOnScreenJoin } from "../lib/sharedScreens.ts";
import { joinLink } from "../net/route.ts";

type Invite = "player" | "screen";

const INVITES: {
  key: Invite;
  label: string;
  /** What scanning it gets you, said as the thing that arrives. */
  blurb: string;
  copy: string;
}[] = [
  {
    key: "player",
    label: "New player",
    blurb: "Point a camera at it, or read the code out.",
    copy: "Copy invite link",
  },
  {
    key: "screen",
    label: "Shared screen",
    blurb: "A spare phone, tablet or TV showing the middle of the table.",
    copy: "Copy shared-screen link",
  },
];

export function RoomInvite({
  code,
  /**
   * Whether a game is running, which decides what a scan can get you rather
   * than what is on offer. A seat is refused for the length of a hand — the
   * Join screen offers a watch instead — and a person held out a QR deserves to
   * know that before they scan it rather than after.
   */
  underWay,
  screens,
  onClose,
}: {
  code: string;
  underWay: boolean;
  /** How many shared screens are connected right now. */
  screens: number;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<Invite>("player");
  const [copied, setCopied] = useState(false);

  const invite = INVITES.find((option) => option.key === kind) ?? INVITES[0]!;
  const link = joinLink(code, kind === "screen" ? "table" : "play");

  // Same rule as the lobby's dialog: the shared-screen code takes itself away
  // once a shared screen arrives — but only while it is the code on screen. A
  // screen joining is no reason to shut a panel being held out to a newcomer.
  useDismissOnScreenJoin(screens, kind === "screen", onClose);

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
      aria-label="Invite to this table"
      onClick={onClose}
    >
      <Panel
        className="w-full max-w-sm text-center"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex gap-2">
          {INVITES.map((option) => (
            <Button
              key={option.key}
              variant={option.key === kind ? "primary" : "secondary"}
              className="flex-1"
              aria-pressed={option.key === kind}
              onClick={() => {
                setKind(option.key);
                setCopied(false);
              }}
            >
              {option.label}
            </Button>
          ))}
        </div>

        {/* Above the QR, at the size it is read out at. The camera is the fast
            path; the code is the one that works across a room. */}
        <p className="mt-4 font-mono text-2xl tracking-[0.3em] text-white">{code}</p>

        <div className="mt-3 flex justify-center">
          <QrCode
            value={link}
            label={
              kind === "screen"
                ? `Scan for a shared screen in room ${code}`
                : `Scan to join room ${code}`
            }
            className="w-56 p-3"
          />
        </div>

        <p className="mt-3 text-xs text-white/40">{invite.blurb}</p>

        {/* Only against the player invite: a shared screen joins as a watcher,
            which is what it is for, so a game already running is no obstacle to
            it and saying so would be a warning about nothing.

            Careful about what it promises. A seat is refused for the length of
            a hand and the Join screen offers a watch instead — but a watcher is
            not dealt in when the next game starts, so "they'll be in the next
            one" would be the app saying something it does not do. What is true
            is that the code keeps working. */}
        {underWay && kind === "player" ? (
          <p className="mt-1 text-xs text-amber-300/70">
            This hand is under way, so they can watch it — the code takes a seat once it ends.
          </p>
        ) : null}

        <Button variant="ghost" className="mt-3" onClick={() => void copy()}>
          {copied ? "Link copied" : invite.copy}
        </Button>
        <Button variant="secondary" full className="mt-3" onClick={onClose}>
          Done
        </Button>
      </Panel>
    </div>
  );
}
