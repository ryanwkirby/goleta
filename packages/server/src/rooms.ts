/**
 * Rooms: seats, host powers, and the one game a room is playing. Every intent is
 * stamped with the seat it came from before it reaches the engine, so a client
 * cannot act as anyone but itself.
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
  type TableEvent,
  type GameOptions,
  type GameState,
  type GameView,
  type AutopilotMode,
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
  /** Presentation only (#187). The durable copy lives in the player's own
   * `localStorage`; this one exists so the rest of the table can see it. */
  hinted: boolean;
  /**
   * Whether this seat is playing itself for a while (#202). Room state, so it
   * survives a snapshot and — the useful case — a phone going to sleep. Set only
   * from the seat's own connection, cleared by any intent from it and by the end
   * of a game.
   */
  autopilot: AutopilotMode;
  /** They said they were going (#256). Kept rather than deleted while a hand is
   * out, because a seat with cards in it cannot vanish — see `leaveSeat`. */
  left: boolean;
}

/**
 * The table's one decision about the call on offer, kept until the window shuts.
 * Bots roll once between them, and the schedule is recomputed several times
 * across a window — a fresh roll each time would walk the odds up to certainty.
 */
interface SunnyVerdict {
  drawerId: PlayerId;
  firstDrawnId: CardId | null;
  call: boolean;
}

interface CallHold {
  window: string;
  until: number;
  /** A closed hold is kept, still carrying its deadline: it is the record of this
   * player having had their go, and it is what makes reopening free. */
  open: boolean;
}

export interface Room {
  code: string;
  hostId: PlayerId;
  seats: Seat[];
  dealerId: PlayerId | null;
  /** Human by default: a bot that answers instantly leaves no room to notice a
   * Sunny call, let alone make one. */
  botSpeed: BotSpeed;
  /** Presentation only — no rule, timer or legality reads it, which is why it can
   * change mid-game and bot speed can't. */
  irl: boolean;
  /** Read once at `beginGame`, so a host always changes the next deal (#198). Not
   * on `GameOptions`: `startGame` never cared how `dealerIndex` was chosen. */
  dealerMode: DealerMode;
  /** Seat order is turn order, so this changes who follows whom. Read once at
   * `beginGame` like `dealerMode`, and independent of it (#199). */
  shuffleSeats: boolean;
  /** Held on the room rather than the game, so a table keeps its rules between
   * games and can change them while none is running. */
  options: GameOptions;
  /** One table, one thread of luck. */
  botSeed: number;
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
const BOT_NAMES = [
  "Robot",
  "Clockwork",
  "Tinny",
  "Gizmo",
  "Widget",
  "Sprocket",
  "Cogs",
  // Last, not gone: eight bots still need eight names, but the second bot at
  // every table was a word off a museum label (#247).
  "Automaton",
];

/** A refusal shown to a player as-is. `code` tags the handful the browser can
 * offer a way out of; it is not an error taxonomy and shouldn't become one. */
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

const newSeatFor = (name: string, bot: boolean): Seat => ({
  id: newPlayerId(),
  name,
  token: newToken(),
  bot,
  connected: !bot,
  // A seat's own preference lives in its `localStorage` and is asserted on arrival.
  hinted: false,
  autopilot: "off",
  left: false,
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
    // Off by default: a table that never opens the setting deals as it always has.
    dealerMode: "rotate",
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
    // Tagged, because "watch instead" is a real offer the Join screen can make and
    // matching on this sentence would break when somebody rewrites it.
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
  // A leave clears the token, so this refuses one on its own — the check is
  // spelled out because "they left" and "wrong token" are the same sentence to a
  // player and very different things here (#256).
  if (!seat || seat.left || seat.token !== token) fail("That seat isn't yours any more");

  seat.connected = true;
  // Somebody has to be able to start the next game, so a returning player takes
  // the room over if everyone else has wandered off.
  const otherHumanHere = room.seats.some((s) => s.id !== seat.id && !s.bot && s.connected);
  if (!otherHumanHere) room.hostId = seat.id;
  touch(room);
  return { room, seat };
};

/**
 * "I'm going" — as opposed to a socket dropping, which is `markDisconnected`
 * (#256).
 *
 * The server could not tell the two apart before this existed, because leaving
 * was entirely client-side: the browser forgot its token and reloaded, and all
 * the server ever saw was a close. So the turn reached a seat nobody would ever
 * move again, `waitingOn` stayed there forever, and the host could not deal
 * because a game was still "under way". The only way out was for everybody to
 * leave and make a new room.
 *
 * **Between games the seat simply goes.** It holds no cards, so there is nothing
 * to conserve.
 *
 * **Mid-hand it cannot go**, because `simulation.test.ts`'s first invariant is
 * that hands plus deck plus pile come to 52 — a seat with cards in it is not
 * deletable. So it stays, and **the autopilot plays it out** (#202): the cards
 * stay in play, turn order is untouched, the engine learns nothing, and the
 * table finishes the hand with exactly one winner. It is dropped at the next
 * deal, by `beginGame`.
 *
 * **It is not recoverable**, which is the difference that matters. A
 * disconnection has to be — a lock screen, a backgrounded tab and a dropped
 * tunnel are all one thing, and `seat.connected` is cleared on snapshot load for
 * exactly that reason. A leave is deliberate and the browser has already thrown
 * its token away by the time the socket closes, so the token is cleared here too
 * and `rejoinRoom` refuses.
 */
export const leaveSeat = (room: Room, playerId: PlayerId): TableEvent[] => {
  const seat = seatOf(room, playerId);
  if (!seat) return [];

  delete room.callHolds[playerId];
  if (roomStatus(room) === "playing") {
    seat.left = true;
    seat.connected = false;
    // A bot rather than forced-only: nobody is coming back to make the choices,
    // and a forced-only seat stalls on any real one.
    seat.autopilot = "bot";
    // Nothing to prove any more. `rejoinRoom` checks `left` as well.
    seat.token = "";
    passHostOn(room, playerId);
    touch(room);
    return [{ type: "left", playerId }];
  }

  room.seats = room.seats.filter((candidate) => candidate.id !== playerId);
  passHostOn(room, playerId);
  touch(room);
  return [{ type: "left", playerId }];
};

/** The host's powers, to the first human still here. Shared by leaving and by
 * dropping off, which want the same thing for the same reason: somebody has to
 * be able to start the next game. */
const passHostOn = (room: Room, playerId: PlayerId): void => {
  if (room.hostId !== playerId) return;
  const successor = room.seats.find((s) => !s.bot && !s.left && s.connected);
  if (successor) room.hostId = successor.id;
  else room.hostId = room.seats.find((s) => !s.bot && !s.left)?.id ?? room.hostId;
};

export const markDisconnected = (room: Room, playerId: PlayerId): void => {
  const seat = seatOf(room, playerId);
  if (!seat) return;
  seat.connected = false;
  delete room.callHolds[playerId];

  // The host's powers move on so the table isn't stranded mid-session.
  passHostOn(room, playerId);
  touch(room);
};

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

/** Between games only: changing the pace mid-hand would move a challenge window
 * somebody is already watching. */
export const setBotSpeed = (room: Room, byPlayerId: PlayerId, speed: BotSpeed): void => {
  requireHost(room, byPlayerId);
  if (roomStatus(room) === "playing") fail("Wait for this game to finish");
  if (speed !== "human" && speed !== "lightning") fail("No such speed");

  room.botSpeed = speed;
  touch(room);
};

/** The one host power with no "wait for this game to finish": bot speed and
 * house rules each reach something live, and this reaches nothing. */
export const setIrl = (room: Room, byPlayerId: PlayerId, on: boolean): void => {
  requireHost(room, byPlayerId);
  if (typeof on !== "boolean") fail("IRL mode is on or off");

  room.irl = on;
  touch(room);
};

/** Read once at `beginGame`, so a host always changes the next deal (#198). */
export const setDealerMode = (room: Room, byPlayerId: PlayerId, mode: DealerMode): void => {
  requireHost(room, byPlayerId);
  if (mode !== "rotate" && mode !== "random") fail("No such dealer mode");

  room.dealerMode = mode;
  touch(room);
};

/** Read once at the deal, like `setDealerMode` (#199), and independent of it. */
export const setShuffleSeats = (room: Room, byPlayerId: PlayerId, on: boolean): void => {
  requireHost(room, byPlayerId);
  if (typeof on !== "boolean") fail("Shuffled seats are on or off");

  room.shuffleSeats = on;
  touch(room);
};

/**
 * Not a host power and not a rule (#187): it changes one screen and nothing about
 * the room. Returns whether this turned the mark **on**, which is the only case
 * the table is told about — so a browser is safe to sync on every reconnect.
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

const AUTOPILOTS = new Set<AutopilotMode>(["off", "forced", "bot"]);

/**
 * Hand your own seat to the autopilot, or take it back (#202).
 *
 * **Yours alone.** `byPlayerId` comes off the connection the same way an intent
 * does, so there is no way to put somebody else on autopilot or to take them
 * off it — not from another player, and not from a shared screen, which holds no
 * `playerId` at all. A bot's seat is refused because it is already one.
 */
export const setAutopilot = (room: Room, byPlayerId: PlayerId, mode: AutopilotMode): void => {
  if (!AUTOPILOTS.has(mode)) fail("No such autopilot");
  const seat = room.seats.find((candidate) => candidate.id === byPlayerId);
  if (!seat) fail("You're not at this table");
  if (seat.bot) fail("That seat already plays itself");

  seat.autopilot = mode;
  touch(room);
};

/** Every seat's, at the end of a game. A new deal is a new hand, and coming back
 * to find you had been playing on autopilot for three games is not what anybody
 * asked for. */
const clearAutopilots = (room: Room): void => {
  for (const seat of room.seats) seat.autopilot = "off";
};

/**
 * Set by the host during a game as well as between them, because what they
 * choose is what the *next* deal plays: read once at `beginGame`, and the game
 * keeps its own copy (#134). This replaces `room.options` wholesale rather than
 * mutating it; keep it that way. Every field is checked rather than trusted.
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

export const houseRulesOf = (room: Room): HouseRules => ({
  eights: room.options.eights,
  seedEight: room.options.seedEight,
  sunny: room.options.sunny !== null,
});

/**
 * Move a seat one place along the table order, which is also the turn order.
 * `irl` is deliberately not checked: the order is real in every room, and gating
 * the wire on a flag the host can flip would error at somebody mid-shuffle.
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
  // Off either end is a no-op rather than a refusal: the arrow is already
  // disabled, so arriving here means the table moved under somebody's thumb.
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
 * **Rotating** is one along from the last dealer; if they have left, `indexOf`
 * gives -1 and it starts over at the top. **Random** may land on the same seat
 * twice running, which is the honest answer for a random pick (#198).
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
  // Anybody who left mid-hand was kept only so the autopilot could play their
  // cards out (#256). The hand is over; they are not at the table.
  room.seats = room.seats.filter((seat) => !seat.left);
  if (room.seats.length < MIN_TABLE_PLAYERS) {
    fail(`Goleta needs ${MIN_TABLE_PLAYERS} players — add a bot to make up the numbers`);
  }

  /**
   * The shuffle goes before anything reads the order (#199), so the deal is
   * passed *in the new order*: the last dealer is looked up by id, found
   * wherever they landed, and only their neighbours change.
   */
  const shuffled = room.shuffleSeats && room.seats.length > 1;
  if (shuffled) [room.seats] = shuffle(room.seats, newSeed());

  const dealerIndex = nextDealerIndex(room);
  room.dealerId = room.seats[dealerIndex]?.id ?? null;
  room.game = startGame(
    room.seats.map((seat) => seat.id),
    newSeed(),
    // The game's own copy: the host may change the table's rules while this game
    // runs (#134), and this hand must not feel it.
    { ...room.options },
    dealerIndex,
  );
  touch(room);
  return [{ type: "gameStarted", upcard: topCard(room.game), seatsShuffled: shuffled }];
};

export interface IntentOutcome {
  ok: boolean;
  error?: string;
  events: GameEvent[];
}

/** The seat id is stamped on here rather than trusted from the message. */
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
    clearAutopilots(room);
  }
  touch(room);
  return { ok: true, events: result.events };
};

/** A backstop, not a timer anybody is meant to meet: submitting, cancelling and
 * the window closing all lift the hold before this ever fires. */
export const CALL_HOLD_MS = 30_000;

/** Same identity `sunnyVerdict` uses: two reaches by the same player are one
 * window, somebody else's is a different one, and holds do not carry over. */
const challengeKey = (room: Room): string | null => {
  const challenge = room.game?.challenge ?? null;
  if (!challenge || challenge.resolved) return null;
  return `${challenge.drawerId}:${challenge.drawnIds[0] ?? ""}`;
};

/**
 * Opening the picker stops the bots, which is what makes three decisions (#50)
 * fit in a window paced for one tap. Unlike the grace period #56 deleted, this
 * hangs off something a person actually did.
 *
 * Only somebody who could really call may hold, and the deadline is set once per
 * window — otherwise reopening the picker is a stall button.
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
    // Kept, closed: that record is what stops a second opening buying a second
    // deadline.
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
 * When the bots may move again, or 0 if nothing is holding them. Prunes as it
 * goes. **Bots are all this stops** — a person's tap is never swallowed because
 * somebody else is thinking.
 */
export const callHeldUntil = (room: Room, now = Date.now()): number => {
  const window = challengeKey(room);
  let until = 0;
  for (const [playerId, hold] of Object.entries(room.callHolds)) {
    // A window that has shut is spent for good. One whose time is merely up stays:
    // closed or not, it is this player's go, already taken.
    if (hold.window !== window) {
      delete room.callHolds[playerId];
      continue;
    }
    if (hold.open && hold.until > now && hold.until > until) until = hold.until;
  }
  return until;
};

/**
 * Rolled once and held until the window shuts. The referee is what looks at
 * `challenge.violation` here, not a bot: the roll only asks whether a caught
 * player gets away with it, and each bot still sees only what `redact` gives it.
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
 * What an autopiloted seat is allowed to do, by mode.
 *
 * `bot` is the whole of `decideBotIntent`, which is the point: a bot at this
 * table plays your hand *well*, by the reversed logic, and reading one seat
 * ahead is not cheating (#107).
 *
 * `forced` is genuinely forced and nothing else — exactly one legal card, or
 * none and a draw. Everything that is a real choice waits for the player:
 *
 * - **naming a suit** is a choice, and under Power of Eights an important one;
 * - **the punishment card after a landed call** is a choice about which card to
 *   lose, which is the last thing to take on somebody's behalf — and the forced
 *   play in front of it is left with it, since stopping at step 2 of 3 would be
 *   the same stall one beat later;
 * - **calling the Sunny Rule** is never done in either mode. Bots do call, but a
 *   wrong call is a three-draw lockout, and taking that in somebody's name, out
 *   loud, at the table, is not the same kind of act as playing their forced
 *   card. The autopilot plays your hand; it does not make accusations for you.
 *
 * Ending a drawn-out turn *is* forced, and is taken (#260) — the branch is
 * reached only with no legal card, so it can never be the lie that control also
 * permits.
 *
 * A forced-only seat can still stall the table when it holds two legal cards.
 * That is inherent, the badge is what makes it visible, and the answer is that
 * somebody shouts through the door.
 *
 * **It cannot commit a Sunny violation the player did not choose**, in either
 * mode, and that is the single most important property here: `decideBotIntent`
 * plays whenever it can, so it never reaches for the deck holding a play. It
 * comes free.
 */
const autopilotIntent = (view: GameView, mode: AutopilotMode): Intent | null => {
  if (mode === "off") return null;
  if (mode === "bot") return decideBotIntent(view);

  if (view.you === null || view.waitingOn !== view.you) return null;
  if (view.phase.kind !== "action") return null;
  if (view.legalCardIds.length === 0) {
    // Drawn out and stuck, so the only lawful move left is to say so (#260). It
    // can never be a lie from here: this branch is reached with no legal card.
    return view.canEndTurn
      ? { type: "endTurn", playerId: view.you }
      : { type: "drawCard", playerId: view.you };
  }
  if (view.legalCardIds.length === 1) {
    return { type: "playCard", playerId: view.you, cardId: view.legalCardIds[0]! };
  }
  return null;
};

/** One at a time, so the caller can space them out and each move is decided
 * against the table as it stands. */
export const nextBotMove = (room: Room): { seat: Seat; intent: Intent } | null => {
  const game = room.game;
  if (!game || game.status !== "playing") return null;
  const bots = room.seats.filter((seat) => seat.bot);
  // A seat somebody has handed over for a while (#202). Moved here, with the
  // bots, because a browser-driven autopilot would be a phone in a pocket playing
  // cards — including while it is asleep, which is exactly when this is wanted.
  const auto = room.seats.filter((seat) => !seat.bot && seat.autopilot !== "off");
  if (bots.length === 0 && auto.length === 0) return null;

  // A call the table has agreed to make comes first: otherwise a bot earlier in
  // seat order would take its turn and shut the window on it. Bots only — an
  // autopilot never accuses.
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
  for (const seat of auto) {
    const intent = autopilotIntent(redact(game, seat.id), seat.autopilot);
    if (intent) return { seat, intent };
  }
  return null;
};

/**
 * `tableScreens` is passed in rather than read off the room: a shared screen is
 * an open socket that said what it was, and connections belong to `socket.ts`.
 * Counting it there leaves no field to clear on load and nothing that can
 * disagree with the sockets actually open.
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
    autopilot: seat.autopilot,
    left: seat.left,
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

export const pruneRooms = (store: RoomStore, maxIdleMs: number, now = Date.now()): number => {
  let removed = 0;
  for (const [code, room] of store) {
    if (now - room.updatedAt <= maxIdleMs) continue;
    store.delete(code);
    removed += 1;
  }
  return removed;
};
