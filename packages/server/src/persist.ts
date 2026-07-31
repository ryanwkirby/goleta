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

import type { Room, RoomStore } from "./rooms.ts";
import { createStore, pruneRooms } from "./rooms.ts";

const SNAPSHOT_VERSION = 1;

interface Snapshot {
  version: number;
  savedAt: number;
  rooms: Room[];
}

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
    if (snapshot.version !== SNAPSHOT_VERSION) {
      // A shape change is not a reason to serve corrupt games. Start clean and
      // say so; the alternative is a room that half-works.
      console.warn(
        `[persist] ignoring snapshot version ${snapshot.version}, expected ${SNAPSHOT_VERSION}`,
      );
      return store;
    }
    for (const room of snapshot.rooms) {
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
