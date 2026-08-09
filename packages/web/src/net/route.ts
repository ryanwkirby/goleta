/**
 * Which room this browser is pointed at, and what it came to do.
 *
 * Three shapes, all of them a link you can text to somebody or point a camera
 * at:
 *
 *   - `#/r/ABCD`         — a seat. Join it, or reclaim the one you had.
 *   - `#/r/ABCD/watch`   — a person watching the table, holding no cards.
 *   - `#/r/ABCD/table`   — the same connection, drawn as the shared screen for
 *                          the middle of the table (#14).
 *
 * The last two are the same `watch` on the wire and differ only in what gets
 * drawn, which is why the mode lives in the URL rather than in a message: a
 * device propped in the middle of a table is opened once and left there, and
 * "what this screen is for" has to survive a reload without anybody touching it.
 */

export type ViewMode = "play" | "watch" | "table";

export interface Route {
  /** The room, if this URL names one. */
  code: string | null;
  mode: ViewMode;
}

const HASH = /^#\/r\/([A-Za-z0-9]{4})(?:\/(watch|table))?$/;

export const routeFromHash = (hash: string = location.hash): Route => {
  const match = HASH.exec(hash);
  const mode = match?.[2];
  return {
    code: match?.[1]?.toUpperCase() ?? null,
    // An unrecognised suffix isn't a mode, and a room code with rubbish after it
    // isn't a room: `HASH` refuses the whole thing rather than salvaging a code
    // out of it, so a typo lands on the join form instead of somewhere strange.
    mode: mode === "watch" || mode === "table" ? mode : "play",
  };
};

/** `#/r/ABCD` — the shape of a link you can text to somebody. */
export const codeFromHash = (): string | null => routeFromHash().code;

export const hashFor = (code: string, mode: ViewMode = "play"): string =>
  mode === "play" ? `#/r/${code}` : `#/r/${code}/${mode}`;

/**
 * The whole link, for texting to somebody or printing into a QR.
 *
 * Built from `location` rather than from a configured origin, so it is right on
 * localhost, on the LAN address a phone uses against the dev server, and on
 * goleta.ryankirby.net, without any of them being written down anywhere.
 */
export const joinLink = (code: string, mode: ViewMode = "play"): string =>
  `${location.origin}/${hashFor(code, mode)}`;

/**
 * Puts the room in the address bar, keeping whatever this screen came here to
 * be. A watcher that had its mode rewritten to a seat on the first `welcome`
 * would watch until the next reload and then sit down.
 */
export const setHashCode = (code: string | null, mode: ViewMode = "play"): void => {
  const next = code ? hashFor(code, mode) : "";
  if (location.hash !== next) history.replaceState(null, "", next || location.pathname);
};
