import { spawn } from "node:child_process";
import path from "node:path";
import { pageUrl, resolveConfig } from "../lib/config.js";
import { assertValidId } from "../lib/id.js";
import { readLocalState } from "../lib/state.js";
import { readManifest } from "../lib/store.js";

export function openCommand(opts: {
  id?: string;
  dir?: string;
}): void {
  const cfg = resolveConfig();
  let id = opts.id;

  if (!id && opts.dir) {
    const local = readLocalState(path.resolve(opts.dir));
    id = local?.id;
  }
  if (!id) {
    const local = readLocalState(process.cwd());
    id = local?.id;
  }
  if (!id) {
    throw new Error(
      "No page id. Pass an id, run from a published dir, or use: agentlab-pages open <id>",
    );
  }

  id = assertValidId(id);
  const m = readManifest();
  if (!m.pages[id]) {
    throw new Error(`Unknown page id "${id}". Run agentlab-pages list.`);
  }

  const url = pageUrl(cfg.baseUrl, id);
  openUrl(url);
  console.log(url);
}

function openUrl(url: string): void {
  const platform = process.platform;
  if (platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
  } else if (platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], {
      detached: true,
      stdio: "ignore",
    }).unref();
  } else {
    spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
  }
}
