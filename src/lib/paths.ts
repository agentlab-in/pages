import os from "node:os";
import path from "node:path";

export function alabHome(): string {
  return process.env.ALAB_HOME?.trim() || path.join(os.homedir(), ".alab");
}

export function configPath(): string {
  return path.join(alabHome(), "config.json");
}

export function contentRoot(): string {
  return (
    process.env.ALAB_PAGES_CONTENT?.trim() ||
    path.join(alabHome(), "pages-content")
  );
}

export function sitesDir(): string {
  return path.join(contentRoot(), "sites");
}

export function siteDir(id: string): string {
  return path.join(sitesDir(), id);
}

export function manifestPath(): string {
  return path.join(contentRoot(), "manifest.json");
}
