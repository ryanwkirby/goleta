/**
 * Rooms: seats, host powers, and the one game that a room is playing.
 *
 * The server is the referee. Every intent that arrives from a browser is
 * stamped with the seat it actually came from before it reaches the engine, so
 * a client cannot act as anyone but itself.
 */

import {
  DEFAULT_OPTIONS,
  MAX_TABLE_PLAYERS,
  MIN_TABLE_PLAYERS,
  SUNNY_LOCKOUT_DRAWS,
  applyIntent,
  decideBotIntent,
  redact,
  rollSunnyCall,
  startGame,
  topCard,
  type BotSpeed,
  type CardId,
  type GameEvent,
  type GameOptions,
  type GameState,
  type GameView,
  type HouseRules,
  type Intent,
  type PlayerId,
  type RoomView,
} from "@goleta/engine";

import { newPlayerId, newRoomCode, newSeed, newToken, normaliseCode } from "./ids.ts";

export interface Seat {
  id: PlayerId;
  name: string;
  /** Secret. Proves a returning browser owns this seat; never broadcast. */
  token: string;
  bot: boolean;
  connected: boolean;
}

/**
 * The table's one decision about the Sunny call currently on offer, kept until
 * that window shuts.
 *
 * Bots roll for a violation once between them rather than once each — see
 * `SUNNY_CALL_CHANCE`. Remembering the answer is what makes that true: the bot
 * schedule is recomputed several times across a window that lasts seconds, and
 * a fresh roll each time would quietly walk the odds up to certainty.
 */
interface SunnyVerdict {
  drawerId: PlayerId;
  /** The first card of the window, which is what tells two windows apart. */
  firstDrawnId: CardId | null;
  call: boolean;
}

/** One player, part-way through naming a card. See `holdCall`. */
interface CallHold {
  /** The window it was taken out on, so it can't outlive it. */
  window: string;
  /** When the table stops waiting, whatever the picker is still showing. */
  until: number;
  /**
   * Whether the picker is open right now. A closed hold is kept rather than
   * dropped, still carrying the deadline it started with: it is the record of
   * this player having already had their go at this window, and it is what
   * makes reopening the picker free of any more time.
   */
  open: boolean;
}

export interface Room {
  code: string;
  hostId: PlayerId;
  seats: Seat[];
  /**
   * Who dealt the last round. Advances one seat per deal so the same player
   * doesn't lead every game; null until the room has dealt at all.
   */
  dealerId: PlayerId | null;
  /**
   * How fast this table's bots play. Human by default: a bot that answers
   * instantly is unpleasant to sit next to, and it leaves no room to notice a
   * Sunny call, let alone make one.
   */
  botSpeed: BotSpeed;
  /**
   * This table's house rules, chosen in the lobby and applied at the next deal.
   * Held on the room rather than read off the game so a table keeps its rules
   * between games — and so they can be changed while no game is running.
   */
  options: GameOptions;
  /** Seeds the table-wide rolls its bots make. One table, one thread of luck. */
  botSeed: number;
  /** Who currently has the table waiting on them to name a card, by player. */
  callHolds: Record<PlayerId, CallHold>;
  sunnyVerdict: SunnyVerdict | null;
  game: GameState | null;
  gamesPlayed: number;
  lastWinnerId: PlayerId | null;
  createdAt: number;
  updatedAt: number;
}

export type RoomStore = Map<string, Room>;

export const createStore = (): RoomStore => new Map();

const MAX_NAME_LENGTH = 16;
/** One per seat, so a table of eight bots has eight distinct names. */
const BOT_NAMES = [
  "Robot",
  "Automaton",
  "Clockwork",
  "Tinny",
  "Gizmo",
  "Widget",
  "Sprocket",
  "Cogs",
];

export class RoomError extends Error {}

// Explicitly annotated so TypeScript treats a bare `fail(...)` as terminating
// the branch and narrows what follows.
const fail: (message: string) => never = (message) => {
  throw new RoomError(message);
};

/** Names are shown to everyone at the table, so they get cleaned on the way in. */
export const cleanName = (raw: string): string => {
  const stripped = raw.replace(/[\p{Cc}\p{Cf}]/gu, "").trim();
  return stripped.slice(0, MAX_NAME_LENGTH) || "Player";
};

const touch = (room: Room): void => {
  room.updatedAt = Date.now();
};

const seatOf = (room: Room, playerId: PlayerId): Seat | undefined =>
  room.seats.find((seat) => seat.id === playerId);

export const roomStatus = (room: Room): RoomView["status"] => {
  if (!room.game) return "lobby";
  return room.game.status === "over" ? "finished" : "playing";
};

// ---------------------------------------------------------------------------
// Joining and leaving
// ---------------------------------------------------------------------------

const newSeatFor = (name: string, bot: boolean): Seat => ({
  id: newPlayerId(),
  name,
  token: newToken(),
  bot,
  connected: !bot,
});

export const createRoom = (store: RoomStore, name: string): { room: Room; seat: Seat } => {
  const seat = newSeatFor(cleanName(name), false);
  const room: Room = {
    code: newRoomCode((code) => store.has(code)),
    hostId: seat.id,
    seats: [seat],
    dealerId: null,
    botSpeed: "human",
    options: DEFAULT_OPTIONS,
    botSeed: newSeed(),
    callHolds: {},
    sunnyVerdict: null,
    game: null,
    gamesPlayed: 0,
    lastWinnerId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  store.set(room.code, room);
  return { room, seat };
};

export const findRoom = (store: RoomStore, code: string): Room =>
  store.get(normaliseCode(code)) ?? fail("no room with that code");

export const joinRoom = (
  store: RoomStore,
  code: string,
  name: string,
): { room: Room; seat: Seat } => {
  const room = findRoom(store, code);
  if (room.game && room.game.status === "playing") {
    fail("that game is already under way — you can watch, or wait for the next one");
  }
  if (room.seats.length >= MAX_TABLE_PLAYERS) fail("that room is full");

  const seat = newSeatFor(cleanName(name), false);
  room.seats.push(seat);
  touch(room);
  return { room, seat };
};

export const rejoinRoom = (
  store: RoomStore,
  code: string,
  playerId: PlayerId,
  token: string,
): { room: Room; seat: Seat } => {
  const room = findRoom(store, code);
  const seat = seatOf(room, playerId);
  if (!seat || seat.token !== token) fail("that seat isn't yours any more");

  seat.connected = true;
  // Somebody has to be able to start the next game. If everyone else has
  // wandered off, the returning player takes the room over.
  const otherHumanHere = room.seats.some((s) => s.id !== seat.id && !s.bot && s.connected);
  if (!otherHumanHere) room.hostId = seat.id;
  touch(room);
  return { room, seat };
};

export const markDisconnected = (room: Room, playerId: PlayerId): void => {
  const seat = seatOf(room, playerId);
  if (!seat) return;
  seat.connected = false;
  // Whatever they were part-way through deciding, they aren't there to finish
  // it, and the rest of the table shouldn't sit waiting on a closed tab.
  delete room.callHolds[playerId];

  // The host's powers move on so the table isn't stranded mid-session.
  if (room.hostId === playerId) {
    const successor = room.seats.find((s) => !s.bot && s.connected);
    if (successor) room.hostId = successor.id;
  }
  touch(room);
};

// ---------------------------------------------------------------------------
// Host powers
// ---------------------------------------------------------------------------

const requireHost = (room: Room, playerId: PlayerId): void => {
  if (room.hostId !== playerId) fail("only the host can do that");
};

export const addBot = (room: Room, byPlayerId: PlayerId): void => {
  requireHost(room, byPlayerId);
  if (roomStatus(room) === "playing") fail("wait for this game to finish");
  if (room.seats.length >= MAX_TABLE_PLAYERS) fail("that room is full");

  const taken = new Set(room.seats.map((s) => s.name));
  const name = BOT_NAMES.find((candidate) => !taken.has(candidate)) ?? "Bot";
  room.seats.push(newSeatFor(name, true));
  touch(room);
};

/**
 * Between games only. Changing the pace mid-hand would move a challenge window
 * that somebody is already watching, and there is nothing here worth that.
 */
export const setBotSpeed = (room: Room, byPlayerId: PlayerId, speed: BotSpeed): void => {
  requireHost(room, byPlayerId);
  if (roomStatus(room) === "playing") fail("wait for this game to finish");
  if (speed !== "human" && speed !== "lightning") fail("no such speed");

  room.botSpeed = speed;
  touch(room);
};

/**
 * The table's house rules, chosen by the host between games.
 *
 * Every field is checked against its permitted values rather than trusted:
 * this arrives from a browser, and the engine's `GameOptions` also carries a
 * deck count and a hand size that a client has no business setting. Those are
 * taken from `DEFAULT_OPTIONS` here and can never be moved from outside.
 */
export const setHouseRules = (room: Room, byPlayerId: PlayerId, rules: HouseRules): void => {
  requireHost(room, byPlayerId);
  if (roomStatus(room) === "playing") fail("wait for this game to finish");
  if (rules.eights !== "playerNames" && rules.eights !== "nextPlayerNames") {
    fail("no such rule for eights");
  }
  if (rules.seedEight !== "natural" && rules.seedEight !== "dealerNames") {
    fail("no such rule for the seed card");
  }
  if (typeof rules.sunny !== "boolean") fail("the Sunny Rule is on or off");

  room.options = {
    ...DEFAULT_OPTIONS,
    eights: rules.eights,
    seedEight: rules.seedEight,
    sunny: rules.sunny ? { lockoutDraws: SUNNY_LOCKOUT_DRAWS } : null,
  };
  touch(room);
};

/** The room's options as the lobby talks about them. */
export const houseRulesOf = (room: Room): HouseRules => ({
  eights: room.options.eights,
  seedEight: room.options.seedEight,
  sunny: room.options.sunny !== null,
});

export const removeSeat = (room: Room, byPlayerId: PlayerId, target: PlayerId): void => {
  requireHost(room, byPlayerId);
  if (roomStatus(room) === "playing") fail("wait for this game to finish");
  if (target === room.hostId) fail("the host can't be removed");

  room.seats = room.seats.filter((seat) => seat.id !== target);
  touch(room);
};

/**
 * The seat that deals this round: one along from whoever dealt last, so the
 * lead moves around the table. The host deals the opening round.
 *
 * If the last dealer has since left, `indexOf` gives -1 and the rotation starts
 * over at the top of the table. That's a small unfairness in exchange for not
 * tracking a seat that no longer exists.
 */
const nextDealerIndex = (room: Room): number => {
  const seatIds = room.seats.map((seat) => seat.id);
  const previous = room.dealerId === null ? -1 : seatIds.indexOf(room.dealerId);
  return (previous + 1) % seatIds.length;
};

export const beginGame = (room: Room, byPlayerId: PlayerId): GameEvent[] => {
  requireHost(room, byPlayerId);
  if (roomStatus(room) === "playing") fail("that game is already under way");
  if (room.seats.length < MIN_TABLE_PLAYERS) {
    fail(`goleta needs ${MIN_TABLE_PLAYERS} players — add a bot to make up the numbers`);
  }

  const dealerIndex = nextDealerIndex(room);
  room.dealerId = room.seats[dealerIndex]?.id ?? null;
  room.game = startGame(
    room.seats.map((seat) => seat.id),
    newSeed(),
    room.options,
    dealerIndex,
  );
  touch(room);
  return [{ type: "gameStarted", upcard: topCard(room.game) }];
};

// ---------------------------------------------------------------------------
// Playing
// ---------------------------------------------------------------------------

export interface IntentOutcome {
  ok: boolean;
  error?: string;
  events: GameEvent[];
}

/**
 * Applies an intent on behalf of one seat. The seat id is stamped onto the
 * intent here rather than trusted from the message, so a client can only ever
 * act as itself.
 */
export const applySeatIntent = (
  room: Room,
  playerId: PlayerId,
  intent: Intent,
): IntentOutcome => {
  const game = room.game;
  if (!game) return { ok: false, error: "no game is running", events: [] };
  if (!seatOf(room, playerId)) return { ok: false, error: "you aren't seated here", events: [] };

  const result = applyIntent(game, { ...intent, playerId });
  if (!result.ok) return { ok: false, error: result.error, events: [] };

  room.game = result.state;
  if (result.state.status === "over" && game.status !== "over") {
    room.gamesPlayed += 1;
    room.lastWinnerId = result.state.winnerId;
  }
  touch(room);
  return { ok: true, events: result.events };
};

/**
 * How long the table will wait on one player composing a Sunny call.
 *
 * A backstop, not a timer anybody is meant to meet: submitting, cancelling and
 * the window closing all lift the hold at once, and this only ever fires for a
 * picker nobody is behind any more. Long enough that reading a hand of eight
 * against the card in play — the whole judgement #50 moved onto the player —
 * never gets cut off, short enough that a tab that died with it open doesn't
 * strand everyone else.
 */
export const CALL_HOLD_MS = 30_000;

/**
 * The challenge window a hold belongs to, or null when there is nothing to
 * call at all.
 *
 * Same identity `sunnyVerdict` uses: a drawer and the first card of the
 * window. Two reaches by the same player are one window; somebody else's reach
 * is a different one, and holds do not carry across.
 */
const challengeKey = (room: Room): string | null => {
  const challenge = room.game?.challenge ?? null;
  if (!challenge || challenge.resolved) return null;
  return `${challenge.drawerId}:${challenge.drawnIds[0] ?? ""}`;
};

/**
 * A player has opened, or closed, the picker for naming a card.
 *
 * Since #50 a call is three decisions — spot the reach, read the hand they
 * reached from, pick the card you say they should have played — and the bots'
 * turn rhythm has no room in it for that. So opening the picker stops them.
 * What makes this different from the grace period #56 deleted is that it hangs
 * off something a person actually did, rather than bots idling on every draw
 * against the possibility that somebody might.
 *
 * Only somebody who could really make the call may hold: not the drawer, not a
 * spectator, and not a caller serving a lockout. The deadline is set once per
 * window, so reopening the picker buys no more time than opening it did —
 * otherwise it is a stall button, and one that only the player with a reason
 * to stall can reach.
 */
export const holdCall = (
  room: Room,
  playerId: PlayerId,
  open: boolean,
  now = Date.now(),
): void => {
  const window = challengeKey(room);
  const held = room.callHolds[playerId];

  if (!open) {
    // Kept, closed, if it belongs to the window still standing — that record is
    // what stops a second opening buying a second deadline.
    if (held && held.window === window) held.open = false;
    else delete room.callHolds[playerId];
    return;
  }

  if (window === null) return;
  const view = gameViewFor(room, playerId);
  if (!view?.sunnyCallable || view.sunnyLockedDraws > 0) return;
  if (held?.window === window) {
    held.open = true;
    return;
  }
  room.callHolds[playerId] = { window, until: now + CALL_HOLD_MS, open: true };
};

/**
 * When the bots may move again, or 0 if nothing is holding them.
 *
 * Prunes as it goes: a hold whose window has shut, or whose time is up, is
 * gone rather than merely ignored.
 *
 * **Bots are all this stops.** A person taking their turn is a person playing
 * the game, and their tap has no business being swallowed because somebody
 * else is thinking. If a human does close the window while you are choosing,
 * the picker goes with it — which is also what happens leaning over a real
 * table, and is already handled at the screen.
 */
export const callHeldUntil = (room: Room, now = Date.now()): number => {
  const window = challengeKey(room);
  let until = 0;
  for (const [playerId, hold] of Object.entries(room.callHolds)) {
    // A record from a window that has shut is spent for good, so it goes. One
    // whose time is merely up stays — closed or not, it is this player's go at
    // this window, already taken.
    if (hold.window !== window) {
      delete room.callHolds[playerId];
      continue;
    }
    if (hold.open && hold.until > now && hold.until > until) until = hold.until;
  }
  return until;
};

/**
 * Whether the bots at this table have agreed to call the violation standing
 * right now. Rolled once, the first time there is something to decide, and held
 * until that window shuts.
 *
 * The referee is the one looking at `challenge.violation` here, not a bot: the
 * roll only asks whether a caught player gets away with it. What each bot may
 * *see* is still whatever `redact` gives it, and that is where the decision to
 * accuse is actually made.
 */
const tableCallsSunny = (room: Room): boolean => {
  const challenge = room.game?.challenge ?? null;
  if (!challenge || challenge.resolved || challenge.violation === null) {
    room.sunnyVerdict = null;
    return false;
  }

  const firstDrawnId = challenge.drawnIds[0] ?? null;
  const held = room.sunnyVerdict;
  if (held && held.drawerId === challenge.drawerId && held.firstDrawnId === firstDrawnId) {
    return held.call;
  }

  const [call, seed] = rollSunnyCall(room.botSeed);
  room.botSeed = seed;
  room.sunnyVerdict = { drawerId: challenge.drawerId, firstDrawnId, call };
  return call;
};

/**
 * The next move a bot wants to make, if any. Returns one at a time so the
 * caller can space them out, and so each move is decided against the table as
 * it stands rather than against a plan made several moves ago.
 */
export const nextBotMove = (room: Room): { seat: Seat; intent: Intent } | null => {
  const game = room.game;
  if (!game || game.status !== "playing") return null;
  const bots = room.seats.filter((seat) => seat.bot);
  if (bots.length === 0) return null;

  // A call the table has agreed to make comes before anything else. Otherwise a
  // bot on the clock and earlier in seat order would take its ordinary turn and
  // shut the window on a call that was already decided.
  if (tableCallsSunny(room)) {
    for (const seat of bots) {
      const intent = decideBotIntent(redact(game, seat.id), { callSunny: true });
      if (intent?.type === "callSunny") return { seat, intent };
    }
  }

  for (const seat of bots) {
    const intent = decideBotIntent(redact(game, seat.id));
    if (intent) return { seat, intent };
  }
  return null;
};

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export const roomView = (room: Room): RoomView => ({
  code: room.code,
  hostId: room.hostId,
  seats: room.seats.map((seat) => ({
    id: seat.id,
    name: seat.name,
    bot: seat.bot,
    connected: seat.connected,
    isHost: seat.id === room.hostId,
  })),
  status: roomStatus(room),
  gamesPlayed: room.gamesPlayed,
  minPlayers: MIN_TABLE_PLAYERS,
  maxPlayers: MAX_TABLE_PLAYERS,
  lastWinnerId: room.lastWinnerId,
  botSpeed: room.botSpeed,
  houseRules: houseRulesOf(room),
});

export const gameViewFor = (room: Room, viewerId: PlayerId | null): GameView | null =>
  room.game ? redact(room.game, viewerId) : null;

// ---------------------------------------------------------------------------
// Housekeeping
// ---------------------------------------------------------------------------

export const pruneRooms = (store: RoomStore, maxIdleMs: number, now = Date.now()): number => {
  let removed = 0;
  for (const [code, room] of store) {
    if (now - room.updatedAt <= maxIdleMs) continue;
    store.delete(code);
    removed += 1;
  }
  return removed;
};
