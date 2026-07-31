/**
 * Room snapshots on disk.
 *
 * `docker compose up -d --build` is this repo's normal deploy path, so a
 * restart has to be survivable: a game in progress should come back rather than
 * evaporate. Rooms are few and small, and the access pattern is "write on
 * change, read everything once at boot", which is what a file is for.
 *
 * Writes go to a temp file and are renamed into place, so a crash mid-write
 * leaves the previous snapshot intact rather than a truncated one.
 */

import fs from "node:fs";
import path from "node:path";

import type { GameState } from "@goleta/engine";

import type { Room, RoomStore } from "./rooms.ts";
import { createStore, pruneRooms } from "./rooms.ts";

const SNAPSHOT_VERSION = 2;

interface Snapshot {
  version: number;
  savedAt: number;
  rooms: Room[];
}

/** A v1 game, from before the ruleset update deleted the disposal pile. */
interface LegacyGameState extends Omit<GameState, "sunny"> {
  disposalPile?: Card[];
  sunny?: GameState["sunny"];
}

type Card = GameState["drawPile"][number];

/**
 * v1 → v2, the ruleset update of issue #25.
 *
 * There is no disposal pile any more, so its cards are folded into the bottom
 * of the face-up pile — out of the way of the card in play, and still in the
 * game, which is what card conservation requires.
 *
 * The open challenge window is dropped. It holds a snapshot of the game in the
 * old shape, and migrating a nested state to keep alive a window that closes in
 * seconds is not worth the risk of getting it wrong.
 *
 * A game caught part-way through a Sunny resolution has no v2 equivalent: the
 * steps happen in a different order now, and the old `disposal` phase names one
 * that no longer exists. Rather than drop the room, that one resolution is
 * abandoned and the player to move simply takes their turn. Everyone keeps
 * their hand and the game plays on under the new rules.
 */
const migrateGame = (game: LegacyGameState | null): GameState | null => {
  if (!game) return null;

  const { disposalPile = [], ...rest } = game;
  const migrated: GameState = {
    ...rest,
    discardPile: [...disposalPile, ...game.discardPile],
    challenge: null,
    sunny: null,
  };

  // `as string` because "disposal" is not a v2 phase kind at all.
  const midResolution =
    (migrated.phase.kind as string) === "disposal" || migrated.phase.kind === "sunnyPlay";
  if (midResolution) migrated.phase = { kind: "action" };
  return migrated;
};

const migrateRoom = (room: Room): Room => ({
  ...room,
  game: migrateGame(room.game as LegacyGameState | null),
});

export interface Persistence {
  /** Debounced; safe to call after every change. */
  save(): void;
  /** Flushes immediately, for shutdown. */
  flush(): void;
  stop(): void;
}

export const loadRooms = (dataDir: string, maxIdleMs: number): RoomStore => {
  const store = createStore();
  const file = path.join(dataDir, "rooms.json");
  if (!fs.existsSync(file)) return store;

  try {
    const snapshot = JSON.parse(fs.readFileSync(file, "utf8")) as Snapshot;
    if (snapshot.version !== SNAPSHOT_VERSION && snapshot.version !== 1) {
      // A shape we have no migration for is not a reason to serve corrupt
      // games. Start clean and say so; a room that half-works is worse.
      console.warn(
        `[persist] ignoring snapshot version ${snapshot.version}, expected ${SNAPSHOT_VERSION}`,
      );
      return store;
    }
    const stale = snapshot.version !== SNAPSHOT_VERSION;
    if (stale) {
      console.info(`[persist] migrating snapshot v${snapshot.version} to v${SNAPSHOT_VERSION}`);
    }
    for (const saved of snapshot.rooms) {
      const room = stale ? migrateRoom(saved) : saved;
      // Nobody is connected to a process that has only just started.
      for (const seat of room.seats) seat.connected = false;
      store.set(room.code, room);
    }
    pruneRooms(store, maxIdleMs);
    console.info(`[persist] restored ${store.size} room(s)`);
  } catch (error) {
    console.warn(`[persist] couldn't read the snapshot, starting empty:`, error);
  }
  return store;
};

export const startPersistence = (
  store: RoomStore,
  dataDir: string,
  debounceMs = 1000,
): Persistence => {
  const file = path.join(dataDir, "rooms.json");
  let timer: NodeJS.Timeout | null = null;

  const write = (): void => {
    const snapshot: Snapshot = {
      version: SNAPSHOT_VERSION,
      savedAt: Date.now(),
      rooms: [...store.values()],
    };
    const temp = `${file}.${process.pid}.tmp`;
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(temp, JSON.stringify(snapshot), "utf8");
      fs.renameSync(temp, file);
    } catch (error) {
      console.error("[persist] snapshot failed:", error);
      fs.rmSync(temp, { force: true });
    }
  };

  return {
    save() {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        write();
      }, debounceMs);
      timer.unref?.();
    },
    flush() {
      if (timer) clearTimeout(timer);
      timer = null;
      write();
    },
    stop() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
};
