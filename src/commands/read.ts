import path from "node:path";
import { pageUrl, resolveConfig } from "../lib/config.js";
import { assertValidId } from "../lib/id.js";
import { readLocalState } from "../lib/state.js";
import { formatBytes, readManifest } from "../lib/store.js";

export type ReadCommandOptions = {
  id?: string;
  dir?: string;
  json?: boolean;
};

export function readCommand(opts: ReadCommandOptions): void {
  const cfg = resolveConfig();
  let id = opts.id;

  if (!id && opts.dir) {
    id = readLocalState(path.resolve(opts.dir))?.id;
  }
  if (!id) {
    id = readLocalState(process.cwd())?.id;
  }
  if (!id) {
    throw new Error(
      "No page id. Pass an id, run from a published dir, or use: alab pages read <id>",
    );
  }

  const safeId = assertValidId(id);
  const entry = readManifest().pages[safeId];
  if (!entry) {
    throw new Error(`Unknown page id "${safeId}". Run alab pages list.`);
  }

  const result = {
    ...entry,
    url: pageUrl(cfg.baseUrl, safeId),
  };

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`ID       ${result.id}`);
  console.log(`URL      ${result.url}`);
  console.log(`files    ${result.fileCount}`);
  console.log(`size     ${formatBytes(result.bytes)}`);
  console.log(`created  ${result.createdAt}`);
  console.log(`updated  ${result.updatedAt}`);
}
