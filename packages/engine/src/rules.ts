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
  type Challenge,
  type ReachPile,
  type SunnyEvidence,
  type SunnyReach,
  type TurnUpReason,
} from "./types.ts";

/**
 * A real table is 4 to 8, and the lobby is what enforces the floor. The engine
 * allows 2 so tests can stay small.
 */
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

/**
 * The next player still in the game, going round from whoever is to move.
 *
 * Only looks — it moves nothing. `advanceTurn` is what actually passes the
 * turn; this answers "who is next" for a rule that needs to name them ahead of
 * time, which today means Power of Eights. Undefined when nobody else is left.
 */
const nextActivePlayer = (state: GameState): PlayerState | undefined => {
  const seats = state.players.length;
  for (let step = 1; step <= seats; step++) {
    const candidate = state.players[(state.turnIndex + step) % seats];
    if (candidate && !candidate.eliminated) return candidate;
  }
  return undefined;
};

// ---------------------------------------------------------------------------
// Setting up
// ---------------------------------------------------------------------------

/**
 * `dealerIndex` seats the dealer; play opens on the seat to their left. The
 * dealer has no other power in this game, so it is not carried on the state —
 * it exists to settle who leads, and rotating it between rounds is the room's
 * job, not the engine's.
 */
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

  // Normally an 8 turned up here is natural — its own suit is the suit in play,
  // and nobody names anything. Nothing gets buried or redealt.
  const upcard = drawPile.pop();
  if (!upcard) throw new Error("no card to start the face-up pile");

  // Dealer's Choice: an 8 seed is the dealer's to name instead.
  //
  // The turn is seated on the *dealer* rather than on the opening player, which
  // looks wrong until you follow it through: naming a suit always advances the
  // turn, and advancing from the dealer lands on their left — which is exactly
  // who opens. So the ordinary rule gets us there with no special case, and
  // `turnNumber` starts a step back so the first real turn is still turn 1.
  const dealerNames = options.seedEight === "dealerNames" && isWild(upcard);

  return {
    options,
    players,
    // The player immediately to the dealer's left opens.
    turnIndex: dealerNames ? dealerIndex : (dealerIndex + 1) % players.length,
    drawPile,
    discardPile: [upcard],
    activeSuit: upcard.suit,
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

/**
 * Every refusal below is shown to a player, as written, and none of them get
 * long enough to be read twice: they land in a pill above the hand that is gone
 * in under two seconds (#90). So they are fragments rather than sentences —
 * three words at the outside, no apology, no explanation of the rule. The card
 * still sitting in the hand is most of the message; this only says which of the
 * handful of reasons it was.
 */
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

  // A play made to settle a Sunny call is followed straight away by the
  // punishment card and then the touched card, so an 8 here names nothing —
  // whatever it chose would be buried before the next player ever saw it.
  const settlingSunny = s.sunny !== null;

  player.hand.splice(index, 1);
  s.discardPile.push(card);
  if (settlingSunny || !isWild(card)) s.activeSuit = card.suit;
  events.push({ type: "played", playerId: player.id, card });

  eliminateIfEmpty(s, player, events);
  if (finishIfOver(s, events)) return null;

  if (settlingSunny) return demandPunishment(s, player, events);

  // Playing your last card as an 8 still gets you the suit call on the way out —
  // unless the table plays Power of Eights, where the call was never yours.
  if (isWild(card)) {
    const namer =
      s.options.eights === "nextPlayerNames" ? nextActivePlayer(s)?.id : player.id;
    // Nobody left to hand it to. Can't happen in practice — a table with one
    // player standing has already ended above — but the suit has to go
    // somewhere, so it stays with the player who laid the 8.
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

  // Drawing while holding a playable card breaks the rules, and the engine
  // deliberately allows it: that violation is the Sunny Rule's entire subject.
  // What it does instead is remember, so a call can be judged.
  //
  // At a table playing without the rule none of that bookkeeping means
  // anything, and skipping it is not just tidiness — the snapshot below clones
  // the entire game state, on every illegal draw, and it is the most expensive
  // thing this engine does. With the rule off, drawing is just drawing.
  const watching = s.options.sunny !== null;
  const inViolation = watching && mustPlay(s, player);
  const alreadyCaught = s.challenge?.drawerId === player.id && s.challenge.violation !== null;
  const snapshot = inViolation && !alreadyCaught ? structuredClone(s) : null;

  // The hand and the board exactly as they stand right now, before anything
  // about this reach is resolved — what an accusation of this draw is judged
  // against, and all a caller is ever shown to accuse from.
  //
  // The pile is frozen from the same instant and travels with it. Only a call
  // that has been judged is ever shown it, but it has to be taken *now*: by the
  // time a call is made the offender may have played on top of the card they
  // reached against, and a wrong call — where there is no `violation.snapshot`
  // to read it back out of — has just as much of a pile to peel as a right one.
  const reach = watching
    ? { hand: [...player.hand], activeSuit: s.activeSuit, topRank: topCard(s).rank }
    : null;
  const reachPile: ReachPile | null = watching
    ? { inPlay: topCard(s), ids: s.discardPile.map((c) => c.id) }
    : null;

  // An empty deck is recycled first, and that recycle is the whole of this
  // action — no card reaches a hand. The card turned up is a new card in play,
  // so the player decides again against it: draw once more if still stuck, or
  // play if it has just handed them a play.
  //
  // Reaching for the deck is the offence either way, so the window opens even
  // though nothing was drawn. Otherwise an empty deck would be a silent, free
  // way to touch it while holding a play, and re-roll the card in play with it.
  // A resolution from here simply has nothing to turn up at the end.
  if (s.drawPile.length === 0) {
    // Every card is in somebody's hand. Nothing to draw, so the turn ends.
    if (!recycleFaceUpPile(s, events)) advanceTurn(s, events);
    else if (reach && reachPile) {
      recordDraw(s, player.id, null, inViolation, snapshot, reach, reachPile);
    }
    return null;
  }

  const card = s.drawPile.pop() as Card;
  player.hand.push(card);
  s.drawsThisTurn += 1;
  events.push({ type: "drew", playerId: player.id, card });
  if (reach && reachPile) recordDraw(s, player.id, card, inViolation, snapshot, reach, reachPile);

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
  if (s.phase.kind !== "suit") return "No suit to name";
  // Whose call it is, not whose turn it is. Under Power of Eights those differ
  // by one seat, and under Dealer's Choice the game hasn't started yet.
  if (s.phase.playerId !== playerId) return "Not your call";
  const chosen = SUITS.find((candidate) => candidate === suit);
  if (!chosen) return "Not a suit";

  s.activeSuit = chosen;
  events.push({ type: "suitChosen", playerId, suit: chosen });
  // Always advance, whoever named it. Each variant seats the turn so that this
  // one rule lands on the right player: the 8's player under the standard rule,
  // the 8's player again under Power of Eights (so the namer plays next), and
  // the dealer under Dealer's Choice (so their left opens).
  advanceTurn(s, events);
  return null;
};

/**
 * How many more reaches this player must sit out before they may accuse again.
 * Zero for anyone free to call, which is almost everyone almost always.
 *
 * Written without `Math.max` on purpose: the engine bans the `Math` global
 * outright, which is how `Math.random` is kept out of a package that has to
 * replay exactly from a seed.
 */
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
  // Said plainly rather than as "there's nothing to call", which would be true
  // but would read as "you were too slow" at a table where the rule is off.
  const rule = s.options.sunny;
  if (!rule) return "No Sunny Rule here";

  // A settled call leaves either `resolved` set or the whole window gone with
  // the rewind, so this one check covers "too late" in all its forms.
  const challenge = s.challenge;
  if (!challenge || challenge.resolved) return "Nothing to call";
  if (challenge.drawerId === callerId) return "Not on yourself";

  const caller = playerById(s, callerId);
  if (!caller) return "Unknown player";
  if (caller.eliminated) return "You're out";

  const locked = sunnyLockedDraws(s, callerId);
  if (locked > 0) {
    // The one refusal that has to carry a number: the lockout is invisible
    // otherwise, and "how much longer" is the whole of what it's asking.
    return `Locked out — ${locked} more ${locked === 1 ? "draw" : "draws"}`;
  }

  // The only cards an accusation may ever name: the offender's hand as it
  // stood before the draw being challenged. Anything they drew since is not an
  // option, on the server any more than in the UI.
  const accused = challenge.reach.hand.find((c) => c.id === cardId);
  if (!accused) return "They didn't hold it";

  const correct = isPlayable(accused, challenge.reach.activeSuit, challenge.reach.topRank);
  const targetId = challenge.drawerId;
  // Read the touched cards while they are still where the offender put them.
  // A moment from now the rewind will have moved them, and the table wants to
  // watch that happen rather than find it already done. A call that missed
  // rewinds nothing, so it returns nothing.
  const returned = correct && challenge.violation ? findCards(s, challenge.violation.touchedIds) : [];
  // Read before the rewind too, and for the same reason: a moment from now the
  // restored snapshot will have taken the cards played since the offence back
  // off the pile, and the evidence is what the pile looked like until then.
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
    // Nothing happens to either hand — but the caller can't try again until
    // three further draws have happened at the table.
    challenge.resolved = true;
    s.sunnyLockouts[callerId] = s.totalDraws + rule.lockoutDraws;
    return null;
  }

  // A named card is only ever legal here if the reach it was judged against
  // really was a violation, which is exactly when `violation` gets set.
  const violation = challenge.violation;
  if (!violation) throw new Error("a correct accusation found no violation to rewind to");

  // Rewind to the instant before the illegal draw. Restoring wholesale is what
  // lets the punishment undo whatever the drawer did afterwards — including a
  // card they've already played and the suit an 8 named. `totalDraws` and
  // `sunnyLockouts` are carried forward rather than restored: draws taken and
  // lockouts earned since then are real and happened at the table regardless
  // of how this call landed, and the rewind must not hand anyone their call
  // back.
  const touchedIds = [...violation.touchedIds];
  const { totalDraws, sunnyLockouts } = s;
  Object.assign(s, structuredClone(violation.snapshot));
  s.totalDraws = totalDraws;
  s.sunnyLockouts = sunnyLockouts;
  s.challenge = null;

  const target = playerById(s, targetId);
  if (!target) throw new Error(`the drawer ${targetId} vanished from the rewound game`);

  // Their hand is untouched by the rewind, so the play they were dodging is
  // still there to make. It comes first; the punishment card and the cards they
  // touched follow once it's made.
  s.sunny = { offenderId: targetId, touchedIds };
  s.phase = { kind: "sunnyPlay" };
  return null;
};

/**
 * The pile as the offence left it, built for a call that has just been judged.
 *
 * Deliberately assembled here rather than lifted out of `violation.snapshot`.
 * That snapshot is a whole `GameState` — every hand and the entire deck — and it
 * does not leave this process; this is three named things, each of which the
 * table watched go face up. It is also the only version that works for a call
 * that missed, where there is frequently no snapshot to lift anything out of.
 *
 * `since` is what is in the pile now and wasn't at the reach, in the order it
 * was played. Matching by identity rather than by counting means a recycle
 * mid-window — the one thing that can shuffle the pile away underneath an open
 * challenge — leaves nothing recognisable on top rather than a slice of
 * nonsense, and the peel degrades to the two cards that decide it.
 */
const sunnyEvidence = (s: GameState, challenge: Challenge): SunnyEvidence => {
  const alreadyThere = new Set(challenge.reachPile.ids);
  return {
    inPlay: challenge.reachPile.inPlay,
    activeSuit: challenge.reach.activeSuit,
    since: s.discardPile.filter((card) => !alreadyThere.has(card.id)),
  };
};

/**
 * Step two of a landed Sunny call: any one card from what's left of the hand.
 * A player emptied by the skipped play has nothing to give and skips straight
 * to having their touched cards turned up.
 */
const demandPunishment = (
  s: GameState,
  offender: PlayerState,
  events: GameEvent[],
): string | null => {
  if (offender.eliminated || offender.hand.length === 0) return finishSunny(s, events);
  s.phase = { kind: "surrender", playerId: offender.id, reason: "sunnyPunishment" };
  return null;
};

/**
 * Step three, and the end of the offender's turn: every card they drew
 * illegally goes face up, and the last of them becomes the card in play.
 */
const finishSunny = (s: GameState, events: GameEvent[]): string | null => {
  const sunny = s.sunny;
  if (!sunny) return null;
  s.sunny = null;

  const touched = takeCardsFromPiles(s, sunny.touchedIds);
  if (touched.length > 0) {
    turnUp(s, touched, "sunnyTouched", events);
  } else if (s.drawPile.length === 0) {
    // They were caught reaching for an empty deck, so there is nothing they
    // touched to turn up. The reach still has to produce a new card in play,
    // and it is drawn the same way any other empty deck is answered: the pile
    // is shuffled back into a deck and a fresh card comes off it.
    //
    // Leaving the punishment card showing instead — which is what this used to
    // do — handed the offender the choice of what the whole table matches next.
    // That is backwards. Reaching for the deck costs you control of the board;
    // it does not buy you a free placement of a card you picked.
    //
    // The guard matters: `recycleFaceUpPile` assigns the draw pile outright, so
    // calling it with cards still in the deck would drop all of them. Nothing
    // touched implies an empty-deck reach implies a rewind to an empty deck, so
    // this should always hold — but card conservation is not a thing to assume.
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

  // Played face up like any other card. It needn't be legal, and it sets no
  // suit: the touched card lands on top of it a moment later.
  s.discardPile.push(card);
  events.push({ type: "surrendered", playerId, card, reason });

  eliminateIfEmpty(s, player, events);
  if (finishIfOver(s, events)) return null;

  return finishSunny(s, events);
};

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Opens or extends the challenge window. `card` is null when the deck had to be
 * recycled and nothing was drawn — the reach still counts, so the window opens
 * with no card attached to it.
 *
 * `reach` follows the newest reach only while nobody has been caught. The
 * moment one *is* a violation it freezes, together with the snapshot taken from
 * the same instant, and every later reach in the window leaves it alone.
 *
 * That pairing is the point. An accusation is judged against `reach` and
 * rewound to `violation.snapshot`, so the two describing different moments is
 * incoherent — and they come apart the moment the board moves mid-turn, which a
 * recycle does. The card that made the offence an offence stays in hand, but it
 * stops being playable against the card the recycle turned up, so judging a
 * later reach would rule every possible accusation wrong while the violation
 * still stood. It would also put the cards drawn by the offence itself on the
 * list of cards you may name. (#74)
 */
const recordDraw = (
  s: GameState,
  playerId: PlayerId,
  card: Card | null,
  inViolation: boolean,
  snapshot: GameState | null,
  reach: SunnyReach,
  reachPile: ReachPile,
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
  // Frozen together or not at all: the pile is only ever read against the reach
  // it was taken with.
  if (!challenge.violation) {
    challenge.reach = reach;
    challenge.reachPile = reachPile;
  }
  // Reaches at the table, counted for the lockouts measured against them. A
  // reach that found nothing at all — an empty deck with nothing to recycle
  // either — isn't one: no card moved and no window opened for it, so it is
  // not a beat anybody's lockout should be counting down against.
  s.totalDraws += 1;
  if (card) challenge.drawnIds.push(card.id);
  // A fresh draw is a fresh chance to be caught, even if an earlier call in
  // this turn has already been settled.
  challenge.resolved = false;

  if (challenge.violation) {
    if (card) challenge.violation.touchedIds.push(card.id);
  } else if (inViolation && snapshot) {
    challenge.violation = { snapshot, touchedIds: card ? [card.id] : [] };
  }
};

/**
 * Removes the named cards from wherever they're sitting.
 *
 * Only used on the cards a caught player touched, immediately before they go
 * face up. In the rewound state they're normally still in the deck, but a
 * recycle between the first and last illegal draw can leave one in the face-up
 * pile — including on top of it, which is why this puts nothing back itself.
 */
/**
 * The same cards `takeCardsFromPiles` will eventually want, looked up wherever
 * they are right now and left there. A card drawn illegally is in the
 * offender's hand unless they have already played it, so both are searched.
 */
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
  // Back into the order they were drawn in, so the last one drawn ends up on
  // top of the pile and becomes the card in play.
  return ids.flatMap((id) => {
    const card = found.get(id);
    return card ? [card] : [];
  });
};

/** Whether a card can be drawn, now or after a recycle. */
const canRefill = (s: GameState): boolean =>
  // Recycling n face-up cards turns one straight back up, leaving n-1 to draw.
  s.drawPile.length > 0 || s.discardPile.length >= 2;

/**
 * Turns cards face up onto the pile. They came off the deck rather than out of
 * a hand, so even an 8 is natural here: the last card's own suit is the suit in
 * play, and nobody names anything.
 */
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
  events.push({ type: "turnedUp", cards: [...cards], reason });
};

/**
 * The deck has run out: the whole face-up pile, current card in play included,
 * is shuffled and turned back over, and its top card is turned up to restart
 * the pile. Nothing is held back — the card in play changes here.
 *
 * False when there's nothing to recycle, which means every card is in a hand.
 */
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
 * Unlikely even with a single 52-card deck, and a hang if left unhandled, so
 * the game ends here and the biggest hand wins. See `docs/RULES.md`.
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
