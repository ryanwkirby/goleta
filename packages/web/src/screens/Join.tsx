import { useState } from "react";

import type { ClientMessage } from "@goleta/engine";

import { Button, Field, Panel, inputClass } from "../components/ui.tsx";
import { loadName, saveName } from "../net/identity.ts";
import { codeFromHash, hashFor } from "../net/route.ts";

export function Join({
  send,
  connecting,
  /**
   * Whether the last refusal was "that game is already under way". True for
   * that one refusal and no other — a wrong code is a wrong code, and offering
   * to watch a room that doesn't exist is a second dead end rather than a way
   * out of the first.
   */
  underWay = false,
}: {
  send: (message: ClientMessage) => void;
  connecting: boolean;
  underWay?: boolean;
}) {
  const [name, setName] = useState(loadName);
  const [code, setCode] = useState(() => codeFromHash() ?? "");
  /**
   * The room that turned us away, latched here rather than read off the live
   * error: the banner expires after a few seconds, and an offer that vanishes
   * while somebody is still reading it is worse than not making it. Cleared
   * when the code changes, so it can never point at a different table.
   */
  const [refused, setRefused] = useState<string | null>(null);

  const trimmedName = name.trim();
  const trimmedCode = code.trim().toUpperCase();
  const canCreate = trimmedName.length > 0;
  const canJoin = canCreate && trimmedCode.length === 4;
  if (underWay && refused !== trimmedCode) setRefused(trimmedCode);
  // Tied to the code in the box, so editing it takes the offer away with it.
  const offerWatch = refused !== null && refused === trimmedCode;

  const go = (message: ClientMessage): void => {
    saveName(trimmedName);
    send(message);
  };

  /**
   * The way out of the one refusal this form can't work its way past.
   *
   * A seat is refused for the length of a game, and until now the answer was an
   * error banner over a form that would keep failing however many times it was
   * submitted — which is exactly what somebody who has just pointed a camera at
   * a table mid-hand gets. Watching is a different connection with a different
   * URL, so it is a reload rather than a message: the hash is how a screen says
   * what it came to do, and `useGoleta` reads it once on the way up.
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
          Crazy Eights, reversed. Hold on to your cards — the last player with any wins.
        </p>
      </header>

      <Panel>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (canJoin) go({ t: "join", code: trimmedCode, name: trimmedName });
            else if (canCreate) go({ t: "create", name: trimmedName });
          }}
        >
          <Field label="Your name">
            <input
              className={inputClass}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ryan"
              maxLength={16}
              autoComplete="nickname"
              autoFocus
            />
          </Field>

          <Field label="Room code" hint="Leave it empty to start a new table.">
            <input
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

          {trimmedCode.length === 4 ? (
            <Button type="submit" variant="primary" full disabled={!canJoin || connecting}>
              Join room {trimmedCode}
            </Button>
          ) : (
            <Button type="submit" variant="primary" full disabled={!canCreate || connecting}>
              Start a new table
            </Button>
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

      <p className="text-center text-xs text-white/40">
        No account, no install. 4 to 8 players — share the room code and go.
      </p>
    </div>
  );
}
