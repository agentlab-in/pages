import fs from "node:fs";
import path from "node:path";
import { pageUrl, resolveConfig, writeConfig } from "../lib/config.js";
import { deployAll } from "../lib/deploy.js";
import { isMarkdownFilename, stageMarkdownSite } from "../lib/markdown.js";
import {
  allocateId,
  formatBytes,
  putSite,
} from "../lib/store.js";
import { readLocalState, readMarkdownState, writeLocalState, writeMarkdownState } from "../lib/state.js";

export type PutOptions = {
  dir: string;
  id?: string;
  dryRun?: boolean;
  json?: boolean;
  skipDeploy?: boolean;
};

type PutDeps = { deploy: typeof deployAll };

export async function putCommand(
  opts: PutOptions,
  injected: Partial<PutDeps> = {},
): Promise<void> {
  const deploy = injected.deploy ?? deployAll;
  const abs = path.resolve(opts.dir);
  if (!fs.existsSync(abs)) {
    throw new Error(`Not a directory or Markdown file: ${opts.dir}`);
  }
  const stat = fs.lstatSync(abs);
  if (stat.isSymbolicLink()) {
    throw new Error(`Symbolic links are not allowed: ${opts.dir}`);
  }

  let sourceDir = abs;
  let staged: string | undefined;
  let markdown: { title: string; filename: string } | undefined;
  let readState = () => readLocalState(abs);
  let writeState = (state: { id: string; url?: string }) => writeLocalState(abs, state);

  if (stat.isFile()) {
    if (!isMarkdownFilename(path.basename(abs))) {
      throw new Error(
        `Unsupported file type: ${opts.dir}. Publish a directory or a .md or .markdown file.`,
      );
    }
    const prepared = stageMarkdownSite(abs);
    staged = prepared.dir;
    sourceDir = prepared.dir;
    markdown = { title: prepared.loaded.title, filename: prepared.loaded.filename };
    readState = () => readMarkdownState(abs);
    writeState = (state) => writeMarkdownState(abs, state);
  } else if (!stat.isDirectory()) {
    throw new Error(
      `Unsupported file type: ${opts.dir}. Publish a directory or a .md or .markdown file.`,
    );
  }

  try {
    await publishPrepared(opts, deploy, sourceDir, readState, writeState, markdown);
  } finally {
    if (staged) fs.rmSync(staged, { recursive: true, force: true });
  }
}

async function publishPrepared(
  opts: PutOptions,
  deploy: typeof deployAll,
  absDir: string,
  readState: () => { id: string; url?: string } | null,
  writeState: (state: { id: string; url?: string }) => void,
  markdown?: { title: string; filename: string },
): Promise<void> {
  const cfg = resolveConfig();
  const local = readState();
  const id = allocateId(opts.id ?? local?.id);
  const stats = putSite(id, absDir);
  let url = pageUrl(cfg.baseUrl, id);

  writeState({ id, url });

  if (!opts.json) {
    console.log(
      `✓ Stored ${stats.fileCount} file${stats.fileCount === 1 ? "" : "s"} (${formatBytes(stats.bytes)}) as ${id}`,
    );
  }

  if (opts.skipDeploy) {
    if (opts.json) {
      console.log(
        JSON.stringify({ id, url, fileCount: stats.fileCount, bytes: stats.bytes, deployed: false, ...markdownMeta(markdown) }, null, 2),
      );
    } else {
      console.log(`✓ Skipped deploy (--skip-deploy)`);
      console.log(`  URL (after deploy): ${url}`);
    }
    return;
  }

  if (opts.dryRun) {
    const result = await deploy(cfg, { dryRun: true });
    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            id,
            url,
            fileCount: stats.fileCount,
            bytes: stats.bytes,
            ...markdownMeta(markdown),
            dryRun: true,
            pageCount: result.pageCount,
            assembleDir: result.outDir,
          },
          null,
          2,
        ),
      );
    } else {
      console.log(`✓ Dry-run assemble: ${result.pageCount} page(s) → ${result.outDir}`);
      console.log(`  URL: ${url}`);
    }
    return;
  }

  const result = await deploy(cfg);
  url = pageUrl(result.baseUrl, id);
  writeConfig({ pagesBaseUrl: result.baseUrl });
  writeState({ id, url });
  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          id,
          url,
          fileCount: stats.fileCount,
          bytes: stats.bytes,
          ...markdownMeta(markdown),
          deployed: true,
          pageCount: result.pageCount,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`✓ Deployed ${result.pageCount} page(s) to ${cfg.project}`);
    console.log(`  URL: ${url}`);
  }
}

function markdownMeta(markdown?: { title: string; filename: string }): { title?: string; source?: string } {
  if (!markdown) return {};
  return { title: markdown.title, source: markdown.filename };
}
