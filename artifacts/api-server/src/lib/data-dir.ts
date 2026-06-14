import path from "node:path";
import { mkdirSync } from "node:fs";

/**
 * Resolves the persistent data directory.
 *
 * Priority order:
 *  1. RENDER_DATA_DIR env var — explicit Render persistent disk path (e.g. /mnt/data)
 *  2. DATA_DIR env var        — generic override for any platform
 *  3. Default                 — ./data relative to the api-server package root
 *                               (works in both local dev and Render when no disk is mounted)
 */
function resolveDataDir(): string {
  if (process.env["RENDER_DATA_DIR"]) {
    return process.env["RENDER_DATA_DIR"];
  }

  if (process.env["DATA_DIR"]) {
    return process.env["DATA_DIR"];
  }

  const pkgRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
    ? process.cwd()
    : path.resolve(import.meta.dirname, "../..");

  return path.resolve(pkgRoot, "data");
}

export const DATA_DIR = resolveDataDir();

mkdirSync(DATA_DIR, { recursive: true });
