import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

const num = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  port: num(process.env.PORT, 8063),
  host: process.env.HOST ?? "0.0.0.0",

  /** Where the built web bundle lives. Served by this process in production. */
  webRoot: process.env.WEB_ROOT ?? path.resolve(here, "../../web/dist"),

  /** Directory for room snapshots, so a redeploy doesn't kill a live game. */
  dataDir: process.env.DATA_DIR ?? path.resolve(here, "../../../data"),

  /** In dev the Vite server owns the page and proxies here, so skip static. */
  serveStatic: process.env.SERVE_STATIC !== "false",
} as const;
