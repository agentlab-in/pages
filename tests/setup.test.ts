import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupCommand } from "../src/commands/setup.js";
import { loadConfig } from "../src/lib/config.js";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "alab-setup-"));
  process.env.ALAB_HOME = tmp;
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  delete process.env.ALAB_HOME;
  delete process.env.CLOUDFLARE_API_TOKEN;
  vi.restoreAllMocks();
});

describe("setup command", () => {
  it("uses automation inputs, provisions the project, and saves compatible config", async () => {
    const ensureProject = vi.fn().mockResolvedValue("created" as const);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await setupCommand(
      {
        apiToken: "secret",
        accountId: "acct",
        project: "agentlab-pages",
        branch: "production",
        baseUrl: "https://pages.example.test",
        indexPassword: "gate",
        yes: true,
      },
      {
        ask: async () => { throw new Error("unexpected prompt"); },
        listAccounts: async () => [{ id: "acct", name: "AgentLab" }],
        ensureProject,
        saveKeychainToken: () => false,
      },
    );

    expect(ensureProject).toHaveBeenCalledWith({
      token: "secret",
      accountId: "acct",
      project: "agentlab-pages",
      branch: "production",
    });
    expect(loadConfig()).toEqual({
      cloudflareAccountId: "acct",
      cloudflareApiToken: "secret",
      pagesProject: "agentlab-pages",
      pagesBranch: "production",
      pagesBaseUrl: "https://pages.example.test",
      indexPassword: "gate",
    });
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining("secret"));
  });

  it("requires an explicit account in automation mode when several exist", async () => {
    await expect(setupCommand(
      { apiToken: "secret", yes: true },
      {
        ask: async () => { throw new Error("unexpected prompt"); },
        listAccounts: async () => [
          { id: "one", name: "One" },
          { id: "two", name: "Two" },
        ],
        ensureProject: vi.fn(),
      },
    )).rejects.toThrow(/Multiple Cloudflare accounts/);
  });

  it("derives the default pages.dev URL from the selected project", async () => {
    await setupCommand(
      { apiToken: "secret", accountId: "acct", project: "my-pages", yes: true },
      {
        listAccounts: async () => [{ id: "acct", name: "AgentLab" }],
        ensureProject: async () => "existing",
        saveKeychainToken: () => false,
      },
    );

    expect(loadConfig().pagesBaseUrl).toBe("https://my-pages.pages.dev");
  });

  it("replaces an inaccessible saved account during interactive setup", async () => {
    fs.writeFileSync(
      path.join(tmp, "config.json"),
      JSON.stringify({ cloudflareAccountId: "stale-account" }),
    );
    const ensureProject = vi.fn().mockResolvedValue("existing" as const);
    const answers = ["2", "yes"];

    await setupCommand(
      { apiToken: "secret" },
      {
        ask: async () => answers.shift()!,
        listAccounts: async () => [
          { id: "first", name: "First" },
          { id: "second", name: "Second" },
        ],
        ensureProject,
        saveKeychainToken: () => false,
      },
    );

    expect(ensureProject).toHaveBeenCalledWith(expect.objectContaining({ accountId: "second" }));
    expect(loadConfig().cloudflareAccountId).toBe("second");
  });

  it("uses an explicit account when the token cannot list accounts", async () => {
    const ensureProject = vi.fn().mockResolvedValue("existing" as const);

    await setupCommand(
      { apiToken: "secret", accountId: "scoped-account", yes: true },
      {
        listAccounts: async () => [],
        ensureProject,
        saveKeychainToken: () => false,
      },
    );

    expect(ensureProject).toHaveBeenCalledWith(expect.objectContaining({ accountId: "scoped-account" }));
  });
});
