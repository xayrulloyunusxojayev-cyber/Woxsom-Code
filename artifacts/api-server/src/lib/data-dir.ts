import path from "node:path";
import { mkdirSync } from "node:fs";

/**
 * Resolves the persistent data directory.
 *
 * Priority order:
 *  1. DATA_DIR env var  — explicit override, useful for any platform
 *  2. RENDER=true       — Render production: use the mounted persistent disk at /var/data
 *  3. Default           — local dev: <workspace-root>/artifacts/api-server/data
 */
function resolveDataDir(): string {
  if (process.env["DATA_DIR"]) {
    return process.env["DATA_DIR"];
  }

  if (process.env["RENDER"] === "true") {
    return "/var/data";
  }

  const workspaceRoot = process.cwd().endsWith(
    path.join("artifacts", "api-server"),
  )
    ? path.resolve(process.cwd(), "../..")
    : process.cwd();

  return path.resolve(workspaceRoot, "artifacts/api-server/data");
}

export const DATA_DIR = resolveDataDir();

mkdirSync(DATA_DIR, { recursive: true });
