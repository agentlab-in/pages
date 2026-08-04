import path from "node:path";
import { resolveConfig } from "../lib/config.js";
import { deployAll } from "../lib/deploy.js";
import { assertValidId } from "../lib/id.js";
import { clearLocalState, readLocalState } from "../lib/state.js";
import { deleteSite, readManifest } from "../lib/store.js";

export type DeleteOptions = {
  id?: string;
  dir?: string;
  dryRun?: boolean;
  json?: boolean;
  skipDeploy?: boolean;
};

export async function deleteCommand(opts: DeleteOptions): Promise<void> {
  const cfg = resolveConfig();
  let id = opts.id;
  let dir = opts.dir ? path.resolve(opts.dir) : process.cwd();

  if (!id) {
    const local = readLocalState(dir);
    id = local?.id;
  }
  if (!id) {
    throw new Error("Pass a page id: alab pages delete <id>");
  }

  id = assertValidId(id);
  const before = readManifest().pages[id];
  if (!before) {
    throw new Error(`Unknown page id "${id}".`);
  }

  deleteSite(id);

  // Clear local state if it pointed at this id
  const local = readLocalState(dir);
  if (local?.id === id) clearLocalState(dir);

  if (opts.skipDeploy || opts.dryRun) {
    if (opts.json) {
      console.log(JSON.stringify({ id, deleted: true, deployed: false }, null, 2));
    } else {
      console.log(`✓ Removed ${id} from local store`);
      if (opts.dryRun) console.log("  (dry-run: not deploying)");
      else if (opts.skipDeploy) console.log("  (skipped deploy)");
    }
    if (opts.dryRun) return;
    if (opts.skipDeploy) return;
  }

  if (!opts.skipDeploy && !opts.dryRun) {
    const result = await deployAll(cfg);
    if (opts.json) {
      console.log(
        JSON.stringify(
          { id, deleted: true, deployed: true, pageCount: result.pageCount },
          null,
          2,
        ),
      );
    } else {
      console.log(`✓ Removed ${id} and redeployed (${result.pageCount} page(s) left)`);
    }
  }
}
