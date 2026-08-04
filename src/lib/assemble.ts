import fs from "node:fs";
import path from "node:path";
import { contentRoot, siteDir, sitesDir } from "./paths.js";
import { isValidId } from "./id.js";
import { listSites, type ManifestEntry } from "./store.js";
import {
  buildEncryptedIndexHtml,
  buildPublicLandingHtml,
} from "./index-html.js";

export type AssembleOptions = {
  outDir: string;
  indexPassword?: string;
  baseUrl: string;
};

/**
 * Build a Cloudflare Pages deploy root:
 *   <out>/<id>/...files
 *   <out>/index.html  (landing or password-gated id list)
 */
export function assembleDeployRoot(opts: AssembleOptions): {
  pageCount: number;
  pages: ManifestEntry[];
} {
  const { outDir, indexPassword, baseUrl } = opts;
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const pages = listSites();
  const sites = fs.existsSync(sitesDir()) ? fs.readdirSync(sitesDir()) : [];

  for (const id of sites) {
    if (!isValidId(id)) continue;
    const src = siteDir(id);
    if (!fs.statSync(src).isDirectory()) continue;
    copyDir(src, path.join(outDir, id));
  }

  if (indexPassword) {
    fs.writeFileSync(
      path.join(outDir, "index.html"),
      buildEncryptedIndexHtml({
        password: indexPassword,
        pages,
        baseUrl,
      }),
      "utf8",
    );
  } else {
    fs.writeFileSync(
      path.join(outDir, "index.html"),
      buildPublicLandingHtml({ pageCount: pages.length, baseUrl }),
      "utf8",
    );
  }

  // Helpful for debugging local assemble without deploy
  fs.writeFileSync(
    path.join(outDir, "_manifest.json"),
    JSON.stringify(
      {
        assembledAt: new Date().toISOString(),
        contentRoot: contentRoot(),
        pageCount: pages.length,
        // Never put plaintext id list next to encrypted index when password set
        ids: indexPassword ? undefined : pages.map((p) => p.id),
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  return { pageCount: pages.length, pages };
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dest, name);
    const st = fs.statSync(s);
    if (st.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}
