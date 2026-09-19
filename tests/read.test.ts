import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readCommand } from "../src/commands/read.js";
import { writeLocalState } from "../src/lib/state.js";
import { putSite } from "../src/lib/store.js";

describe("readCommand", () => {
  let root: string;
  let site: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "alab-pages-read-"));
    site = path.join(root, "site");
    fs.mkdirSync(site);
    fs.writeFileSync(path.join(site, "index.html"), "<h1>Hello</h1>");
    process.env.ALAB_HOME = path.join(root, "home");
    process.env.ALAB_PAGES_CONTENT = path.join(root, "content");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.ALAB_HOME;
    delete process.env.ALAB_PAGES_CONTENT;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("prints locally stored page metadata as JSON", () => {
    putSite("test123", site);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    readCommand({ id: "TEST123", json: true });

    const result = JSON.parse(String(log.mock.calls[0][0])) as {
      id: string;
      fileCount: number;
      bytes: number;
      url: string;
    };
    expect(result).toMatchObject({
      id: "test123",
      fileCount: 1,
      bytes: 14,
      url: "https://agentlab-pages.pages.dev/test123/",
    });
  });

  it("resolves the id from directory state", () => {
    putSite("state123", site);
    writeLocalState(site, { id: "state123" });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    readCommand({ dir: site });

    expect(log).toHaveBeenCalledWith("ID       state123");
    expect(log).toHaveBeenCalledWith(
      "URL      https://agentlab-pages.pages.dev/state123/",
    );
  });

  it("rejects an id absent from the local manifest", () => {
    expect(() => readCommand({ id: "missing1" })).toThrow(
      'Unknown page id "missing1". Run alab pages list.',
    );
  });
});
