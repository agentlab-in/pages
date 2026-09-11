import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  deleteSite,
  listSites,
  putSite,
  readManifest,
} from "../src/lib/store.js";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "alab-store-"));
  process.env.ALAB_HOME = tmp;
  process.env.ALAB_PAGES_CONTENT = path.join(tmp, "content");
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  delete process.env.ALAB_HOME;
  delete process.env.ALAB_PAGES_CONTENT;
});

function writeFixture(dir: string, files: Record<string, string>): void {
  fs.mkdirSync(dir, { recursive: true });
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body);
  }
}

describe("store", () => {
  it("puts a site and records manifest", () => {
    const src = path.join(tmp, "src");
    writeFixture(src, {
      "index.html": "<h1>hi</h1>",
      "style.css": "body{}",
    });

    const stats = putSite("demo01", src);
    expect(stats.fileCount).toBe(2);
    expect(readManifest().pages.demo01?.id).toBe("demo01");
    expect(
      fs.readFileSync(
        path.join(process.env.ALAB_PAGES_CONTENT!, "sites", "demo01", "index.html"),
        "utf8",
      ),
    ).toContain("hi");
  });

  it("replaces files on second put", () => {
    const src = path.join(tmp, "src");
    writeFixture(src, { "index.html": "v1" });
    putSite("x1y2z3", src);
    writeFixture(src, { "index.html": "v2", "a.js": "1" });
    putSite("x1y2z3", src);
    const body = fs.readFileSync(
      path.join(process.env.ALAB_PAGES_CONTENT!, "sites", "x1y2z3", "index.html"),
      "utf8",
    );
    expect(body).toBe("v2");
    expect(readManifest().pages.x1y2z3?.fileCount).toBe(2);
  });

  it("requires index.html", () => {
    const src = path.join(tmp, "src");
    writeFixture(src, { "only.css": "x" });
    expect(() => putSite("abcd12", src)).toThrow(/index.html/);
  });

  it("rejects symbolic links instead of copying content outside the source", () => {
    const src = path.join(tmp, "src");
    const outside = path.join(tmp, "outside.txt");
    writeFixture(src, { "index.html": "safe" });
    fs.writeFileSync(outside, "private");
    fs.symlinkSync(outside, path.join(src, "linked.txt"));

    expect(() => putSite("safe12", src)).toThrow(/Symbolic links are not allowed/);
  });

  it("deletes and lists", () => {
    const src = path.join(tmp, "src");
    writeFixture(src, { "index.html": "a" });
    putSite("aaaa11", src);
    putSite("bbbb22", src);
    expect(listSites().map((p) => p.id).sort()).toEqual(["aaaa11", "bbbb22"]);
    deleteSite("aaaa11");
    expect(listSites().map((p) => p.id)).toEqual(["bbbb22"]);
  });
});
