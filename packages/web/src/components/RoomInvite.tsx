/**
 * The room code, and the two things a code is for. Once the cards are out there
 * is no lobby to go back to, and the code used to shrink to four characters that
 * did nothing — so somebody arriving mid-game got "read this out and have them
 * type it" (#135).
 *
 * Tapping it opens both invites behind one toggle: the two arrivals a code can
 * bring are a **person** and a **screen**, same characters, different links. A
 * player is offered first, and the code is on the panel in full above the QR.
 * Anybody at the table can open it.
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
   * Whether a game is running, which decides what a scan can get you. A seat is
   * refused for the length of a hand, and a person held out a QR deserves to
   * know that before they scan it.
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

  // The shared-screen code takes itself away once a shared screen arrives, but
  // only while it is the code on screen: a screen joining is no reason to shut a
  // panel being held out to a newcomer.
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

        {/* Above the QR, at the size it is read out at. */}
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

        {/* Only against the player invite: a shared screen joins as a watcher, so a
            running game is no obstacle to it.

            Careful about what it promises — a watcher is *not* dealt in when the
            next game starts, so "they'll be in the next one" would be the app
            saying something it does not do. What is true is that the code keeps
            working. */}
        {underWay && kind === "player" ? (
          <p className="mt-1 text-xs text-amber-300/70">
            This hand is under way, so they can watch it — they'll be asked to join when it ends.
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
