import fs from "node:fs";
import path from "node:path";

export type LocalPageState = {
  id: string;
  url?: string;
};

const STATE_DIR = ".alab";
const STATE_FILE = "pages.json";

export function stateFilePath(dir: string): string {
  return path.join(dir, STATE_DIR, STATE_FILE);
}

export function readLocalState(dir: string): LocalPageState | null {
  const file = stateFilePath(dir);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as LocalPageState;
    if (!raw || typeof raw.id !== "string") return null;
    return raw;
  } catch {
    return null;
  }
}

export function writeLocalState(dir: string, state: LocalPageState): void {
  const file = stateFilePath(dir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2) + "\n", "utf8");
}

export function clearLocalState(dir: string): void {
  const file = stateFilePath(dir);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  const stateDir = path.join(dir, STATE_DIR);
  if (fs.existsSync(stateDir) && fs.readdirSync(stateDir).length === 0) {
    fs.rmdirSync(stateDir);
  }
}
