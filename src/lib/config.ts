import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { configPath } from "./paths.js";

export type AlabConfig = {
  cloudflareAccountId?: string;
  /** Prefer CLOUDFLARE_API_TOKEN env; this is a fallback only. */
  cloudflareApiToken?: string;
  pagesProject?: string;
  pagesBaseUrl?: string;
  /** Production branch of the Pages project. Must match, or deploys go to preview. */
  pagesBranch?: string;
  /** If set, root index lists ids behind this password (client-side AES). */
  indexPassword?: string;
};

const DEFAULT_PROJECT = "agentlab-pages";
const DEFAULT_BRANCH = "main";
const KEYCHAIN_SERVICE = "alab-pages-cloudflare-token";

export function loadConfig(): AlabConfig {
  const file = configPath();
  if (!fs.existsSync(file)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as AlabConfig;
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    throw new Error(`Invalid JSON in ${file}`);
  }
}

export function writeConfig(updates: Partial<AlabConfig>): void {
  const file = configPath();
  const current = loadConfig();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({ ...current, ...updates }, null, 2) + "\n",
    { encoding: "utf8", mode: 0o600 },
  );
  fs.chmodSync(file, 0o600);
}

/** Store a Cloudflare token in macOS Keychain without printing it. */
export function writeKeychainToken(token: string): boolean {
  if (process.platform !== "darwin") return false;
  const result = spawnSync(
    "security",
    [
      "add-generic-password",
      "-U",
      "-a",
      process.env.USER || "",
      "-s",
      KEYCHAIN_SERVICE,
      "-w",
      token,
    ],
    { stdio: "ignore" },
  );
  return result.status === 0;
}

export function resolveConfig(overrides: Partial<AlabConfig> = {}): {
  accountId: string;
  apiToken: string;
  project: string;
  baseUrl: string;
  indexPassword: string | undefined;
  branch: string;
} {
  const file = loadConfig();
  const accountId =
    process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ||
    overrides.cloudflareAccountId ||
    file.cloudflareAccountId ||
    "";
  const apiToken =
    process.env.CLOUDFLARE_API_TOKEN?.trim() ||
    overrides.cloudflareApiToken ||
    readKeychainToken() ||
    file.cloudflareApiToken ||
    "";
  const project =
    process.env.ALAB_PAGES_PROJECT?.trim() ||
    overrides.pagesProject ||
    file.pagesProject ||
    DEFAULT_PROJECT;
  const baseUrl = (
    process.env.ALAB_PAGES_BASE_URL?.trim() ||
    overrides.pagesBaseUrl ||
    file.pagesBaseUrl ||
    `https://${project}.pages.dev`
  ).replace(/\/$/, "");
  const indexPassword =
    process.env.ALAB_PAGES_INDEX_PASSWORD?.trim() ||
    overrides.indexPassword ||
    file.indexPassword ||
    undefined;
  const branch =
    process.env.ALAB_PAGES_BRANCH?.trim() ||
    overrides.pagesBranch ||
    file.pagesBranch ||
    DEFAULT_BRANCH;

  return { accountId, apiToken, project, baseUrl, indexPassword, branch };
}

/** Read the token from macOS Keychain without ever printing it. */
function readKeychainToken(): string {
  if (process.platform !== "darwin") return "";

  const result = spawnSync(
    "security",
    [
      "find-generic-password",
      "-a",
      process.env.USER || "",
      "-s",
      KEYCHAIN_SERVICE,
      "-w",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );

  return result.status === 0 ? result.stdout.trim() : "";
}

export function pageUrl(baseUrl: string, id: string): string {
  return `${baseUrl.replace(/\/$/, "")}/${id}/`;
}

export function requireDeployAuth(cfg: {
  accountId: string;
  apiToken: string;
}): void {
  const missing: string[] = [];
  if (!cfg.apiToken) missing.push("CLOUDFLARE_API_TOKEN");
  if (!cfg.accountId) missing.push("CLOUDFLARE_ACCOUNT_ID");
  if (missing.length) {
    throw new Error(
      `Missing ${missing.join(" and ")}. Set env vars or add them to ${configPath()}.`,
    );
  }
}
