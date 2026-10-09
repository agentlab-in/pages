import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { putCommand } from "../src/commands/put.js";
import { loadMarkdownFile, renderMarkdownPage, titleFromMarkdown } from "../src/lib/markdown.js";
import { MAX_BYTES } from "../src/lib/store.js";
import { siteDir } from "../src/lib/paths.js";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "alab-md-"));
  process.env.ALAB_HOME = path.join(tmp, "home");
  process.env.ALAB_PAGES_CONTENT = path.join(tmp, "content");
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  delete process.env.ALAB_HOME;
  delete process.env.ALAB_PAGES_CONTENT;
  vi.restoreAllMocks();
});

const deploySkip = async () => ({
  pageCount: 1,
  outDir: path.join(tmp, "deploy"),
  stdout: "{}",
  baseUrl: "https://pages.example",
});

describe("markdown publish", () => {
  it("derives a title from the first heading and ignores front matter", () => {
    const text = "---\ntitle: Secret\nrun: rm -rf\n---\n\n# Real Title\n\nbody\n";
    expect(titleFromMarkdown(text, "notes.md")).toBe("Real Title");
    expect(titleFromMarkdown("---\ntitle: Secret\n---\n\nno heading\n", "notes.markdown")).toBe("notes");
  });

  it("publishes .md and .markdown without altering source bytes", async () => {
    const md = path.join(tmp, "notes.md");
    const source = "---\ntitle: Ignored\n---\n\n# Ship notes\n\nSee [docs](https://example.com).\n\n```js\nconst n = 1;\n```\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n<script>alert(1)</script>\n";
    fs.writeFileSync(md, source);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await putCommand({ dir: md, json: true, skipDeploy: true }, { deploy: deploySkip });

    const body = JSON.parse(String(log.mock.calls[0]![0])) as { id: string; title: string; source: string };
    expect(body.title).toBe("Ship notes");
    expect(body.source).toBe("notes.md");
    const stored = fs.readFileSync(path.join(siteDir(body.id), "notes.md"));
    expect(stored.equals(Buffer.from(source))).toBe(true);
    const html = fs.readFileSync(path.join(siteDir(body.id), "index.html"), "utf8");
    expect(html).toContain("<h1>Ship notes</h1>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("```js");
    expect(JSON.parse(fs.readFileSync(path.join(tmp, ".alab", "markdown", "notes.md.json"), "utf8")).id).toBe(body.id);

    const markdown = path.join(tmp, "extra.markdown");
    fs.writeFileSync(markdown, "plain body\n");
    log.mockClear();
    await putCommand({ dir: markdown, json: true, skipDeploy: true }, { deploy: deploySkip });
    const second = JSON.parse(String(log.mock.calls[0]![0])) as { id: string; title: string };
    expect(second.title).toBe("extra");
    expect(second.id).not.toBe(body.id);
    expect(fs.readFileSync(path.join(siteDir(second.id), "extra.markdown"), "utf8")).toBe("plain body\n");
  });

  it("updates the same page when the same file is published again", async () => {
    const md = path.join(tmp, "notes.md");
    fs.writeFileSync(md, "# One\n\nalpha\n");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    await putCommand({ dir: md, json: true, skipDeploy: true }, { deploy: deploySkip });
    fs.writeFileSync(md, "# One\n\nbeta\n");
    await putCommand({ dir: md, json: true, skipDeploy: true }, { deploy: deploySkip });
    const state = JSON.parse(fs.readFileSync(path.join(tmp, ".alab", "markdown", "notes.md.json"), "utf8")) as { id: string };
    const pages = fs.readdirSync(path.join(process.env.ALAB_PAGES_CONTENT!, "sites"));
    expect(pages).toEqual([state.id]);
    expect(fs.readFileSync(path.join(siteDir(state.id), "notes.md"), "utf8")).toBe("# One\n\nbeta\n");
  });

  it("rejects empty, oversized, non-utf8, and unsupported files", async () => {
    const empty = path.join(tmp, "empty.md");
    fs.writeFileSync(empty, "");
    await expect(putCommand({ dir: empty, skipDeploy: true }, { deploy: deploySkip })).rejects.toThrow(/empty/);

    const blank = path.join(tmp, "blank.markdown");
    fs.writeFileSync(blank, " \n\t\n");
    expect(() => loadMarkdownFile(blank)).toThrow(/empty/);

    const huge = path.join(tmp, "huge.md");
    fs.writeFileSync(huge, Buffer.alloc(MAX_BYTES + 1, 0x61));
    expect(() => loadMarkdownFile(huge)).toThrow(/too large/i);

    const binary = path.join(tmp, "bad.md");
    fs.writeFileSync(binary, Buffer.from([0xff, 0xfe, 0xfd]));
    expect(() => loadMarkdownFile(binary)).toThrow(/UTF-8/);

    const text = path.join(tmp, "notes.txt");
    fs.writeFileSync(text, "# nope\n");
    await expect(putCommand({ dir: text, skipDeploy: true }, { deploy: deploySkip })).rejects.toThrow(/Unsupported file type/);

    await expect(putCommand({ dir: path.join(tmp, "missing.md"), skipDeploy: true }, { deploy: deploySkip })).rejects.toThrow(
      /Not a directory or Markdown file/,
    );
  });

  it("escapes markup that would break out of the page", () => {
    const html = renderMarkdownPage({
      title: `a <b> "title"`,
      markdown: "</pre><script>alert(1)</script>",
      sourceName: `weird".md`,
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("</pre><script>");
    expect(html).toContain("&lt;/pre&gt;&lt;script&gt;");
    expect(html).toContain("a &lt;b&gt; &quot;title&quot;");
  });
});
