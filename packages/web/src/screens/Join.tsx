import { useEffect, useRef, useState } from "react";

import { NAME_LIMIT } from "@goleta/engine";
import type { ClientMessage } from "@goleta/engine";

import { Button, Field, Panel, inputClass } from "../components/ui.tsx";
import { loadName, saveName } from "../net/identity.ts";
import { codeFromHash, hashFor } from "../net/route.ts";

export function Join({
  send,
  connecting,
  /** True for that one refusal and no other: a wrong code is a wrong code, and
   * offering to watch a room that doesn't exist is a second dead end. */
  underWay = false,
}: {
  send: (message: ClientMessage) => void;
  connecting: boolean;
  underWay?: boolean;
}) {
  const [name, setName] = useState(loadName);
  const [code, setCode] = useState(() => codeFromHash() ?? "");
  /**
   * What you came here to do, asked as a question rather than inferred from an
   * empty field. A link with a code in it has already answered it, so those
   * arrive on the code box rather than on a button that reveals it.
   */
  const [joining, setJoining] = useState(() => codeFromHash() !== null);
  const codeRef = useRef<HTMLInputElement>(null);
  /**
   * The room that turned us away, latched rather than read off the live error:
   * the banner expires, and an offer that vanishes while somebody is reading it
   * is worse than not making it. Cleared when the code changes.
   */
  const [refused, setRefused] = useState<string | null>(null);

  const trimmedName = name.trim();
  const trimmedCode = code.trim().toUpperCase();
  const canCreate = trimmedName.length > 0;
  const canJoin = canCreate && trimmedCode.length === 4;
  // Always remembered against a whole code, so a box cleared or half-typed since
  // can never become the thing it points at.
  if (underWay && canJoin && refused !== trimmedCode) setRefused(trimmedCode);
  // Tied to the code in the box, so editing it takes the offer away with it.
  const offerWatch = joining && refused !== null && refused === trimmedCode;

  // The reveal puts the cursor where it just made room, and only there: a screen
  // opened from an invite has its code already and its name still empty.
  useEffect(() => {
    if (joining && codeRef.current?.value === "") codeRef.current.focus();
  }, [joining]);

  const go = (message: ClientMessage): void => {
    saveName(trimmedName);
    send(message);
  };

  /**
   * The way out of the one refusal this form can't work its way past. Watching is
   * a different connection with a different URL, so it is a reload rather than a
   * message: the hash is how a screen says what it came to do.
   */
  const watchInstead = (): void => {
    saveName(trimmedName);
    location.hash = hashFor(trimmedCode, "watch");
    location.reload();
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 p-5">
      <header className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-white">goleta</h1>
        <p className="mt-2 text-balance text-white/60">
          It's Crazy Eights, reversed. Hold on to your cards — when you're out of cards, you're out
          of the game. Last man standing wins.
        </p>
      </header>

      <Panel>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            // Enter submits whichever of the two this screen is being, so it
            // never quietly does the other one on a stale or empty code.
            if (joining) {
              if (canJoin) go({ t: "join", code: trimmedCode, name: trimmedName });
            } else if (canCreate) go({ t: "create", name: trimmedName });
          }}
        >
          <Field label="Your name">
            <input
              className={inputClass}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ryan"
              maxLength={NAME_LIMIT}
              autoComplete="nickname"
              autoFocus
            />
          </Field>

          {joining ? (
            <>
              <Field label="Room code" hint="Four characters, from whoever set the room up.">
                <input
                  ref={codeRef}
                  className={`${inputClass} font-mono text-2xl uppercase tracking-[0.4em]`}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/[^A-Za-z0-9]/g, ""))}
                  placeholder="––––"
                  maxLength={4}
                  inputMode="text"
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>

              <div className="space-y-2">
                <Button type="submit" variant="primary" full disabled={!canJoin || connecting}>
                  {/* Named once there is a whole code to name — a missing name
                      disables the button, it doesn't unname the room. */}
                  {trimmedCode.length === 4 ? `Join room ${trimmedCode}` : "Join room"}
                </Button>
                {/* Choosing wrong is not a dead end. */}
                <Button variant="ghost" full onClick={() => setJoining(false)}>
                  Create a new room instead
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Button type="submit" variant="primary" full disabled={!canCreate || connecting}>
                Create a new room
              </Button>
              <Button variant="secondary" full onClick={() => setJoining(true)}>
                Join existing room
              </Button>
            </div>
          )}
        </form>

        {offerWatch ? (
          <div className="mt-4 border-t border-white/10 pt-4 text-center">
            <p className="text-sm text-white/60">
              {trimmedCode} is mid-game, so there's no seat until it finishes. You can watch it out.
            </p>
            <Button variant="secondary" full className="mt-3" onClick={watchInstead}>
              Watch this table instead
            </Button>
          </div>
        ) : null}
      </Panel>

      {/*
        No offer to share a code here: there isn't one on this screen to share.
        A code exists once a room does, and handing it on is the lobby's job.
      */}
      <p className="text-center text-xs text-white/40">No account, no install. 4 to 8 players.</p>
    </div>
  );
}
