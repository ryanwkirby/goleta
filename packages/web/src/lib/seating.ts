import type { GameView, PlayerView } from "@goleta/engine";

/**
 * Everyone else, in the order play will reach them: whoever follows you first,
 * whoever plays just before you last.
 *
 * Anchored on your own seat rather than on absolute seat order, which is what
 * made play sweep a different way across the strip for every player at the same
 * table. Fixed for the whole game, so the strip never reshuffles under you.
 *
 * **Still in first, then out** (#192), which is a deliberate reversal: an out
 * player used to hold a full-width seat for the rest of the game, and at a table
 * of eight the hands that still mattered were competing for width with three
 * seats holding nothing. They are still on screen and still named; what they
 * stop doing is spending a hand's width on a hand they don't have. Order is
 * preserved inside each group.
 *
 * A table view or a spectator has no seat to anchor on and keeps absolute seat
 * order, partitioned the same way.
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

/**
 * The first seat in that strip still holding cards — who the strip anchors its
 * scroll on. It exists because anchoring on an out player spent the width on
 * somebody with no hand to read (#132); since #192 the first seat is almost
 * always the answer already, but "almost always" is not a rule.
 *
 * Null when everybody else is out, which is the last turn of the game.
 */
export const nextStillIn = (strip: PlayerView[]): PlayerView | null =>
  strip.find((player) => !player.eliminated) ?? null;
