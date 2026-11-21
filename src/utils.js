import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";

export function loadEnv(envPath = ".env") {
  if (!existsSync(envPath)) return {};

  const parsed = {};
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
    parsed[key] = value;
  }

  return parsed;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildRobloxUri({ placeId, userId, gameInstanceId, linkCode, type }) {
  const params = new URLSearchParams();
  if (placeId !== undefined) params.set("placeId", placeId);
  if (userId !== undefined) params.set("userId", userId);
  if (gameInstanceId !== undefined) params.set("gameInstanceId", gameInstanceId);
  if (linkCode !== undefined) params.set("linkCode", linkCode);
  params.set("type", type || "InGame");
  return `roblox://${params.toString()}`;
}
