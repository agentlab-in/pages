import fs from "node:fs";
import path from "node:path";
import { pageUrl, resolveConfig } from "../lib/config.js";
import { deployAll } from "../lib/deploy.js";
import {
  allocateId,
  formatBytes,
  putSite,
} from "../lib/store.js";
import { readLocalState, writeLocalState } from "../lib/state.js";

export type PutOptions = {
  dir: string;
  id?: string;
  dryRun?: boolean;
  json?: boolean;
  skipDeploy?: boolean;
};

export async function putCommand(opts: PutOptions): Promise<void> {
  const absDir = path.resolve(opts.dir);
  if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) {
    throw new Error(`Not a directory: ${opts.dir}`);
  }

  const cfg = resolveConfig();
  const local = readLocalState(absDir);
  const id = allocateId(opts.id ?? local?.id);
  const stats = putSite(id, absDir);
  const url = pageUrl(cfg.baseUrl, id);

  writeLocalState(absDir, { id, url });

  if (!opts.json) {
    console.log(
      `✓ Stored ${stats.fileCount} file${stats.fileCount === 1 ? "" : "s"} (${formatBytes(stats.bytes)}) as ${id}`,
    );
  }

  if (opts.skipDeploy) {
    if (opts.json) {
      console.log(
        JSON.stringify({ id, url, fileCount: stats.fileCount, bytes: stats.bytes, deployed: false }, null, 2),
      );
    } else {
      console.log(`✓ Skipped deploy (--skip-deploy)`);
      console.log(`  URL (after deploy): ${url}`);
    }
    return;
  }

  if (opts.dryRun) {
    const result = await deployAll(cfg, { dryRun: true });
    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            id,
            url,
            fileCount: stats.fileCount,
            bytes: stats.bytes,
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

  const result = await deployAll(cfg);
  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          id,
          url,
          fileCount: stats.fileCount,
          bytes: stats.bytes,
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
