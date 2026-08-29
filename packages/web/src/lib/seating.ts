import type { GameView, PlayerView, RoomView } from "@goleta/engine";

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

/**
 * Whether this browser is the host, asked in the one place rather than as
 * `room.hostId === playerId` at six call sites (#326).
 *
 * **Both sides can be null now**, which is exactly why this exists. A room
 * opened from the shared table screen has no host until somebody joins, and a
 * watcher has no `playerId` — so the obvious comparison is `null === null` and
 * says *you are the host* to every spectator of an ownerless room. They would be
 * offered the host's controls and the server would refuse every one of them.
 *
 * Nobody is the host of a room nobody owns, and a browser holding no seat is
 * never the host of anything.
 */
export const isHost = (room: RoomView, playerId: string | null): boolean =>
  playerId !== null && room.hostId !== null && room.hostId === playerId;
