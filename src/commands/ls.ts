import { pageUrl, resolveConfig } from "../lib/config.js";
import { formatBytes, listSites } from "../lib/store.js";

export function lsCommand(opts: { json?: boolean }): void {
  const cfg = resolveConfig();
  const pages = listSites();

  if (opts.json) {
    console.log(
      JSON.stringify(
        pages.map((p) => ({
          ...p,
          url: pageUrl(cfg.baseUrl, p.id),
        })),
        null,
        2,
      ),
    );
    return;
  }

  if (pages.length === 0) {
    console.log("No pages yet. Run: agentlab-pages put .");
    return;
  }

  const idW = Math.max(4, ...pages.map((p) => p.id.length));
  for (const p of pages) {
    const id = p.id.padEnd(idW);
    const size = formatBytes(p.bytes).padStart(8);
    console.log(
      `${id}  ${size}  ${p.updatedAt.slice(0, 19).replace("T", " ")}  ${pageUrl(cfg.baseUrl, p.id)}`,
    );
  }
}
