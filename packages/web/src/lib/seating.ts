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
 * **Still in first, then out** (#192). This is a reversal, and a deliberate
 * one: the rotation used to be strictly by seat, so an out player straight
 * after you sat at the left edge holding a full-width seat for the rest of the
 * game. That was the honest picture and it was paid for in the only currency
 * this strip has — at a table of eight, late on, the hands that still mattered
 * were competing for width with three seats holding nothing.
 *
 * The honest picture survives: an out player is still on screen, still named,
 * still at the table. What they stop doing is spending a hand's width on a hand
 * they do not have. And the cost is real and is being paid on purpose — the
 * strip reorders once per elimination, at a moment everybody is already
 * watching, rather than getting steadily worse to read for the rest of the
 * game.
 *
 * Order is preserved inside each group, so the seats you are still playing
 * against stay in turn order from your own seat, and the ones who are out stay
 * in seat order among themselves.
 *
 * A table view or a spectator has no seat to anchor on, and keeps absolute
 * seat order — partitioned the same way, because the shared screen's hands view
 * draws this same strip.
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
 * The first seat in that strip still holding cards — who the seat strip anchors
 * on while the table is waiting on you.
 *
 * It is unchanged by #192 and simpler for it. It existed because the strip used
 * to keep an out player at the left-hand end, so anchoring the *scroll* there
 * spent the width on somebody with no hand to read and pushed the player you
 * were actually deciding against off the far edge (#132). Now that out seats
 * are collapsed to the end, the first seat in the strip is almost always the
 * answer already — but "almost always" is not a rule, and the one it is stated
 * as still holds: **the first seat still holding cards**, whatever order the
 * strip happens to be in.
 *
 * Null when everybody else is out, which is the last turn of the game: there is
 * nothing left to look at and the strip stays where it is.
 */
export const nextStillIn = (strip: PlayerView[]): PlayerView | null =>
  strip.find((player) => !player.eliminated) ?? null;
