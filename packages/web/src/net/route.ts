/**
 * Which room this browser is pointed at, and what it came to do. Three shapes,
 * all of them a link you can text or point a camera at:
 *
 *   - `#/r/ABCD`         — a seat. Join it, or reclaim the one you had.
 *   - `#/r/ABCD/watch`   — a person watching, holding no cards.
 *   - `#/r/ABCD/table`   — the same connection, drawn as the shared screen (#14).
 *
 * The last two are both `watch` on the wire; the table one adds a `table` bit so
 * the server can offer it the draw-only action (#120). The mode lives in the URL
 * because a device propped in the middle of a table is opened once and left
 * there, and what it is for has to survive a reload.
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
    // An unrecognised suffix isn't a mode and a room code with rubbish after it
    // isn't a room: `HASH` refuses the whole thing rather than salvaging a code,
    // so a typo lands on the join form instead of somewhere strange.
    mode: mode === "watch" || mode === "table" ? mode : "play",
  };
};

/** `#/r/ABCD` — the shape of a link you can text to somebody. */
export const codeFromHash = (): string | null => routeFromHash().code;

export const hashFor = (code: string, mode: ViewMode = "play"): string =>
  mode === "play" ? `#/r/${code}` : `#/r/${code}/${mode}`;

/** Built from `location` rather than a configured origin, so it is right on
 * localhost, on the LAN address a phone uses, and in production. */
export const joinLink = (code: string, mode: ViewMode = "play"): string =>
  `${location.origin}/${hashFor(code, mode)}`;

/** Keeps whatever this screen came here to be: a watcher whose mode was
 * rewritten to a seat on the first `welcome` would watch until the next reload
 * and then sit down. */
export const setHashCode = (code: string | null, mode: ViewMode = "play"): void => {
  const next = code ? hashFor(code, mode) : "";
  if (location.hash !== next) history.replaceState(null, "", next || location.pathname);
};
