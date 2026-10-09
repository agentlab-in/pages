import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { formatBytes, MAX_BYTES } from "./store.js";

const MARKDOWN_EXT = /\.(md|markdown)$/i;

export function isMarkdownFilename(name: string): boolean {
  return MARKDOWN_EXT.test(name);
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Title from the first ATX heading. A leading front matter block is skipped and never executed. */
export function titleFromMarkdown(text: string, filename: string): string {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  let start = 0;
  if (lines[0]?.trim() === "---") {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i]?.trim() === "---") {
        start = i + 1;
        break;
      }
    }
  }
  for (let i = start; i < lines.length; i++) {
    const match = /^#{1,6}\s+(\S.*?)\s*$/.exec(lines[i] ?? "");
    if (match?.[1]) return match[1];
  }
  return filename.replace(MARKDOWN_EXT, "");
}

export function renderMarkdownPage(opts: {
  title: string;
  markdown: string;
  sourceName: string;
}): string {
  const title = escapeHtml(opts.title);
  const source = escapeHtml(opts.sourceName);
  const href = encodeURIComponent(opts.sourceName).replaceAll("%2F", "/");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, sans-serif; }
    body { max-width: 40rem; margin: 3rem auto; padding: 0 1.25rem; line-height: 1.5; }
    h1 { font-size: 1.5rem; font-weight: 600; margin: 0 0 1rem; }
    pre { white-space: pre-wrap; word-break: break-word; font: 0.95rem/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; margin: 0; }
    p { color: #666; }
    @media (prefers-color-scheme: dark) { p { color: #aaa; } }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <pre>${escapeHtml(opts.markdown)}</pre>
  <p>Source: <a href="${href}">${source}</a></p>
</body>
</html>
`;
}

export type LoadedMarkdown = {
  filename: string;
  bytes: number;
  text: string;
  title: string;
};

export function loadMarkdownFile(filePath: string): LoadedMarkdown {
  const filename = path.basename(filePath);
  if (!isMarkdownFilename(filename)) {
    throw new Error(
      `Unsupported file type: ${filePath}. Publish a directory or a .md or .markdown file.`,
    );
  }
  const stat = fs.lstatSync(filePath);
  if (stat.isSymbolicLink()) {
    throw new Error(`Symbolic links are not allowed: ${filePath}`);
  }
  if (!stat.isFile()) {
    throw new Error(`Not a file: ${filePath}`);
  }
  if (stat.size === 0) {
    throw new Error("Markdown file is empty.");
  }
  if (stat.size > MAX_BYTES) {
    throw new Error(
      `Page too large (${formatBytes(stat.size)}). Max is ${formatBytes(MAX_BYTES)}.`,
    );
  }
  const raw = fs.readFileSync(filePath);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    throw new Error("Markdown file is not valid UTF-8.");
  }
  if (text.trim().length === 0) {
    throw new Error("Markdown file is empty.");
  }
  return {
    filename,
    bytes: raw.length,
    text,
    title: titleFromMarkdown(text, filename),
  };
}

/** Stage index.html plus the original Markdown bytes. Caller deletes the directory. */
export function stageMarkdownSite(filePath: string): { dir: string; loaded: LoadedMarkdown } {
  const loaded = loadMarkdownFile(filePath);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "alab-md-"));
  fs.copyFileSync(filePath, path.join(dir, loaded.filename));
  fs.writeFileSync(
    path.join(dir, "index.html"),
    renderMarkdownPage({
      title: loaded.title,
      markdown: loaded.text,
      sourceName: loaded.filename,
    }),
    "utf8",
  );
  return { dir, loaded };
}
