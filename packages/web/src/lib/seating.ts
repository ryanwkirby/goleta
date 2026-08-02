import type { GameView, PlayerView } from "@goleta/engine";

/**
 * Everyone else, in the order play will reach them: whoever follows you first,
 * whoever plays just before you last.
 *
 * `game.players` is absolute seat order and the turn walks it forwards, so
 * simply filtering yourself out put the next player wherever your own seat
 * index happened to leave them — leftmost from seat 0, rightmost from seat 2 of
 * 4. Play swept a different way across the strip for every player at the same
 * table, and nobody chose that; it was just what the filter left behind.
 *
 * Anchored on your own seat, which never changes, it's the same for everyone
 * and in the direction people read: play moves left to right, off the
 * right-hand end, and round to your own cards at the bottom of the screen —
 * which is where the person on your left sits at a real table. The order is
 * fixed for the whole game, so the strip never reshuffles under you.
 *
 * The rotation is by seat and not by who is still alive, so if the player
 * straight after you is out, an `out` seat sits at the left edge. That's the
 * honest picture — they're still at the table — and the price of a strip that
 * never reorders.
 *
 * A table view or a spectator has no seat to anchor on, and keeps absolute
 * seat order.
 */
export const inTurnOrder = (game: GameView): PlayerView[] => {
  const seat = game.players.findIndex((player) => player.id === game.you);
  if (seat < 0) return game.players;
  return [...game.players.slice(seat + 1), ...game.players.slice(0, seat)];
};
