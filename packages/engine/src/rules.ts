/**
 * The rules of goleta. `docs/RULES.md` is the canonical statement of them; this
 * file is the implementation, and the two are expected to agree line for line.
 *
 * Everything here is pure: `applyIntent` clones the state, mutates the clone
 * through small helpers, and hands it back. Randomness comes only from the seed
 * carried in the state.
 */

import { isPlayable, isWild, shuffleDeck, buildDeck } from "./cards.ts";
import { shuffle } from "./rng.ts";
import {
  DEFAULT_OPTIONS,
  MAX_DRAWS_PER_TURN,
  SUITS,
  type ApplyResult,
  type Card,
  type GameEvent,
  type GameOptions,
  type GameState,
  type Intent,
  type PlayerId,
  type PlayerState,
} from "./types.ts";

/** A real table is 3 to 6. The engine allows 2 so tests can stay small. */
export const MIN_TABLE_PLAYERS = 3;
export const MAX_TABLE_PLAYERS = 6;

export const currentPlayer = (state: GameState): PlayerState => {
  const player = state.players[state.turnIndex];
  if (!player) throw new Error(`no player at seat ${state.turnIndex}`);
  return player;
};

export const topCard = (state: GameState): Card => {
  const card = state.discardPile[state.discardPile.length - 1];
  if (!card) throw new Error("the discard pile is empty");
  return card;
};

export const playerById = (state: GameState, id: PlayerId): PlayerState | undefined =>
  state.players.find((p) => p.id === id);

/** The cards this player is allowed to play right now. */
export const legalCards = (state: GameState, player: PlayerState): Card[] => {
  const top = topCard(state);
  return player.hand.filter((card) => isPlayable(card, state.activeSuit, top.rank));
};

/**
 * Whether this player is currently forbidden from drawing. Named for what it
 * means at the table: if you can play, you must, so drawing is a violation.
 *
 * The UI uses this for the player's *own* hand only. Never call it on someone
 * else's hand to decide whether to offer a Sunny call — that hands the player
 * the answer and deletes the mechanic.
 */
export const mustPlay = (state: GameState, player: PlayerState): boolean =>
  legalCards(state, player).length > 0;

export const activePlayers = (state: GameState): PlayerState[] =>
  state.players.filter((p) => !p.eliminated);

// ---------------------------------------------------------------------------
// Setting up
// ---------------------------------------------------------------------------

export const startGame = (
  playerIds: readonly PlayerId[],
  seed: number,
  options: GameOptions = DEFAULT_OPTIONS,
): GameState => {
  if (playerIds.length < 2) throw new Error("a game needs at least two players");
  if (playerIds.length > MAX_TABLE_PLAYERS) {
    throw new Error(`a game seats at most ${MAX_TABLE_PLAYERS} players`);
  }
  if (new Set(playerIds).size !== playerIds.length) {
    throw new Error("player ids must be unique");
  }

  const [drawPile, seedAfterShuffle] = shuffleDeck(buildDeck(options.deckCount), seed);
  const needed = playerIds.length * options.startingHandSize + 1;
  if (drawPile.length < needed) {
    throw new Error(`${playerIds.length} hands of ${options.startingHandSize} won't fit in the deck`);
  }

  const players: PlayerState[] = playerIds.map((id) => ({
    id,
    hand: drawPile.splice(-options.startingHandSize),
    eliminated: false,
  }));

  // An 8 can't start the game — it would be a wild with nobody to name a suit.
  // Bury it at the bottom of the pile and turn the next one up.
  let upcard = drawPile.pop();
  while (upcard && isWild(upcard)) {
    drawPile.unshift(upcard);
    upcard = drawPile.pop();
  }
  if (!upcard) throw new Error("no non-wild card to start the discard pile");

  return {
    options,
    players,
    turnIndex: 0,
    drawPile,
    discardPile: [upcard],
    disposalPile: [],
    activeSuit: upcard.suit,
    phase: { kind: "action" },
    challenge: null,
    drawsThisTurn: 0,
    rngSeed: seedAfterShuffle,
    status: "playing",
    winnerId: null,
    turnNumber: 1,
  };
};

// ---------------------------------------------------------------------------
// Applying intents
// ---------------------------------------------------------------------------

export const applyIntent = (state: GameState, intent: Intent): ApplyResult => {
  const next = structuredClone(state);
  const events: GameEvent[] = [];
  const error = route(next, intent, events);
  if (error !== null) return { ok: false, error };
  return { ok: true, state: next, events };
};

const route = (s: GameState, intent: Intent, events: GameEvent[]): string | null => {
  if (s.status === "over") return "the game is over";
  switch (intent.type) {
    case "playCard":
      return handlePlay(s, intent.playerId, intent.cardId, events);
    case "drawCard":
      return handleDraw(s, intent.playerId, events);
    case "chooseSuit":
      return handleChooseSuit(s, intent.playerId, intent.suit, events);
    case "callSunny":
      return handleCallSunny(s, intent.playerId, events);
    case "disposeCard":
      return handleDispose(s, intent.playerId, intent.cardId, events);
  }
};

/**
 * The challenge window closes the moment the *next* player commits an action.
 * The drawer's own follow-up actions leave it open — otherwise a player could
 * draw illegally, play instantly, and be immune before anyone could speak.
 */
const closeWindowIfSomeoneElseActs = (s: GameState, actorId: PlayerId): void => {
  if (s.challenge && s.challenge.drawerId !== actorId) s.challenge = null;
};

const handlePlay = (
  s: GameState,
  playerId: PlayerId,
  cardId: string,
  events: GameEvent[],
): string | null => {
  closeWindowIfSomeoneElseActs(s, playerId);

  if (s.phase.kind !== "action" && s.phase.kind !== "sunnyPlay") {
    return "you can't play a card right now";
  }
  const player = currentPlayer(s);
  if (player.id !== playerId) return "it isn't your turn";

  const index = player.hand.findIndex((c) => c.id === cardId);
  if (index === -1) return "that card isn't in your hand";
  const card = player.hand[index] as Card;
  if (!isPlayable(card, s.activeSuit, topCard(s).rank)) {
    return "that card doesn't match the discard";
  }

  player.hand.splice(index, 1);
  s.discardPile.push(card);
  if (!isWild(card)) s.activeSuit = card.suit;
  events.push({ type: "played", playerId: player.id, card });

  eliminateIfEmpty(s, player, events);
  if (finishIfOver(s, events)) return null;

  // Playing your last card as an 8 still gets you the suit call on the way out.
  if (isWild(card)) {
    s.phase = { kind: "suit" };
    return null;
  }
  advanceTurn(s, events);
  return null;
};

const handleDraw = (s: GameState, playerId: PlayerId, events: GameEvent[]): string | null => {
  closeWindowIfSomeoneElseActs(s, playerId);

  if (s.phase.kind !== "action") return "you can't draw right now";
  const player = currentPlayer(s);
  if (player.id !== playerId) return "it isn't your turn";
  if (s.drawsThisTurn >= MAX_DRAWS_PER_TURN) return "you've already drawn three cards";

  // Drawing while holding a playable card breaks the rules, and the engine
  // deliberately allows it: that violation is the Sunny Rule's entire subject.
  // What it does instead is remember, so a call can be judged.
  const inViolation = mustPlay(s, player);
  const alreadyCaught = s.challenge?.drawerId === player.id && s.challenge.violation !== null;
  const snapshot = inViolation && !alreadyCaught ? structuredClone(s) : null;

  if (!refillDrawPile(s, events)) {
    // Every card is in somebody's hand. There is nothing to draw, so the turn
    // simply ends.
    advanceTurn(s, events);
    return null;
  }

  const card = s.drawPile.pop() as Card;
  player.hand.push(card);
  s.drawsThisTurn += 1;
  events.push({ type: "drew", playerId: player.id, card });
  recordDraw(s, player.id, card, inViolation, snapshot);

  const stillStuck = !mustPlay(s, player);
  if (stillStuck && (s.drawsThisTurn >= MAX_DRAWS_PER_TURN || !canRefill(s))) {
    advanceTurn(s, events);
  }
  return null;
};

const handleChooseSuit = (
  s: GameState,
  playerId: PlayerId,
  suit: string,
  events: GameEvent[],
): string | null => {
  if (s.phase.kind !== "suit") return "there's no suit to name";
  const player = currentPlayer(s);
  if (player.id !== playerId) return "it isn't your call";
  const chosen = SUITS.find((candidate) => candidate === suit);
  if (!chosen) return "that isn't a suit";

  s.activeSuit = chosen;
  events.push({ type: "suitChosen", playerId: player.id, suit: chosen });
  advanceTurn(s, events);
  return null;
};

const handleCallSunny = (
  s: GameState,
  callerId: PlayerId,
  events: GameEvent[],
): string | null => {
  // A settled call leaves either `resolved` set or the whole window gone with
  // the rewind, so this one check covers "too late" in all its forms.
  const challenge = s.challenge;
  if (!challenge || challenge.resolved) return "there's nothing to call";
  if (challenge.drawerId === callerId) return "you can't call it on yourself";

  const caller = playerById(s, callerId);
  if (!caller) return "unknown player";
  if (caller.eliminated) return "you're out of the game";

  const violation = challenge.violation;
  const targetId = challenge.drawerId;
  events.push({ type: "sunnyCalled", callerId, targetId, correct: violation !== null });

  if (!violation) {
    // Accusations aren't free.
    challenge.resolved = true;
    s.phase = { kind: "disposal", playerId: callerId, reason: "sunnyBadCall", resume: s.phase };
    return null;
  }

  // Rewind to the instant before the illegal draw. Restoring wholesale is what
  // lets the punishment undo whatever the drawer did afterwards — including a
  // card they've already played and the suit an 8 named.
  const disposedIds = [...violation.cardIds];
  Object.assign(s, structuredClone(violation.snapshot));
  s.challenge = null;

  const target = playerById(s, targetId);
  if (!target) throw new Error(`the drawer ${targetId} vanished from the rewound game`);

  // The cards they drew are disposed of, not put back. In the rewound state
  // they're wherever they were before being drawn — usually the draw pile, but
  // a reshuffle in between can leave one buried in the discard or disposal.
  const disposed = takeCardsFromPiles(s, disposedIds);
  s.disposalPile.push(...disposed);
  if (disposed.length > 0) {
    events.push({ type: "disposed", playerId: targetId, cards: disposed, reason: "sunnyDrawn" });
  }

  s.phase = {
    kind: "disposal",
    playerId: targetId,
    reason: "sunnyPunishment",
    resume: { kind: "sunnyPlay" },
  };
  return null;
};

const handleDispose = (
  s: GameState,
  playerId: PlayerId,
  cardId: string,
  events: GameEvent[],
): string | null => {
  if (s.phase.kind !== "disposal") return "there's no card to give up";
  if (s.phase.playerId !== playerId) return "it isn't your card to give up";

  const player = playerById(s, playerId);
  if (!player) return "unknown player";
  const index = player.hand.findIndex((c) => c.id === cardId);
  if (index === -1) return "that card isn't in your hand";

  const [card] = player.hand.splice(index, 1) as [Card];
  s.disposalPile.push(card);
  events.push({ type: "disposed", playerId, cards: [card], reason: s.phase.reason });

  const resume = s.phase.resume;
  eliminateIfEmpty(s, player, events);
  if (finishIfOver(s, events)) return null;
  s.phase = resume;

  if (resume.kind === "sunnyPlay") {
    // A punishment card that empties the hand, or that happens to be the only
    // card they could have played, leaves nothing to make good on.
    const offender = currentPlayer(s);
    if (offender.eliminated || !mustPlay(s, offender)) advanceTurn(s, events);
  }
  return null;
};

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const recordDraw = (
  s: GameState,
  playerId: PlayerId,
  card: Card,
  inViolation: boolean,
  snapshot: GameState | null,
): void => {
  if (!s.challenge || s.challenge.drawerId !== playerId) {
    s.challenge = { drawerId: playerId, drawnIds: [], violation: null, resolved: false };
  }
  const challenge = s.challenge;
  challenge.drawnIds.push(card.id);
  // A fresh draw is a fresh chance to be caught, even if an earlier call in
  // this turn has already been settled.
  challenge.resolved = false;

  if (challenge.violation) challenge.violation.cardIds.push(card.id);
  else if (inViolation && snapshot) challenge.violation = { snapshot, cardIds: [card.id] };
};

/** Removes the named cards from wherever they're sitting in the piles. */
const takeCardsFromPiles = (s: GameState, ids: readonly string[]): Card[] => {
  const wanted = new Set(ids);
  const taken: Card[] = [];
  const sift = (pile: Card[]): Card[] =>
    pile.filter((card) => {
      if (!wanted.has(card.id)) return true;
      taken.push(card);
      return false;
    });

  s.drawPile = sift(s.drawPile);
  // The discard pile's order below the top card is irrelevant, and the top card
  // itself can never be one of these — a reshuffle always leaves it in place.
  s.disposalPile = sift(s.disposalPile);
  const top = s.discardPile[s.discardPile.length - 1];
  s.discardPile = [...sift(s.discardPile.slice(0, -1)), ...(top ? [top] : [])];
  return taken;
};

const recyclablePile = (s: GameState): Card[] => [
  ...s.discardPile.slice(0, -1),
  ...s.disposalPile,
];

const canRefill = (s: GameState): boolean =>
  s.drawPile.length > 0 || recyclablePile(s).length > 0;

/** True if a card can be drawn, reshuffling the dead piles back in if needed. */
const refillDrawPile = (s: GameState, events: GameEvent[]): boolean => {
  if (s.drawPile.length > 0) return true;
  const pool = recyclablePile(s);
  if (pool.length === 0) return false;

  const [shuffled, seed] = shuffle(pool, s.rngSeed);
  const top = topCard(s);
  s.rngSeed = seed;
  s.drawPile = shuffled;
  s.discardPile = [top];
  s.disposalPile = [];
  events.push({ type: "reshuffled", drawPileSize: shuffled.length });
  return true;
};

const eliminateIfEmpty = (s: GameState, player: PlayerState, events: GameEvent[]): void => {
  if (player.eliminated || player.hand.length > 0) return;
  player.eliminated = true;
  events.push({ type: "eliminated", playerId: player.id });
};

const finishIfOver = (s: GameState, events: GameEvent[]): boolean => {
  const alive = activePlayers(s);
  if (alive.length > 1) return false;
  s.status = "over";
  s.phase = { kind: "over" };
  s.winnerId = alive[0]?.id ?? null;
  events.push({ type: "gameOver", winnerId: s.winnerId, reason: "lastStanding" });
  return true;
};

const canAct = (s: GameState, player: PlayerState): boolean =>
  mustPlay(s, player) || canRefill(s);

const advanceTurn = (s: GameState, events: GameEvent[]): void => {
  s.drawsThisTurn = 0;
  const seats = s.players.length;
  const alive = activePlayers(s).length;

  for (let attempt = 0; attempt < alive; attempt++) {
    for (let step = 1; step <= seats; step++) {
      const index = (s.turnIndex + step) % seats;
      if (!s.players[index]?.eliminated) {
        s.turnIndex = index;
        break;
      }
    }
    // Skip anyone who has no legal play *and* nothing to draw: they have no
    // decision to make. If that's true of everyone, the game is deadlocked.
    if (canAct(s, currentPlayer(s))) {
      s.turnNumber += 1;
      s.phase = { kind: "action" };
      events.push({ type: "turnChanged", playerId: currentPlayer(s).id });
      return;
    }
  }
  finishAsStalemate(s, events);
};

/**
 * Nobody can play and there is nothing left to draw — every card is in a hand.
 * Vanishingly unlikely with 104 cards, and a hang if left unhandled, so the
 * game ends here and the biggest hand wins. See `docs/RULES.md`.
 */
const finishAsStalemate = (s: GameState, events: GameEvent[]): void => {
  const alive = activePlayers(s);
  let best: PlayerState | null = null;
  let tied = false;
  for (const player of alive) {
    if (!best || player.hand.length > best.hand.length) {
      best = player;
      tied = false;
    } else if (player.hand.length === best.hand.length) {
      tied = true;
    }
  }
  s.status = "over";
  s.phase = { kind: "over" };
  s.winnerId = tied ? null : (best?.id ?? null);
  events.push({ type: "gameOver", winnerId: s.winnerId, reason: "stalemate" });
};
