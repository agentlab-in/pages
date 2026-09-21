import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { putCommand } from "../src/commands/put.js";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "alab-put-"));
  process.env.ALAB_HOME = path.join(tmp, "home");
  process.env.ALAB_PAGES_CONTENT = path.join(tmp, "content");
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  delete process.env.ALAB_HOME;
  delete process.env.ALAB_PAGES_CONTENT;
  vi.restoreAllMocks();
});

describe("put command", () => {
  it("returns the active custom domain discovered during deployment", async () => {
    fs.mkdirSync(process.env.ALAB_HOME!, { recursive: true });
    fs.writeFileSync(
      path.join(process.env.ALAB_HOME!, "config.json"),
      JSON.stringify({ pagesBaseUrl: "https://pages.agentlab.in" }),
    );
    const site = path.join(tmp, "site");
    fs.mkdirSync(site);
    fs.writeFileSync(path.join(site, "index.html"), "<h1>test</h1>\n");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await putCommand(
      { dir: site, id: "hnflgm", json: true },
      {
        deploy: async () => ({
          pageCount: 1,
          outDir: path.join(tmp, "deploy"),
          stdout: "{}",
          baseUrl: "https://pages.hsbhandari.dev",
        }),
      },
    );

    expect(JSON.parse(String(log.mock.calls[0]![0]))).toMatchObject({
      id: "hnflgm",
      url: "https://pages.hsbhandari.dev/hnflgm/",
      deployed: true,
    });
    expect(JSON.parse(fs.readFileSync(path.join(site, ".alab", "pages.json"), "utf8"))).toEqual({
      id: "hnflgm",
      url: "https://pages.hsbhandari.dev/hnflgm/",
    });
    expect(JSON.parse(fs.readFileSync(path.join(process.env.ALAB_HOME!, "config.json"), "utf8"))).toEqual({
      pagesBaseUrl: "https://pages.hsbhandari.dev",
    });
  });
});
