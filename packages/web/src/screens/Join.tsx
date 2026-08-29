import { useEffect, useRef, useState } from "react";

import { NAME_LIMIT } from "@goleta/engine";
import type { ClientMessage } from "@goleta/engine";

import { TwoWay } from "../components/TwoWay.tsx";
import { Button, Field, Panel, inputClass } from "../components/ui.tsx";
import { loadName, saveName } from "../net/identity.ts";
import { codeFromHash, hashFor } from "../net/route.ts";

/**
 * What this browser came here to do, asked before who it belongs to (#326).
 *
 * The name box used to be first and always visible, with the two buttons under
 * it — so the screen asked *who are you* before it had established that there
 * was going to be a seat, and a device that turned out to be the screen in the
 * middle of the table was asked for a name it would never use. The question
 * comes first now and the name box is revealed by the answer.
 *
 * A link with a code in it has already answered it and lands on the code box,
 * which is what `codeFromHash` latches. Choosing wrong is never a dead end.
 */
type Doing = null | "join" | "create";

/**
 * The second question, and only creators are asked it: **is this device playing,
 * or is it the screen in the middle?** (#326).
 *
 * It is what makes it possible to start a game from the centre device, which
 * until now could only ever join a room somebody else had already made. A shared
 * screen has no name, so answering "the table screen" is also what takes the
 * name box away.
 *
 * Drawn with `TwoWay` because it is exactly what that control is for: two
 * answers a person would say, to a question, neither of them the absence of the
 * other.
 */
const DEVICE = [
  { value: "playing", label: "I'm playing" },
  { value: "screen", label: "Table screen" },
] as const;

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
  const [doing, setDoing] = useState<Doing>(() => (codeFromHash() !== null ? "join" : null));
  const [device, setDevice] = useState<"playing" | "screen">("playing");
  const codeRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  /**
   * The room that turned us away, latched rather than read off the live error:
   * the banner expires, and an offer that vanishes while somebody is reading it
   * is worse than not making it. Cleared when the code changes.
   */
  const [refused, setRefused] = useState<string | null>(null);

  const trimmedName = name.trim();
  const trimmedCode = code.trim().toUpperCase();
  /** A shared screen has no name to give, so it is the one path with nothing to
   * fill in at all. */
  const screen = doing === "create" && device === "screen";
  const named = trimmedName.length > 0;
  const canGo =
    doing === "join" ? named && trimmedCode.length === 4 : screen || named;

  // Always remembered against a whole code, so a box cleared or half-typed since
  // can never become the thing it points at.
  if (underWay && doing === "join" && trimmedCode.length === 4 && refused !== trimmedCode) {
    setRefused(trimmedCode);
  }
  // Tied to the code in the box, so editing it takes the offer away with it.
  const offerWatch = doing === "join" && refused !== null && refused === trimmedCode;

  /**
   * The reveal puts the cursor where it just made room. A screen opened from an
   * invite has its code already, so the name is what it wants; anything else
   * wants the box the answer just uncovered.
   */
  useEffect(() => {
    if (doing === null) return;
    if (doing === "join" && codeRef.current?.value === "") codeRef.current.focus();
    else if (!screen) nameRef.current?.focus();
  }, [doing, screen]);

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

  const submit = (): void => {
    if (!canGo) return;
    if (doing === "join") go({ t: "join", code: trimmedCode, name: trimmedName });
    // A shared screen sends no name because it has none, and takes no seat.
    else if (screen) send({ t: "createTable" });
    else go({ t: "create", name: trimmedName });
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 p-5">
      <header className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-white">goleta</h1>
        {/* Two lines rather than three (#326). This flow gains two questions and
            should lose at least as many words as it gains, and the line that went
            was the one restating what the two above it had already said. Block
            children rather than `<br>`: the second wraps on a phone, and each
            sentence still starts on its own line at every width. */}
        <div className="mt-2 text-balance text-white/60">
          <p>It's Crazy Eights, reversed.</p>
          <p>Hold on to your cards — the last player still holding any wins.</p>
        </div>
      </header>

      <Panel>
        {doing === null ? (
          /* The question, on its own. Nothing to fill in until it is answered. */
          <div className="space-y-2">
            <Button variant="primary" full onClick={() => setDoing("create")}>
              Start a new room
            </Button>
            <Button variant="secondary" full onClick={() => setDoing("join")}>
              Join a room
            </Button>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            {doing === "join" ? (
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
            ) : (
              /* Asked before the name, because the answer decides whether there
                 is a name to ask for. No explanation under it: the two answers
                 say what they are. */
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-white/50">
                  This device
                </p>
                <TwoWay
                  label="Is this device playing, or the screen in the middle?"
                  options={DEVICE}
                  value={device}
                  onChange={setDevice}
                  className="mt-2"
                />
              </div>
            )}

            {/* A shared screen holds no cards and never appears in the order, so
                it has nobody to be. */}
            {screen ? null : (
              <Field label="Your name">
                <input
                  ref={nameRef}
                  className={inputClass}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ryan"
                  maxLength={NAME_LIMIT}
                  autoComplete="nickname"
                />
              </Field>
            )}

            <div className="space-y-2">
              <Button type="submit" variant="primary" full disabled={!canGo || connecting}>
                {doing === "join"
                  ? /* Named once there is a whole code to name — a missing name
                       disables the button, it doesn't unname the room. */
                    trimmedCode.length === 4
                    ? `Join room ${trimmedCode}`
                    : "Join room"
                  : screen
                    ? "Open a room on this screen"
                    : "Start the room"}
              </Button>
              {/* Choosing wrong is not a dead end, in either direction. */}
              <Button variant="ghost" full onClick={() => setDoing(null)}>
                Back
              </Button>
            </div>
          </form>
        )}

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
