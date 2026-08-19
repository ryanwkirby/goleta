/**
 * The wire contract between the browser and the server.
 *
 * It lives in the engine package because that is the one package both sides
 * already depend on — not because it's part of the rules. Nothing here may
 * import from `rules.ts`; these are shapes, not behaviour.
 *
 * See `docs/PROTOCOL.md` for the conversation these messages make up.
 */

import type { GameView } from "./redact.ts";
import type { EightsRule, GameEvent, Intent, PlayerId, SeedEightRule, Suit } from "./types.ts";

/**
 * The house rules a table may actually choose, which is deliberately a smaller
 * thing than `GameOptions`.
 *
 * The engine's options also carry `deckCount` and `startingHandSize`, and those
 * are not on offer: they come from a client, and a hand size of 900 or a deck
 * count of a million is a denial of service rather than a house rule. The
 * server maps this onto a full `GameOptions` itself, so the only values that
 * can ever reach the engine are ones named here.
 *
 * `sunny` is a plain boolean this pass — the rule is on or it is off. When the
 * resolution itself becomes configurable this is where that would widen.
 */
export interface HouseRules {
  eights: EightsRule;
  seedEight: SeedEightRule;
  sunny: boolean;
}

export interface SeatView {
  id: PlayerId;
  name: string;
  bot: boolean;
  connected: boolean;
  isHost: boolean;
  /**
   * Whether this seat is playing with its playable cards marked up (#187).
   *
   * **Presentation, never a rule.** `packages/engine` does not learn it exists;
   * it sits here beside `connected` for the same reason `irl` sits on
   * `RoomView` — every hand is already face up, and nothing about this changes
   * what is legal.
   *
   * It goes to the whole table on purpose, and that is the entire bargain of
   * #33: help is always available and taking it is never quiet. A silent,
   * permanent toggle would let one player stop being catchable without anybody
   * else being able to tell — which is the Sunny Rule quietly switched off for
   * one seat. Switching it **on** is also announced as a shout; switching it
   * off is not, because giving up an advantage is nobody else's business.
   */
  hinted: boolean;
}

/**
 * How fast the bots play. A table setting rather than a personal one: bots are
 * timed on the server, so everyone watches the same pace.
 */
export type BotSpeed = "human" | "lightning";

/**
 * Something a seat says out loud to the whole table.
 *
 * `help` is one turn's worth, asked for and gone. `hints` is a standing state
 * being switched on — announced once, and then visible on the seat for as long
 * as it lasts (`SeatView.hinted`). There is deliberately no shout for switching
 * them off: taking an advantage is public, giving one up is not.
 */
export type ShoutKind = "help" | "hints";

/**
 * How a table picks who deals (#198).
 *
 * Not a house rule and not on `GameOptions`: `startGame` takes a `dealerIndex`
 * and knows nothing about how it was chosen, rotation is a `rooms.ts`
 * convention rather than a rule of the game, and `docs/RULES.md` says dealing
 * is all the dealer does. So it sits beside `irl` and `botSpeed` as a property
 * of the room, and `packages/engine` never learns it exists.
 *
 * What the dealer actually decides is two real things: who opens, since the
 * player to the dealer's left goes first and going first is not nothing in a
 * game where playing is compulsory; and the seeded 8 under Dealer's Choice.
 */
export type DealerMode = "rotate" | "random";

export interface RoomView {
  code: string;
  hostId: PlayerId;
  seats: SeatView[];
  status: "lobby" | "playing" | "finished";
  gamesPlayed: number;
  minPlayers: number;
  maxPlayers: number;
  lastWinnerId: PlayerId | null;
  botSpeed: BotSpeed;
  /** What this table is playing. Applies at the next deal, not to a live game. */
  houseRules: HouseRules;
  /**
   * "We are all sitting in the same room." Presentation, not a rule: it changes
   * how a phone draws the table and nothing about what is legal, so it lives
   * here beside `botSpeed` rather than on `HouseRules`, and `packages/engine`
   * never learns it exists.
   */
  irl: boolean;
  /**
   * Whether the deal passes one seat along or is picked at random (#198).
   *
   * Read once, at `beginGame`, so it describes the *next* deal and can never
   * reach a hand already out — the same shape as `houseRules` beside it, and
   * the reason neither is frozen mid-game the way `botSpeed` is. It goes to the
   * whole table rather than to the host alone: who deals is not a secret.
   */
  dealerMode: DealerMode;
  /**
   * Whether the seats are shuffled at each deal (#199).
   *
   * Seat order is turn order, everywhere and always, so this is not cosmetic:
   * it changes who follows whom, which is the whole point. It sits beside
   * `dealerMode` and for the same reasons — a room setting rather than a house
   * rule, read once at `beginGame`, and `packages/engine` never learns it
   * exists, having been handed a list of seat ids it has never cared about the
   * order of.
   *
   * The two are independent: that one changes who deals, this one changes who
   * follows whom. With both on the shuffle largely subsumes the rotation, and
   * that reads sensibly rather than needing them made exclusive.
   */
  shuffleSeats: boolean;
  /**
   * How many shared table screens are connected to this room right now (#138).
   *
   * A count rather than a list, because there is nothing to list: a shared
   * screen holds no seat, no name and no identity, and never will — it is a
   * device somebody propped in the middle of a table. The lobby draws a row per
   * screen off this number, so one arriving is a row appearing.
   *
   * **Connection state, not room state.** It is counted off the open sockets
   * every time a view is built and never stored on the room, so it cannot go
   * stale, cannot be persisted, and comes back as zero after a restart — which
   * is the truth, since a restarted process has nobody connected to it.
   *
   * Nothing may start *depending* on this being non-zero: the phone view still
   * carries its own peek strip, and a table with no shared screen plays exactly
   * the game it played before.
   */
  tableScreens: number;
}

export type ClientMessage =
  | { t: "create"; name: string }
  | { t: "join"; code: string; name: string }
  /** Reclaim a seat after a reload, a dropped connection or a redeploy. */
  | { t: "rejoin"; code: string; playerId: PlayerId; token: string }
  /** A screen that shows the table and holds no cards. */
  | { t: "watch"; code: string; table?: boolean }
  | { t: "intent"; intent: Intent }
  | { t: "start" }
  | { t: "addBot" }
  | { t: "removeSeat"; playerId: PlayerId }
  /**
   * Host only, between games: move a seat one place along the table order.
   *
   * One place at a time rather than a whole `order: PlayerId[]`, because an
   * order posted from a browser can arrive after a seat has left, and a stale
   * permutation is a worse thing to reconcile than a swap that no longer
   * applies. Seat order is turn order everywhere; it is only a table sitting in
   * one room that has a physical order for it to disagree with.
   */
  | { t: "moveSeat"; playerId: PlayerId; direction: "up" | "down" }
  /** Host only, between games: how fast the bots at this table play. */
  | { t: "setBotSpeed"; speed: BotSpeed }
  /**
   * Host only, at any time: whether this table is sitting in the same room.
   *
   * Unlike bot speed and house rules it is *not* frozen mid-game. Those two are
   * frozen because changing them moves a challenge window somebody may be
   * watching, or changes what is legal under a live hand. Neither applies to a
   * flag no timer and no rule reads: a table three turns in that realises they
   * are all sat together should be able to say so there and then.
   */
  | { t: "setIrl"; on: boolean }
  /**
   * Host only, at any time: which rules this table plays by.
   *
   * Not frozen mid-game, unlike `setBotSpeed` beside it. These are read once,
   * at the deal, and the game keeps its own copy — so they describe the *next*
   * game and can never reach a hand already dealt. Bot pace is read live and
   * stays frozen for exactly that reason.
   */
  | { t: "setHouseRules"; rules: HouseRules }
  /**
   * Host only, at any time: whether the deal rotates or is drawn at random.
   *
   * Unfrozen for the same reason as `setHouseRules` and not for the reason
   * `setBotSpeed` is frozen: it is read once, at the deal, so what a host
   * changes mid-game is always the next one. Deliberately its own message
   * rather than a fourth field on `HouseRules`, which carries the three
   * written alternates from the original rules and nothing else.
   */
  | { t: "setDealerMode"; mode: DealerMode }
  /**
   * Host only, at any time: whether the seats are shuffled at each deal.
   *
   * Same argument as `setDealerMode` beside it — read once, at the deal, so
   * what a host changes mid-game is always the next one.
   */
  | { t: "setShuffleSeats"; on: boolean }
  /**
   * "I've opened the picker to name a card", and then "I'm done with it".
   *
   * Holds the bots while a call is being composed, so the window can't shut
   * under somebody part-way through deciding. Nothing about it is broadcast:
   * that a player is considering a call is not something the rest of the table
   * gets told. See `holdCall`.
   */
  | { t: "composingCall"; open: boolean }
  /** "I'm stuck." Turns your own highlights back on, and tells the table. */
  | { t: "help" }
  /**
   * "Mark up my playable cards", and then "stop".
   *
   * Yours alone to send, host or not — it changes your own screen and nothing
   * about the room. The seat carries the answer so the rest of the table can
   * see it, and turning it *on* is announced; see `SeatView.hinted`.
   */
  | { t: "setHints"; on: boolean }
  | { t: "ping" };

export type ServerMessage =
  /** Identity for this browser. The token is stored and never broadcast. */
  | { t: "welcome"; code: string; playerId: PlayerId | null; token: string | null }
  | { t: "state"; room: RoomView; game: GameView | null; events: GameEvent[] }
  /**
   * Somebody said something out loud. Not a game event: nothing about the
   * position changes, it isn't replayed, and it isn't in the log — it happens
   * and it's gone, like speaking.
   */
  | { t: "shout"; playerId: PlayerId; kind: ShoutKind }
  | { t: "error"; message: string; code?: ErrorCode; kind?: ErrorKind }
  | { t: "pong" };

/**
 * A refusal the client has something better to offer for than the sentence.
 *
 * Only one so far, and the bar for another is that reading the prose would
 * otherwise be the only way to tell: a table that scans a QR mid-hand can be
 * sent to watch instead of being left on a form that will keep failing, and
 * matching on the wording of an error to work that out is the sort of thing
 * that breaks the next time somebody rewrites a sentence.
 */
export type ErrorCode = "gameUnderWay";

/**
 * How long a refusal is worth looking at, which is the only thing the client
 * does differently with them.
 *
 * A `move` is a mis-tap — a card that doesn't match, a turn that isn't yours.
 * The hand it was aimed at already says so by not changing, so the words are a
 * confirmation and they go away on their own. Everything else is a `session`:
 * the room is full, the seat isn't yours, the game is already under way. Those
 * are read, thought about and acted on, so they sit there until they're
 * dismissed.
 *
 * Not an `ErrorCode`. A code says *which* refusal this is and exists so the
 * client can offer a way out of it; this says how heavy the news is, and every
 * refusal has an answer.
 */
export type ErrorKind = "move" | "session";

/** Suit names for UI copy, kept next to the protocol so both sides agree. */
export type SuitKey = Suit;

/**
 * How long a name may be, and the reason it is here rather than on the server.
 *
 * Ten characters is a **layout** number: it is what every surface that draws a
 * name can show whole, and the narrowest of those is the seat strip on a phone
 * with eight seats in it. The server is what enforces it — `cleanName` slices
 * to it, because anything can arrive over a socket — but the field that stops
 * you typing an eleventh has to agree, and a cap enforced in one package and
 * typed in another is a cap that drifts.
 *
 * It used to be sixteen, and nothing could draw sixteen: the shared table
 * screen clipped at eight or nine, so the app asked for names it had already
 * decided not to show (#161). An ellipsis is the app admitting that.
 */
export const NAME_LIMIT = 10;
