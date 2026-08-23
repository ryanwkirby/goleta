/**
 * The rules of goleta. `docs/RULES.md` is canonical; this is the implementation.
 * Pure: `applyIntent` clones the state, mutates the clone, hands it back, and
 * randomness comes only from the seed carried in the state.
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
  type Challenge,
  type ReachPile,
  type SunnyEvidence,
  type SunnyReach,
  type TurnUpReason,
} from "./types.ts";

/** A real table is 4 to 8 and the lobby enforces the floor; the engine allows 2
 * so tests can stay small. */
export const MIN_TABLE_PLAYERS = 4;
export const MAX_TABLE_PLAYERS = 8;

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

export const legalCards = (state: GameState, player: PlayerState): Card[] => {
  const top = topCard(state);
  return player.hand.filter((card) => isPlayable(card, state.activeSuit, top.rank));
};

/**
 * Whether this player is forbidden from drawing: if you can play, you must.
 *
 * For the player's *own* hand only. Never call it on someone else's to decide
 * whether to offer a Sunny call — that hands over the answer.
 */
export const mustPlay = (state: GameState, player: PlayerState): boolean =>
  legalCards(state, player).length > 0;

export const activePlayers = (state: GameState): PlayerState[] =>
  state.players.filter((p) => !p.eliminated);

/** Only looks; `advanceTurn` passes the turn. For rules that must name the next
 * seat ahead of time, which today means Power of Eights. */
const nextActivePlayer = (state: GameState): PlayerState | undefined => {
  const seats = state.players.length;
  for (let step = 1; step <= seats; step++) {
    const candidate = state.players[(state.turnIndex + step) % seats];
    if (candidate && !candidate.eliminated) return candidate;
  }
  return undefined;
};

/** `dealerIndex` seats the dealer; play opens on the seat to their left. */
export const startGame = (
  playerIds: readonly PlayerId[],
  seed: number,
  options: GameOptions = DEFAULT_OPTIONS,
  dealerIndex = 0,
): GameState => {
  if (playerIds.length < 2) throw new Error("a game needs at least two players");
  if (playerIds.length > MAX_TABLE_PLAYERS) {
    throw new Error(`a game seats at most ${MAX_TABLE_PLAYERS} players`);
  }
  if (new Set(playerIds).size !== playerIds.length) {
    throw new Error("player ids must be unique");
  }
  if (!Number.isInteger(dealerIndex) || dealerIndex < 0 || dealerIndex >= playerIds.length) {
    throw new Error(`no seat ${dealerIndex} to deal from`);
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

  const upcard = drawPile.pop();
  if (!upcard) throw new Error("no card to start the face-up pile");

  // Dealer's Choice seats the turn on the *dealer* rather than the opening player,
  // which looks wrong until you follow it: naming a suit always advances the turn,
  // and advancing from the dealer lands on their left. `turnNumber` starts a step
  // back so the first real turn is still turn 1.
  const dealerNames = options.seedEight === "dealerNames" && isWild(upcard);

  return {
    options,
    players,
    turnIndex: dealerNames ? dealerIndex : (dealerIndex + 1) % players.length,
    drawPile,
    discardPile: [upcard],
    activeSuit: upcard.suit,
    namedSuit: null,
    phase: dealerNames
      ? { kind: "suit", playerId: players[dealerIndex]?.id ?? "" }
      : { kind: "action" },
    challenge: null,
    sunny: null,
    drawsThisTurn: 0,
    totalDraws: 0,
    sunnyLockouts: {},
    rngSeed: seedAfterShuffle,
    status: "playing",
    winnerId: null,
    turnNumber: dealerNames ? 0 : 1,
  };
};

export const applyIntent = (state: GameState, intent: Intent): ApplyResult => {
  const next = structuredClone(state);
  const events: GameEvent[] = [];
  const error = route(next, intent, events);
  if (error !== null) return { ok: false, error };
  return { ok: true, state: next, events };
};

/** Refusals land in a pill above the hand that is gone in two seconds (#90), so
 * they are three-word fragments rather than sentences. */
const route = (s: GameState, intent: Intent, events: GameEvent[]): string | null => {
  if (s.status === "over") return "The game is over";
  switch (intent.type) {
    case "playCard":
      return handlePlay(s, intent.playerId, intent.cardId, events);
    case "drawCard":
      return handleDraw(s, intent.playerId, events);
    case "chooseSuit":
      return handleChooseSuit(s, intent.playerId, intent.suit, events);
    case "callSunny":
      return handleCallSunny(s, intent.playerId, intent.cardId, events);
    case "surrenderCard":
      return handleSurrender(s, intent.playerId, intent.cardId, events);
    case "endTurn":
      return handleEndTurn(s, intent.playerId, events);
  }
};

/** Closes on the *next* player's first action; the drawer's own follow-ups leave
 * it open, or they could draw illegally, play, and be immune before anyone
 * could speak. */
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
    return "Can't play now";
  }
  const player = currentPlayer(s);
  if (player.id !== playerId) return "Not your turn";

  const index = player.hand.findIndex((c) => c.id === cardId);
  if (index === -1) return "Not in your hand";
  const card = player.hand[index] as Card;
  if (!isPlayable(card, s.activeSuit, topCard(s).rank)) {
    return "Doesn't match";
  }

  // An 8 played to settle a call names nothing: the punishment card and the
  // touched card land straight after, so it would be buried before anyone saw it.
  const settlingSunny = s.sunny !== null;

  player.hand.splice(index, 1);
  s.discardPile.push(card);
  if (settlingSunny || !isWild(card)) s.activeSuit = card.suit;
  s.namedSuit = null;
  events.push({ type: "played", playerId: player.id, card });

  eliminateIfEmpty(s, player, events);
  if (finishIfOver(s, events)) return null;

  if (settlingSunny) return demandPunishment(s, player, events);

  // Your last card as an 8 still gets you the suit call, unless the table plays
    // Power of Eights.
  if (isWild(card)) {
    const namer =
      s.options.eights === "nextPlayerNames" ? nextActivePlayer(s)?.id : player.id;
    // Nobody left to hand it to, but the suit has to go somewhere.
    s.phase = { kind: "suit", playerId: namer ?? player.id };
    return null;
  }
  advanceTurn(s, events);
  return null;
};

const handleDraw = (s: GameState, playerId: PlayerId, events: GameEvent[]): string | null => {
  closeWindowIfSomeoneElseActs(s, playerId);

  if (s.phase.kind !== "action") return "Can't draw now";
  const player = currentPlayer(s);
  if (player.id !== playerId) return "Not your turn";
  if (s.drawsThisTurn >= MAX_DRAWS_PER_TURN) return "That's three draws";

  // Drawing on a playable hand is the violation the Sunny Rule exists to punish,
  // so it is allowed and remembered rather than refused. With the rule off there
  // is nothing to remember, and skipping it is not just tidiness: the snapshot
  // below clones the whole state on every illegal draw.
  const watching = s.options.sunny !== null;
  const inViolation = watching && mustPlay(s, player);
  const alreadyCaught = s.challenge?.drawerId === player.id && s.challenge.violation !== null;
  const snapshot = inViolation && !alreadyCaught ? structuredClone(s) : null;

  // What an accusation of this draw is judged against. The pile is frozen from the
  // same instant and has to be taken now — by the time a call is made the offender
  // may have played over the card they reached against, and a wrong call has no
  // snapshot to read it back out of.
  const reach = watching
    ? { hand: [...player.hand], activeSuit: s.activeSuit, topRank: topCard(s).rank }
    : null;
  const reachPile: ReachPile | null = watching
    ? { inPlay: topCard(s), ids: s.discardPile.map((c) => c.id) }
    : null;

  // An empty deck is recycled first and that is the whole action; the player
  // decides again against the card turned up. The window opens anyway — reaching
  // is the offence — or an empty deck would be a free way to touch the pile while
  // holding a play.
  if (s.drawPile.length === 0) {
    // A deck with nothing to recycle back into it leaves the turn where it is, for
    // #260's reason: `turnDrawnOut` is true here, so ending it is the player's to
    // press. The window this reach opened stays open until they do.
    if (recycleFaceUpPile(s, events) && reach && reachPile) {
      recordDraw(s, player.id, null, inViolation, snapshot, reach, reachPile);
    }
    return null;
  }

  const card = s.drawPile.pop() as Card;
  player.hand.push(card);
  s.drawsThisTurn += 1;
  events.push({ type: "drew", playerId: player.id, card });
  if (reach && reachPile) recordDraw(s, player.id, card, inViolation, snapshot, reach, reachPile);

  // The turn does **not** end itself here any more (#260). It used to, and that
  // was one action doing two things: the second shut the challenge window on the
  // first, with the next seat on the clock the instant the third card landed —
  // and the third reach is the hardest one to judge, because by then the offender
  // is holding three more cards than the table has been reading. `endTurn` is the
  // player's to press.
  return null;
};

/**
 * "I'm done" — the end of a turn, said rather than done to you (#260).
 *
 * **Refused unless the turn has actually been drawn out.** Three draws, or a deck
 * that cannot be replenished, which is the case the turn used to end early on.
 * There is no legal way to end a turn you have not drawn out.
 *
 * **Pressing it while holding a playable card is permitted, silently.** Must-play
 * has not changed, so it is a lie, and it is a Sunny violation recorded like a
 * reach for the deck — the same first rule in `AGENTS.md` § "Rules that look like
 * bugs and are not", applied to a second control.
 *
 * **The violation is recorded at this moment, not at the draw.** The third draw
 * may have been perfectly legal — they were stuck when they reached — and it is
 * the card it *gave* them that makes ending the turn an offence. So the reach,
 * the board, the frozen pile and the snapshot are all taken here, against the
 * hand as it now stands. A violation already frozen from an earlier draw stays
 * frozen: that is the first offence and the one a call is judged against.
 */
const handleEndTurn = (s: GameState, playerId: PlayerId, events: GameEvent[]): string | null => {
  closeWindowIfSomeoneElseActs(s, playerId);

  if (s.phase.kind !== "action") return "Can't do that now";
  const player = currentPlayer(s);
  if (player.id !== playerId) return "Not your turn";
  if (!turnDrawnOut(s)) return "Draw first";

  const watching = s.options.sunny !== null;
  const inViolation = watching && mustPlay(s, player);
  const alreadyCaught = s.challenge?.drawerId === player.id && s.challenge.violation !== null;
  const snapshot = inViolation && !alreadyCaught ? structuredClone(s) : null;

  if (watching) {
    recordReach(
      s,
      player.id,
      { hand: [...player.hand], activeSuit: s.activeSuit, topRank: topCard(s).rank },
      { inPlay: topCard(s), ids: s.discardPile.map((c) => c.id) },
      inViolation,
      snapshot,
      // No card: nothing was drawn, so there is nothing to take back and nothing
      // to count against anybody's lockout.
      null,
    );
  }

  advanceTurn(s, events);
  return null;
};

const handleChooseSuit = (
  s: GameState,
  playerId: PlayerId,
  suit: string,
  events: GameEvent[],
): string | null => {
  if (s.phase.kind !== "suit") return "No suit to name";
  // Whose call it is, not whose turn: Power of Eights differs by a seat, and under
  // Dealer's Choice the game hasn't started.
  if (s.phase.playerId !== playerId) return "Not your call";
  const chosen = SUITS.find((candidate) => candidate === suit);
  if (!chosen) return "Not a suit";

  s.activeSuit = chosen;
  // It may well be the 8's own suit, which is a real play — see `namedSuit`.
  s.namedSuit = chosen;
  events.push({ type: "suitChosen", playerId, suit: chosen });
  // Always advance: each variant seats the turn so this one rule lands right.
  advanceTurn(s, events);
  return null;
};

/** Written without `Math.max` on purpose: the engine bans the `Math` global,
 * which is how `Math.random` is kept out of a package that replays from a seed. */
export const sunnyLockedDraws = (s: GameState, playerId: PlayerId): number => {
  const until = s.sunnyLockouts[playerId] ?? 0;
  return until > s.totalDraws ? until - s.totalDraws : 0;
};

const handleCallSunny = (
  s: GameState,
  callerId: PlayerId,
  cardId: string,
  events: GameEvent[],
): string | null => {
  const rule = s.options.sunny;
  if (!rule) return "No Sunny Rule here";

  // A settled call leaves `resolved` set, or the window gone with the rewind.
  const challenge = s.challenge;
  if (!challenge || challenge.resolved) return "Nothing to call";
  if (challenge.drawerId === callerId) return "Not on yourself";

  const caller = playerById(s, callerId);
  if (!caller) return "Unknown player";
  if (caller.eliminated) return "You're out";

  const locked = sunnyLockedDraws(s, callerId);
  if (locked > 0) {
    return `Locked out — ${locked} more ${locked === 1 ? "draw" : "draws"}`;
  }

  // The only cards an accusation may name: the hand as it stood before the draw.
  const accused = challenge.reach.hand.find((c) => c.id === cardId);
  if (!accused) return "They didn't hold it";

  const correct = isPlayable(accused, challenge.reach.activeSuit, challenge.reach.topRank);
  const targetId = challenge.drawerId;
  // Both read before the rewind, which is about to move the touched cards and take
  // the cards played since the offence back off the pile.
  const returned = correct && challenge.violation ? findCards(s, challenge.violation.touchedIds) : [];
  const evidence = sunnyEvidence(s, challenge);
  events.push({
    type: "sunnyCalled",
    callerId,
    targetId,
    card: accused,
    correct,
    returned,
    evidence,
  });

  if (!correct) {
    challenge.resolved = true;
    s.sunnyLockouts[callerId] = s.totalDraws + rule.lockoutDraws;
    return null;
  }

  const violation = challenge.violation;
  if (!violation) throw new Error("a correct accusation found no violation to rewind to");

  // Rewind wholesale, which is what lets the punishment undo whatever the drawer
  // did afterwards, an 8's named suit included. `totalDraws` and `sunnyLockouts`
  // are carried forward rather than restored: they happened regardless of how the
  // call landed, and the rewind must not hand anyone their call back.
  const touchedIds = [...violation.touchedIds];
  const { totalDraws, sunnyLockouts } = s;
  Object.assign(s, structuredClone(violation.snapshot));
  s.totalDraws = totalDraws;
  s.sunnyLockouts = sunnyLockouts;
  s.challenge = null;

  const target = playerById(s, targetId);
  if (!target) throw new Error(`the drawer ${targetId} vanished from the rewound game`);

  // The rewind leaves their hand alone, so the play they dodged is still there.
  s.sunny = { offenderId: targetId, touchedIds };
  s.phase = { kind: "sunnyPlay" };
  return null;
};

/**
 * The pile as the offence left it, for a call that has just been judged.
 * Assembled here rather than lifted out of `violation.snapshot`, which never
 * leaves this process — and this is the only version that works for a call that
 * missed. `since` matches by identity, so a recycle mid-window degrades the peel
 * to the two cards that decide it rather than a slice of nonsense.
 */
const sunnyEvidence = (s: GameState, challenge: Challenge): SunnyEvidence => {
  const alreadyThere = new Set(challenge.reachPile.ids);
  return {
    inPlay: challenge.reachPile.inPlay,
    activeSuit: challenge.reach.activeSuit,
    since: s.discardPile.filter((card) => !alreadyThere.has(card.id)),
  };
};

/** Step two: any one card. A player emptied by the skipped play skips straight
 * to having their cards turned up. */
const demandPunishment = (
  s: GameState,
  offender: PlayerState,
  events: GameEvent[],
): string | null => {
  if (offender.eliminated || offender.hand.length === 0) return finishSunny(s, events);
  s.phase = { kind: "surrender", playerId: offender.id, reason: "sunnyPunishment" };
  return null;
};

/** Step three: every card drawn illegally goes face up, last one in play. */
const finishSunny = (s: GameState, events: GameEvent[]): string | null => {
  const sunny = s.sunny;
  if (!sunny) return null;
  s.sunny = null;

  const touched = takeCardsFromPiles(s, sunny.touchedIds);
  if (touched.length > 0) {
    turnUp(s, touched, "sunnyTouched", events);
  } else if (s.drawPile.length === 0) {
    // Caught reaching for an empty deck, so nothing was touched — but the reach still
    // has to produce a card in play. Leaving the punishment card showing handed the
    // offender the choice of what the table matches next. The guard matters:
    // `recycleFaceUpPile` assigns the draw pile outright.
    recycleFaceUpPile(s, events);
  }

  advanceTurn(s, events);
  return null;
};

const handleSurrender = (
  s: GameState,
  playerId: PlayerId,
  cardId: string,
  events: GameEvent[],
): string | null => {
  if (s.phase.kind !== "surrender") return "No card to give up";
  if (s.phase.playerId !== playerId) return "Not your card to give up";

  const player = playerById(s, playerId);
  if (!player) return "Unknown player";
  const index = player.hand.findIndex((c) => c.id === cardId);
  if (index === -1) return "Not in your hand";

  const { reason } = s.phase;
  const [card] = player.hand.splice(index, 1) as [Card];

  // Needn't be legal and sets no suit: the touched card lands on it a moment later.
  s.discardPile.push(card);
  s.namedSuit = null;
  events.push({ type: "surrendered", playerId, card, reason });

  eliminateIfEmpty(s, player, events);
  if (finishIfOver(s, events)) return null;

  return finishSunny(s, events);
};

/**
 * Opens or extends the challenge window. `card` is null when the deck had to be
 * recycled and nothing was drawn — the reach still counts.
 *
 * `reach` follows the newest reach only until one *is* a violation, at which
 * point it freezes with the snapshot from the same instant: the two are judged
 * and rewound against each other, so they must describe one moment, and a
 * recycle mid-turn is what pulls them apart (#74).
 */
const recordReach = (
  s: GameState,
  playerId: PlayerId,
  reach: SunnyReach,
  reachPile: ReachPile,
  inViolation: boolean,
  snapshot: GameState | null,
  card: Card | null,
): void => {
  if (!s.challenge || s.challenge.drawerId !== playerId) {
    s.challenge = {
      drawerId: playerId,
      drawnIds: [],
      reach,
      reachPile,
      violation: null,
      resolved: false,
    };
  }
  const challenge = s.challenge;
  // Frozen together or not at all.
  if (!challenge.violation) {
    challenge.reach = reach;
    challenge.reachPile = reachPile;
  }
  if (card) challenge.drawnIds.push(card.id);
  challenge.resolved = false;

  if (challenge.violation) {
    if (card) challenge.violation.touchedIds.push(card.id);
  } else if (inViolation && snapshot) {
    challenge.violation = { snapshot, touchedIds: card ? [card.id] : [] };
  }
};

/** A reach for the deck. `totalDraws` counts *draws* and nothing else, because
 * that is what a lockout is measured in — an `endTurn` goes through
 * `recordReach` directly and does not touch it. */
const recordDraw = (
  s: GameState,
  playerId: PlayerId,
  card: Card | null,
  inViolation: boolean,
  snapshot: GameState | null,
  reach: SunnyReach,
  reachPile: ReachPile,
): void => {
  s.totalDraws += 1;
  recordReach(s, playerId, reach, reachPile, inViolation, snapshot, card);
};

/** In the rewound state these are normally still in the deck, but a recycle
 * between the first and last illegal draw can leave one in the face-up pile —
 * including on top of it, which is why this puts nothing back itself. */
const findCards = (s: GameState, ids: readonly string[]): Card[] => {
  const pool = new Map<string, Card>();
  for (const player of s.players) for (const card of player.hand) pool.set(card.id, card);
  for (const card of s.discardPile) pool.set(card.id, card);
  return ids.flatMap((id) => {
    const card = pool.get(id);
    return card ? [structuredClone(card)] : [];
  });
};

const takeCardsFromPiles = (s: GameState, ids: readonly string[]): Card[] => {
  const wanted = new Set(ids);
  const found = new Map<string, Card>();
  const sift = (pile: Card[]): Card[] =>
    pile.filter((card) => {
      if (!wanted.has(card.id)) return true;
      found.set(card.id, card);
      return false;
    });

  s.drawPile = sift(s.drawPile);
  s.discardPile = sift(s.discardPile);
  // Back into draw order, so the last one drawn ends up on top of the pile.
  return ids.flatMap((id) => {
    const card = found.get(id);
    return card ? [card] : [];
  });
};

const canRefill = (s: GameState): boolean =>
  // Recycling n face-up cards turns one straight back up, leaving n-1 to draw.
  s.drawPile.length > 0 || s.discardPile.length >= 2;

/**
 * Whether this turn has nowhere left to go but its end (#260) — three draws, or
 * a deck that cannot be replenished. The one condition `endTurn` is legal under,
 * and the one `redact` puts on the wire, so nothing outside here re-derives it.
 */
export const turnDrawnOut = (s: GameState): boolean =>
  s.drawsThisTurn >= MAX_DRAWS_PER_TURN || !canRefill(s);

/** Off the deck rather than out of a hand, so even an 8 is natural here. */
const turnUp = (
  s: GameState,
  cards: readonly Card[],
  reason: TurnUpReason,
  events: GameEvent[],
): void => {
  const last = cards[cards.length - 1];
  if (!last) return;
  s.discardPile.push(...cards);
  s.activeSuit = last.suit;
  s.namedSuit = null;
  events.push({ type: "turnedUp", cards: [...cards], reason });
};

/** The whole face-up pile, card in play included, shuffled back into a deck.
 * False when there is nothing to recycle, which means every card is in a hand. */
const recycleFaceUpPile = (s: GameState, events: GameEvent[]): boolean => {
  if (s.discardPile.length < 2) return false;

  const [shuffled, seed] = shuffle(s.discardPile, s.rngSeed);
  const turned = shuffled.pop() as Card;
  s.rngSeed = seed;
  s.drawPile = shuffled;
  s.discardPile = [];
  events.push({ type: "reshuffled", drawPileSize: s.drawPile.length });
  turnUp(s, [turned], "recycle", events);
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
    // Skip anyone with no legal play *and* nothing to draw. If that's everyone, the
    // game is deadlocked.
    if (canAct(s, currentPlayer(s))) {
      s.turnNumber += 1;
      s.phase = { kind: "action" };
      events.push({ type: "turnChanged", playerId: currentPlayer(s).id });
      return;
    }
  }
  finishAsStalemate(s, events);
};

/** Every card is in a hand and nobody can move. A hang if left unhandled, so the
 * biggest hand wins. See `docs/RULES.md`. */
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
