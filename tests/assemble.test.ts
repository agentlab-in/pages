import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assembleDeployRoot } from "../src/lib/assemble.js";
import { putSite } from "../src/lib/store.js";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "alab-assemble-"));
  process.env.ALAB_HOME = tmp;
  process.env.ALAB_PAGES_CONTENT = path.join(tmp, "content");
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  delete process.env.ALAB_HOME;
  delete process.env.ALAB_PAGES_CONTENT;
});

describe("assemble", () => {
  it("copies sites and writes public landing without password", () => {
    const src = path.join(tmp, "src");
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(path.join(src, "index.html"), "<h1>a</h1>");
    putSite("page01", src);

    const out = path.join(tmp, "out");
    const { pageCount } = assembleDeployRoot({
      outDir: out,
      baseUrl: "https://pages.agentlab.in",
    });
    expect(pageCount).toBe(1);
    expect(fs.existsSync(path.join(out, "page01", "index.html"))).toBe(true);
    const index = fs.readFileSync(path.join(out, "index.html"), "utf8");
    expect(index).toContain("agentlab pages");
    expect(index).not.toContain("Unlock");
  });

  it("writes password gate when indexPassword set", () => {
    const src = path.join(tmp, "src");
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(path.join(src, "index.html"), "<h1>a</h1>");
    putSite("page02", src);

    const out = path.join(tmp, "out");
    assembleDeployRoot({
      outDir: out,
      baseUrl: "https://pages.agentlab.in",
      indexPassword: "secret",
    });
    const index = fs.readFileSync(path.join(out, "index.html"), "utf8");
    expect(index).toContain("Unlock");
    expect(index).toContain("BLOB_B64");
    // plaintext id must not appear outside ciphertext
    expect(index.includes("page02")).toBe(false);
  });
});
