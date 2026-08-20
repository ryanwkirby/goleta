import type { GameView, PlayerView } from "@goleta/engine";

/**
 * Everyone else, in the order play will reach them. Anchored on your own seat
 * rather than absolute seat order, which made play sweep a different way across
 * the strip for every player at the same table. Fixed for the whole game.
 *
 * **Still in first, then out** (#192): an out player used to hold a full-width
 * seat for the rest of the game, so at a table of eight the hands that mattered
 * competed for width with three holding nothing. Order is preserved inside each
 * group. A spectator has no seat to anchor on and keeps absolute order.
 */
export const inTurnOrder = (game: GameView): PlayerView[] => {
  const seat = game.players.findIndex((player) => player.id === game.you);
  const order =
    seat < 0
      ? game.players
      : [...game.players.slice(seat + 1), ...game.players.slice(0, seat)];
  return [
    ...order.filter((player) => !player.eliminated),
    ...order.filter((player) => player.eliminated),
  ];
};

/** Who the strip anchors its scroll on. Anchoring on an out player spent the
 * width on somebody with no hand to read (#132); since #192 the first seat is
 * almost always the answer already, but "almost always" is not a rule. */
export const nextStillIn = (strip: PlayerView[]): PlayerView | null =>
  strip.find((player) => !player.eliminated) ?? null;
