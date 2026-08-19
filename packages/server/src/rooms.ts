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
  NAME_LIMIT,
  SUNNY_LOCKOUT_DRAWS,
  applyIntent,
  decideBotIntent,
  redact,
  rollSunnyCall,
  shuffle,
  startGame,
  topCard,
  type BotSpeed,
  type CardId,
  type DealerMode,
  type ErrorCode,
  type GameEvent,
  type GameOptions,
  type GameState,
  type GameView,
  type HouseRules,
  type Intent,
  type PlayerId,
  type RoomView,
} from "@goleta/engine";

import {
  newPlayerId,
  newRoomCode,
  newSeed,
  newToken,
  normaliseCode,
  randomIndex,
} from "./ids.ts";

export interface Seat {
  id: PlayerId;
  name: string;
  /** Secret. Proves a returning browser owns this seat; never broadcast. */
  token: string;
  bot: boolean;
  connected: boolean;
  /**
   * Whether this seat has its playable cards marked up (#187).
   *
   * The durable copy of the preference lives in the player's own
   * `localStorage`, because it follows them between rooms and there are no
   * accounts here. This is the room's copy, and it exists for one reason: the
   * rest of the table has to be able to see it. Presentation only — no rule,
   * no timer and no legality reads it, and `packages/engine` never learns it
   * exists.
   */
  hinted: boolean;
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
   * Whether this table is sitting in the same room, each holding their own
   * phone. Presentation and nothing else: no rule, no timer and no legality
   * reads it, which is why — unlike bot speed and the house rules below — it
   * can be changed with a game already running.
   */
  irl: boolean;
  /**
   * Whether the deal passes one seat along or is drawn at random (#198).
   *
   * Read once, at `beginGame`, exactly like the house rules below — so what a
   * host changes mid-game is always the next deal, and neither is frozen the
   * way `botSpeed` is. Not a house rule and not on `GameOptions`: `startGame`
   * takes a `dealerIndex` and has never cared how it was chosen.
   */
  dealerMode: DealerMode;
  /**
   * Whether the seats are shuffled at each deal (#199).
   *
   * Seat order is turn order, so this changes who follows whom — not cosmetic.
   * Read once at `beginGame` like `dealerMode` beside it, and independent of
   * it: that one changes who deals, this one changes the order they deal into.
   */
  shuffleSeats: boolean;
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

/** Enforced here because anything can arrive over a socket; agreed in the
 *  protocol so the field that stops you typing an eleventh cannot drift. */
const MAX_NAME_LENGTH = NAME_LIMIT;
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

/**
 * A refusal written to be shown to a player as-is.
 *
 * `code` is the exception: a machine-readable tag on the handful of refusals the
 * browser can offer a way out of, rather than leaving somebody on a form that
 * will keep failing. It is not an error taxonomy and shouldn't become one — the
 * sentence is still the message.
 */
export class RoomError extends Error {
  readonly code: ErrorCode | undefined;

  constructor(message: string, code?: ErrorCode) {
    super(message);
    this.code = code;
  }
}

// Explicitly annotated so TypeScript treats a bare `fail(...)` as terminating
// the branch and narrows what follows.
const fail: (message: string, code?: ErrorCode) => never = (message, code) => {
  throw new RoomError(message, code);
};

/** Names are shown to everyone at the table, so they get cleaned on the way in. */
export const cleanName = (raw: string): string => {
  const stripped = raw.replace(/[\p{Cc}\p{Cf}]/gu, "").trim();
  return stripped.slice(0, MAX_NAME_LENGTH) || "Player";
};

const touch = (room: Room): void => {
  room.updatedAt = Date.now();
};

export const seatOf = (room: Room, playerId: PlayerId): Seat | undefined =>
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
  // Off until the browser says otherwise. A seat's own preference lives in its
  // `localStorage` and is asserted on arrival, so a new seat starting bare is
  // the honest state rather than a guess at one.
  hinted: false,
});

export const createRoom = (store: RoomStore, name: string): { room: Room; seat: Seat } => {
  const seat = newSeatFor(cleanName(name), false);
  const room: Room = {
    code: newRoomCode((code) => store.has(code)),
    hostId: seat.id,
    seats: [seat],
    dealerId: null,
    botSpeed: "human",
    irl: false,
    // Off by default: a table that never opens the setting deals exactly as it
    // has always dealt.
    dealerMode: "rotate",
    // Off by default. A table that never opens the setting keeps whoever is on
    // its left on its left, exactly as it always has.
    shuffleSeats: false,
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
  store.get(normaliseCode(code)) ?? fail("No room with that code");

export const joinRoom = (
  store: RoomStore,
  code: string,
  name: string,
): { room: Room; seat: Seat } => {
  const room = findRoom(store, code);
  if (room.game && room.game.status === "playing") {
    // Tagged, because "watch instead" is a real offer the Join screen can make
    // and matching on the wording of this sentence to spot it would break the
    // next time somebody rewrites it.
    fail("That game is already under way — you can watch, or wait for the next one", "gameUnderWay");
  }
  if (room.seats.length >= MAX_TABLE_PLAYERS) fail("That room is full");

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
  if (!seat || seat.token !== token) fail("That seat isn't yours any more");

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
  if (room.hostId !== playerId) fail("Only the host can do that");
};

export const addBot = (room: Room, byPlayerId: PlayerId): void => {
  requireHost(room, byPlayerId);
  if (roomStatus(room) === "playing") fail("Wait for this game to finish");
  if (room.seats.length >= MAX_TABLE_PLAYERS) fail("That room is full");

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
  if (roomStatus(room) === "playing") fail("Wait for this game to finish");
  if (speed !== "human" && speed !== "lightning") fail("No such speed");

  room.botSpeed = speed;
  touch(room);
};

/**
 * Whether this table is all in one room, said by the host.
 *
 * The one host power with no "wait for this game to finish" on it, and
 * deliberately so. `setBotSpeed` and `setHouseRules` are frozen mid-game
 * because each of them reaches something live — a challenge window whose pace
 * somebody is already watching, or what is legal under a hand already dealt.
 * This reaches nothing: the engine never sees it, no timer reads it, and every
 * client that gets it does no more than draw the same game differently. A
 * table that gets three turns in and realises they are all sat together can
 * say so there and then.
 */
export const setIrl = (room: Room, byPlayerId: PlayerId, on: boolean): void => {
  requireHost(room, byPlayerId);
  if (typeof on !== "boolean") fail("IRL mode is on or off");

  room.irl = on;
  touch(room);
};

/**
 * Whether the deal rotates or is drawn at random, said by the host (#198).
 *
 * No "wait for this game to finish", and for `setHouseRules`'s reason rather
 * than `setBotSpeed`'s: this is read exactly once, at `beginGame`, so what a
 * host changes mid-hand is always the next deal and can never reach the one on
 * the table. Bot pace is read live, every time a bot is scheduled, which is why
 * that one stays frozen.
 */
export const setDealerMode = (room: Room, byPlayerId: PlayerId, mode: DealerMode): void => {
  requireHost(room, byPlayerId);
  if (mode !== "rotate" && mode !== "random") fail("No such dealer mode");

  room.dealerMode = mode;
  touch(room);
};

/**
 * Whether the seats are shuffled at each deal, said by the host (#199).
 *
 * Same shape and same argument as `setDealerMode` above: read once, at the
 * deal, so what a host changes mid-hand is always the next one. The two are
 * independent — that one changes who deals, this one changes who follows whom —
 * and with both on the shuffle largely subsumes the rotation, which reads
 * sensibly rather than needing them made exclusive.
 */
export const setShuffleSeats = (room: Room, byPlayerId: PlayerId, on: boolean): void => {
  requireHost(room, byPlayerId);
  if (typeof on !== "boolean") fail("Shuffled seats are on or off");

  room.shuffleSeats = on;
  touch(room);
};

/**
 * "Mark up my playable cards", said by the seat itself (#187).
 *
 * **Not a host power and not a rule.** It changes one screen and nothing about
 * the room, so there is no `requireHost` here and no "wait for this game to
 * finish" — the whole point of #187 is that it is a thing you decide rather
 * than a thing that expires, and mid-hand is exactly when somebody works out
 * they want it.
 *
 * Returns whether this turned the mark **on**, which is the only case the table
 * is told about out loud. Re-asserting a state the seat already had says
 * nothing, which is what makes a browser safe to sync on every reconnect; and
 * switching it off says nothing either, because giving up an advantage is not
 * something the table has to be told.
 */
export const setHints = (room: Room, byPlayerId: PlayerId, on: boolean): boolean => {
  if (typeof on !== "boolean") fail("Hints are on or off");
  const seat = room.seats.find((candidate) => candidate.id === byPlayerId);
  if (!seat) fail("You're not at this table");

  const announced = on && !seat.hinted;
  seat.hinted = on;
  touch(room);
  return announced;
};

/**
 * The table's house rules, set by the host — during a game as well as between
 * them, because what they choose is what the *next* deal plays.
 *
 * This used to be frozen mid-game alongside `setBotSpeed`, and the two are not
 * alike. Bot pace is read live, every time a bot is scheduled, so changing it
 * moves a challenge window somebody is already watching. House rules are read
 * exactly once, at `beginGame`, and the game keeps its own copy of them from
 * that moment on — so a hand already dealt cannot be reached from here, and the
 * freeze was buying nothing a host could see. A table that works out mid-hand
 * that they want the Sunny Rule off should be able to say so and have the next
 * deal honour it, which is what the settings cog behind the table is for (#134).
 *
 * The copy is what makes that true, so it is taken deliberately in `beginGame`
 * rather than relied on here. This function replaces `room.options` wholesale
 * and never mutates it in place; keep it that way.
 *
 * Every field is checked against its permitted values rather than trusted:
 * this arrives from a browser, and the engine's `GameOptions` also carries a
 * deck count and a hand size that a client has no business setting. Those are
 * taken from `DEFAULT_OPTIONS` here and can never be moved from outside.
 */
export const setHouseRules = (room: Room, byPlayerId: PlayerId, rules: HouseRules): void => {
  requireHost(room, byPlayerId);
  if (rules.eights !== "playerNames" && rules.eights !== "nextPlayerNames") {
    fail("No such rule for eights");
  }
  if (rules.seedEight !== "natural" && rules.seedEight !== "dealerNames") {
    fail("No such rule for the seed card");
  }
  if (typeof rules.sunny !== "boolean") fail("The Sunny Rule is on or off");

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

/**
 * Move a seat one place along the table order, which is also the turn order.
 *
 * Online that order is arbitrary and nobody has a reason to care. A table all
 * sitting in the same room has a physical order for it to disagree with, and a
 * game that deals across the table and back gets noticed three turns in, when
 * it is too late to fix — so the host can put the seats in the order the people
 * are actually in.
 *
 * `irl` is deliberately not checked. The order is real in every room; IRL is
 * only where anyone bothers, and which rooms are worth offering arrows in is a
 * judgement about presentation that belongs in the lobby. Gating the wire on a
 * flag the host can flip at any moment would hand somebody an error mid-shuffle
 * for changing an unrelated setting.
 */
export const moveSeat = (
  room: Room,
  byPlayerId: PlayerId,
  target: PlayerId,
  direction: "up" | "down",
): void => {
  requireHost(room, byPlayerId);
  if (roomStatus(room) === "playing") fail("Wait for this game to finish");
  if (direction !== "up" && direction !== "down") fail("A seat moves up or down");

  const from = room.seats.findIndex((seat) => seat.id === target);
  if (from === -1) fail("Nobody by that id is at this table");

  const to = direction === "up" ? from - 1 : from + 1;
  // Off either end is a no-op rather than a refusal: the arrow that would do it
  // is already disabled, so arriving here means the table moved under somebody's
  // thumb, and an error banner is a poor answer to a tap that changed nothing.
  const neighbour = room.seats[to];
  const moved = room.seats[from];
  if (!neighbour || !moved) return;

  room.seats[to] = moved;
  room.seats[from] = neighbour;
  touch(room);
};

export const removeSeat = (room: Room, byPlayerId: PlayerId, target: PlayerId): void => {
  requireHost(room, byPlayerId);
  if (roomStatus(room) === "playing") fail("Wait for this game to finish");
  if (target === room.hostId) fail("The host can't be removed");

  room.seats = room.seats.filter((seat) => seat.id !== target);
  touch(room);
};

/**
 * The seat that deals this round.
 *
 * **Rotating** is one along from whoever dealt last, so the lead moves around
 * the table, and the host deals the opening round. If the last dealer has since
 * left, `indexOf` gives -1 and the rotation starts over at the top of the
 * table — a small unfairness in exchange for not tracking a seat that no longer
 * exists.
 *
 * **Random** is exactly that (#198). It may land on the same seat twice
 * running, which is the honest answer for a random pick: a table that finds
 * that annoying is describing rotation, and rotation is the other setting.
 *
 * Neither reaches the engine. `startGame` takes an index and has never cared
 * how it was chosen; `docs/RULES.md` says dealing is all the dealer does.
 */
const nextDealerIndex = (room: Room): number => {
  if (room.dealerMode === "random") return randomIndex(room.seats.length);
  const seatIds = room.seats.map((seat) => seat.id);
  const previous = room.dealerId === null ? -1 : seatIds.indexOf(room.dealerId);
  return (previous + 1) % seatIds.length;
};

export const beginGame = (room: Room, byPlayerId: PlayerId): GameEvent[] => {
  requireHost(room, byPlayerId);
  if (roomStatus(room) === "playing") fail("That game is already under way");
  if (room.seats.length < MIN_TABLE_PLAYERS) {
    fail(`Goleta needs ${MIN_TABLE_PLAYERS} players — add a bot to make up the numbers`);
  }

  /**
   * The shuffle, before anything reads the order (#199).
   *
   * It goes first so the deal is passed *in the new order*: `nextDealerIndex`
   * looks the last dealer up by id, so the seat that dealt is still found after
   * the reshuffle and the deal moves one along from wherever they have landed.
   * That is what "the dealer is not lost across a shuffle" means — the person
   * is tracked, and only their neighbours change.
   *
   * `shuffle` is the engine's Fisher-Yates, run on a seed this process just
   * generated. The randomness is the server's; the engine's no-`Math.random()`
   * rule is untouched, and it never learns the order it is handed came out of
   * a hat.
   */
  const shuffled = room.shuffleSeats && room.seats.length > 1;
  if (shuffled) [room.seats] = shuffle(room.seats, newSeed());

  const dealerIndex = nextDealerIndex(room);
  room.dealerId = room.seats[dealerIndex]?.id ?? null;
  room.game = startGame(
    room.seats.map((seat) => seat.id),
    newSeed(),
    // The game's own copy, taken here and never shared. `startGame` keeps what
    // it is handed on the state, and the host may change the table's rules
    // while this game is running (#134) — the next deal is what those are for,
    // and this hand must not feel them. Nothing downstream should have to know
    // that `setHouseRules` happens to replace the object rather than edit it.
    { ...room.options },
    dealerIndex,
  );
  touch(room);
  return [{ type: "gameStarted", upcard: topCard(room.game), seatsShuffled: shuffled }];
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
  if (!game) return { ok: false, error: "No game is running", events: [] };
  if (!seatOf(room, playerId)) return { ok: false, error: "You aren't seated here", events: [] };

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

/**
 * `tableScreens` is passed in rather than read off the room, because the room
 * does not know: a shared screen is an open socket that said what it was, and
 * connections belong to `socket.ts`. Counting it there also means there is no
 * field to leave behind — nothing to clear on load, nothing to leak on a
 * dropped connection, and nothing that can disagree with the sockets that are
 * actually open. Defaults to none so the room tests can ask for a view without
 * inventing a connection count.
 */
export const roomView = (room: Room, tableScreens = 0): RoomView => ({
  code: room.code,
  hostId: room.hostId,
  seats: room.seats.map((seat) => ({
    id: seat.id,
    name: seat.name,
    bot: seat.bot,
    connected: seat.connected,
    isHost: seat.id === room.hostId,
    hinted: seat.hinted,
  })),
  status: roomStatus(room),
  gamesPlayed: room.gamesPlayed,
  minPlayers: MIN_TABLE_PLAYERS,
  maxPlayers: MAX_TABLE_PLAYERS,
  lastWinnerId: room.lastWinnerId,
  botSpeed: room.botSpeed,
  houseRules: houseRulesOf(room),
  irl: room.irl,
  dealerMode: room.dealerMode,
  shuffleSeats: room.shuffleSeats,
  tableScreens,
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
