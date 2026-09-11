import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { Writable } from "node:stream";
import {
  loadConfig,
  resolveConfig,
  writeConfig,
  writeKeychainToken,
} from "../lib/config.js";
import {
  ensurePagesProject,
  listCloudflareAccounts,
  type CloudflareAccount,
} from "../lib/cloudflare.js";

export type SetupOptions = {
  apiToken?: string;
  accountId?: string;
  project?: string;
  branch?: string;
  baseUrl?: string;
  indexPassword?: string;
  yes?: boolean;
  json?: boolean;
};

type SetupDeps = {
  ask: (question: string) => Promise<string>;
  askSecret: (question: string) => Promise<string>;
  listAccounts: typeof listCloudflareAccounts;
  ensureProject: typeof ensurePagesProject;
  saveConfig: typeof writeConfig;
  saveKeychainToken: typeof writeKeychainToken;
};

export async function setupCommand(
  opts: SetupOptions,
  injected: Partial<SetupDeps> = {},
): Promise<void> {
  let muted = false;
  const promptOutput = new Writable({
    write(chunk, _encoding, callback) {
      if (!muted) stdout.write(chunk);
      callback();
    },
  });
  const rl = injected.ask ? null : createInterface({
    input: stdin,
    output: promptOutput,
    terminal: true,
  });
  const ask = injected.ask ?? ((question: string) => rl!.question(question));
  const askSecret = injected.askSecret ?? injected.ask ?? (async (question: string) => {
    const answer = rl!.question(question);
    muted = true;
    try {
      return await answer;
    } finally {
      muted = false;
      stdout.write("\n");
    }
  });
  const deps: SetupDeps = {
    ask,
    askSecret,
    listAccounts: injected.listAccounts ?? listCloudflareAccounts,
    ensureProject: injected.ensureProject ?? ensurePagesProject,
    saveConfig: injected.saveConfig ?? writeConfig,
    saveKeychainToken: injected.saveKeychainToken ?? writeKeychainToken,
  };

  try {
    const nonInteractive = Boolean(opts.yes || opts.json);
    const saved = loadConfig();
    const current = resolveConfig();
    const token = opts.apiToken?.trim() || current.apiToken ||
      (nonInteractive ? "" : (await deps.askSecret("Cloudflare API token: ")).trim());
    if (!token) throw new Error("Cloudflare API token is required. Set CLOUDFLARE_API_TOKEN or pass --api-token.");

    const accounts = await deps.listAccounts(token);
    const accountId = await chooseAccount(opts.accountId || current.accountId, accounts, nonInteractive, ask);
    const project = opts.project?.trim() || current.project;
    const branch = opts.branch?.trim() || current.branch;
    const baseUrl = (
      opts.baseUrl?.trim() ||
      process.env.ALAB_PAGES_BASE_URL?.trim() ||
      saved.pagesBaseUrl ||
      `https://${project}.pages.dev`
    ).replace(/\/$/, "");
    if (!opts.json) {
      console.log(`Cloudflare target: account ${accountId}, project ${project}, production branch ${branch}.`);
    }
    if (!nonInteractive) {
      const confirmed = (await ask("Create or reuse this Pages project? [y/N] ")).trim().toLowerCase();
      if (confirmed !== "y" && confirmed !== "yes") throw new Error("Setup cancelled.");
    }
    const status = await deps.ensureProject({ token, accountId, project, branch });

    const savedToken = deps.saveKeychainToken(token);
    deps.saveConfig({
      cloudflareAccountId: accountId,
      cloudflareApiToken: savedToken || process.env.CLOUDFLARE_API_TOKEN ? undefined : token,
      pagesProject: project,
      pagesBranch: branch,
      pagesBaseUrl: baseUrl,
      ...(opts.indexPassword !== undefined ? { indexPassword: opts.indexPassword } : {}),
    });
    const tokenStore = savedToken ? "macOS Keychain" : process.env.CLOUDFLARE_API_TOKEN ? "environment" : "config file";
    if (opts.json) {
      console.log(JSON.stringify({ accountId, project, branch, baseUrl, status, tokenStore }, null, 2));
    } else {
      console.log(`Cloudflare Pages project ${project}: ${status}`);
      console.log(`Configuration saved. Token stored in ${tokenStore}.`);
    }
  } finally {
    rl?.close();
  }
}

async function chooseAccount(
  preferred: string,
  accounts: CloudflareAccount[],
  yes: boolean | undefined,
  ask: (question: string) => Promise<string>,
): Promise<string> {
  if (preferred) {
    if (accounts.some((a) => a.id === preferred)) return preferred;
    if (accounts.length === 0) {
      if (!yes) {
        console.log(`Cloudflare account discovery returned no accounts. Trying saved account ${preferred} directly.`);
      }
      return preferred;
    }
    if (yes) {
      throw new Error(`Cloudflare account ${preferred} is not accessible with this token.`);
    }
    console.log(`Saved Cloudflare account ${preferred} is not accessible with this token. Choose another account.`);
  }
  if (accounts.length === 0) throw new Error("No Cloudflare accounts are accessible with this token.");
  if (accounts.length === 1) return accounts[0]!.id;
  if (yes) throw new Error("Multiple Cloudflare accounts found. Set CLOUDFLARE_ACCOUNT_ID or pass --account-id.");
  accounts.forEach((account, i) => console.log(`${i + 1}. ${account.name} (${account.id})`));
  const selected = Number.parseInt(await ask("Choose account number: "), 10);
  if (!Number.isInteger(selected) || selected < 1 || selected > accounts.length) {
    throw new Error("Invalid account selection.");
  }
  return accounts[selected - 1]!.id;
}
