import fs from "node:fs";
import { configPath } from "./paths.js";

export type AlabConfig = {
  cloudflareAccountId?: string;
  /** Prefer CLOUDFLARE_API_TOKEN env; this is a fallback only. */
  cloudflareApiToken?: string;
  pagesProject?: string;
  pagesBaseUrl?: string;
  /** If set, root index lists ids behind this password (client-side AES). */
  indexPassword?: string;
};

const DEFAULT_PROJECT = "agentlab-pages";
const DEFAULT_BASE_URL = "https://pages.agentlab.in";

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

export function resolveConfig(overrides: Partial<AlabConfig> = {}): {
  accountId: string;
  apiToken: string;
  project: string;
  baseUrl: string;
  indexPassword: string | undefined;
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
    DEFAULT_BASE_URL
  ).replace(/\/$/, "");
  const indexPassword =
    process.env.ALAB_PAGES_INDEX_PASSWORD?.trim() ||
    overrides.indexPassword ||
    file.indexPassword ||
    undefined;

  return { accountId, apiToken, project, baseUrl, indexPassword };
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
