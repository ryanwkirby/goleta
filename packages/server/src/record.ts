/**
 * An append-only account of what tables actually did (#359).
 *
 * Nothing this app does used to survive the table it happened at. `persist.ts`
 * writes live rooms to one `rooms.json`, overwritten in place; a room is swept
 * six hours after its last activity, taking every trace of it with it;
 * `Room.gamesPlayed` is a counter rather than a record, and container logs reset
 * on every deploy, which is every merge to `main`. Asked how many games had been
 * played by real people, on which days, with whom, the honest answer was that
 * the data had never existed.
 *
 * One JSONL file in `config.dataDir` — the same named volume the snapshot lives
 * on, so it survives a redeploy and needs no `docker-compose.yml` change. One
 * line per record, each `{ v, at, game, t, … }`.
 *
 * ## The rules this file exists under
 *
 * **It is never served.** `redact.ts` governs what reaches a client, and this is
 * deliberately richer than any client is ever sent: the deck order is in it,
 * which is precisely what redaction guards. No route, no static path, no
 * endpoint. It is read off the disk by hand.
 *
 * **It is never discarded and never migrated.** Each line carries its own `v`.
 * This is the one place `SNAPSHOT_VERSION`'s rule is inverted: a snapshot of an
 * old shape is dropped on boot because serving a half-understood game is worse
 * than dealing a new one, and an old line here is still a true account of a game
 * that was played. Read what you can, leave the rest, delete nothing.
 *
 * **Never `seat.token`.** It is the credential that proves a seat is yours
 * (#256) and the one thing in a `Room` that must not be written down. Seats are
 * built field by field on the way out rather than spread, and there is a test.
 *
 * **Nothing in the running game may depend on it.** A failed write is logged
 * once and dropped, exactly as a failed snapshot is, and the recorder is
 * disabled rather than retried.
 *
 * ## What a reader should know before counting anything
 *
 * **`playerId` counts browsers, not people.** Identity here is a `playerId` plus
 * a rejoin token in `localStorage`, there is no login and there will not be one,
 * so the same person on a phone and a laptop is two players and a cleared
 * browser is a stranger. The seat name is the only human-legible handle and
 * people retype it. A real player is a seat with `bot: false`; a real game is a
 * header with two or more of them.
 *
 * **A game whose lines stop was abandoned, not lost.** Records are written as
 * play happens rather than at `gameOver`, because plenty of games never formally
 * end — people wander off and the room is swept. An abandoned game should be
 * legible as one rather than absent.
 *
 * **The size cap is deliberately unbuilt.** A full game is a few hundred events
 * and an evening is nothing, but a year of them unattended is not. A size or age
 * roll-off wants deciding when there are real numbers to pick a figure from,
 * rather than guessed at now.
 */

import fs from "node:fs";
import path from "node:path";

import type { Card, FeedEvent, GameState, PlayerId } from "@goleta/engine";

import type { Room, Seat } from "./rooms.ts";

/**
 * Bumped when the shape of a line changes. Old lines keep the `v` they were
 * written with and are never rewritten — see the header.
 */
export const RECORD_VERSION = 1;

/** The file, in `dataDir`, beside `rooms.json`. */
export const RECORD_FILE = "games.jsonl";

/** A seat as recorded: built field by field, so `token` cannot arrive by
 * spreading a `Seat` that grows a field later. */
interface RecordedSeat {
  id: PlayerId;
  name: string;
  bot: boolean;
  /** Where they sit round the ring (#320). Seat order is turn order. */
  spot: number;
}

const seatFor = (seat: Seat): RecordedSeat => ({
  id: seat.id,
  name: seat.name,
  bot: seat.bot,
  spot: seat.spot,
});

/**
 * The header. The events alone are not a game: `startGame` deals inside itself
 * and the engine emits no events for the deal, so a record built from the feed
 * alone could replay the middle of the table and never the hands. At
 * `gameStarted` the state is right there and untouched, so the hands and the
 * deck order come off it and the record is self-sufficient — replayable without
 * the engine at all.
 */
interface GameHeader {
  v: number;
  at: number;
  game: string;
  t: "game";
  code: string;
  /** Which game of this room's session it is, at the moment it was dealt. */
  gamesPlayed: number;
  /**
   * True when the header was reconstructed for a game already in progress —
   * every redeploy restarts this process and restores live rooms from the
   * snapshot, and events arriving for a game this process never saw dealt would
   * otherwise be orphaned. The hands and deck are as they stand now, not as they
   * were dealt.
   */
  resumed: boolean;
  irl: boolean;
  botSpeed: string;
  dealerMode: string;
  dealerId: PlayerId | null;
  /** Whether *this* deal reordered the table (#199). */
  seatsShuffled: boolean;
  seats: RecordedSeat[];
  /** The game's own copy, taken at `beginGame` — the host may edit the room's
   * rules mid-game and this hand never feels it (#134). */
  options: GameState["options"];
  /**
   * Kept alongside the events rather than instead of them. The engine is
   * deterministic, so the seed plus the ordered intents would replay a game
   * exactly and in far fewer bytes — but a seed-only record is replayable by the
   * engine version that wrote it, and the rules here move on purpose (#31 → #50,
   * #220 → #318). A rules change would silently turn every older game into a
   * different game. The events are what the log already renders and what a
   * person would actually be rewatching; the seed keeps an exact replay
   * available to anyone who wants to reconstruct one.
   */
  seed: number;
  hands: Record<PlayerId, Card[]>;
  /** Face down to every client, and the reason this file is never served. */
  deck: Card[];
  discardPile: Card[];
}

interface EventLine {
  v: number;
  at: number;
  game: string;
  t: "event";
  /** `TableEvent` rides the same feed as `GameEvent` by design and is recorded
   * with it — `left` is drawn in the log like everything else (#256). */
  event: FeedEvent;
}

export interface Recorder {
  /**
   * Every batch `broadcast` sends, for one room. That function is the single
   * funnel every `FeedEvent` in this app passes through exactly once per room —
   * human intents, bot moves, `beginGame`, `leaveSeat` — which is why the tap is
   * here and not scattered over the intent sites.
   */
  record(room: Room, events: readonly FeedEvent[]): void;
  /** Forget a room's current game id, so a code recycled after a prune cannot
   * inherit one. */
  forget(code: string): void;
  close(): void;
}

/**
 * A room code is four characters and is recycled after a prune, and one room
 * plays many games, so neither the code nor `gamesPlayed` identifies a game on
 * its own. The moment it was dealt does.
 */
const gameIdFor = (code: string, at: number): string => `${code}-${at}`;

const handsOf = (game: GameState): Record<PlayerId, Card[]> => {
  const hands: Record<PlayerId, Card[]> = {};
  for (const player of game.players) hands[player.id] = [...player.hand];
  return hands;
};

/** Writes nothing and never throws. Used when there is no `dataDir` to write to,
 * and in tests that are not about recording. */
export const noRecorder: Recorder = {
  record() {},
  forget() {},
  close() {},
};

export const startRecorder = (dataDir: string): Recorder => {
  const file = path.join(dataDir, RECORD_FILE);
  /** The game each room is currently playing, by code. Not on `Room`: it would
   * change the persisted shape for something the recorder can work out, and a
   * restored snapshot has no id to restore anyway. */
  const games = new Map<string, string>();
  let stream: fs.WriteStream | null = null;
  let broken = false;

  const fail = (error: unknown): void => {
    if (broken) return;
    broken = true;
    stream = null;
    console.error("[record] giving up on the game record:", error);
  };

  const open = (): fs.WriteStream | null => {
    if (broken) return null;
    if (stream) return stream;
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      const opened = fs.createWriteStream(file, { flags: "a" });
      // A stream error arrives asynchronously, so it cannot be caught around the
      // write that caused it.
      opened.on("error", fail);
      stream = opened;
      return opened;
    } catch (error) {
      fail(error);
      return null;
    }
  };

  const writeLine = (line: GameHeader | EventLine): void => {
    const out = open();
    if (!out) return;
    try {
      out.write(`${JSON.stringify(line)}\n`);
    } catch (error) {
      fail(error);
    }
  };

  const startGameRecord = (room: Room, at: number, resumed: boolean): string | null => {
    const game = room.game;
    if (!game) return null;
    const id = gameIdFor(room.code, at);
    games.set(room.code, id);
    writeLine({
      v: RECORD_VERSION,
      at,
      game: id,
      t: "game",
      code: room.code,
      gamesPlayed: room.gamesPlayed,
      resumed,
      irl: room.irl,
      botSpeed: room.botSpeed,
      dealerMode: room.dealerMode,
      dealerId: room.dealerId,
      // On a resumed game the deal's own event is long gone; the room's standing
      // setting is the closest true thing and is marked as such by `resumed`.
      seatsShuffled: resumed ? room.shuffleSeats : false,
      seats: room.seats.map(seatFor),
      options: game.options,
      seed: game.rngSeed,
      hands: handsOf(game),
      deck: [...game.drawPile],
      discardPile: [...game.discardPile],
    });
    return id;
  };

  return {
    record(room, events) {
      if (broken || events.length === 0) return;
      const at = Date.now();

      for (const event of events) {
        if (event.type === "gameStarted") {
          const id = startGameRecord(room, at, false);
          if (id) {
            writeLine({ v: RECORD_VERSION, at, game: id, t: "event", event });
          }
          continue;
        }

        // A game this process never saw dealt — it was restored from the
        // snapshot after a restart, which is every deploy. Its events would
        // otherwise have no header to belong to.
        let id = games.get(room.code);
        if (!id) {
          if (!room.game) continue;
          id = startGameRecord(room, at, true) ?? undefined;
          if (!id) continue;
        }

        writeLine({ v: RECORD_VERSION, at, game: id, t: "event", event });

        // The next deal is a new game, so the id must not carry over.
        if (event.type === "gameOver") games.delete(room.code);
      }
    },
    forget(code) {
      games.delete(code);
    },
    close() {
      stream?.end();
      stream = null;
    },
  };
};
