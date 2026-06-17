import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import os from "os";

const TOKEN_DIR = process.env.APPDATA
  ? join(process.env.APPDATA, "warframe-market-mcp")
  : join(os.homedir(), ".warframe-market-mcp");
const TOKEN_FILE = join(TOKEN_DIR, "session.json");

export function loadSession() {
  try { return JSON.parse(readFileSync(TOKEN_FILE, "utf8")); } catch { return null; }
}

export function saveSession(s) {
  mkdirSync(TOKEN_DIR, { recursive: true });
  writeFileSync(TOKEN_FILE, JSON.stringify(s), { mode: 0o600 });
}

export function clearSession() {
  try { writeFileSync(TOKEN_FILE, "{}", { mode: 0o600 }); } catch { /* best-effort */ }
}
