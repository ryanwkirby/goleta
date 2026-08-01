import { useState } from "react";

import type { ClientMessage } from "@goleta/engine";

import { Button, Field, Panel, inputClass } from "../components/ui.tsx";
import { loadName, saveName } from "../net/identity.ts";
import { codeFromHash } from "../net/useGoleta.ts";

export function Join({
  send,
  connecting,
}: {
  send: (message: ClientMessage) => void;
  connecting: boolean;
}) {
  const [name, setName] = useState(loadName);
  const [code, setCode] = useState(() => codeFromHash() ?? "");

  const trimmedName = name.trim();
  const trimmedCode = code.trim().toUpperCase();
  const canCreate = trimmedName.length > 0;
  const canJoin = canCreate && trimmedCode.length === 4;

  const go = (message: ClientMessage): void => {
    saveName(trimmedName);
    send(message);
  };

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-6 p-5">
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
      </Panel>

      <p className="text-center text-xs text-white/40">
        No account, no install. 4 to 8 players — share the room code and go.
      </p>
    </div>
  );
}
