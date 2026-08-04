import fs from "node:fs";
import path from "node:path";
import { assertValidId, generateId, isValidId } from "./id.js";
import { contentRoot, manifestPath, siteDir, sitesDir } from "./paths.js";

export type ManifestEntry = {
  id: string;
  fileCount: number;
  bytes: number;
  createdAt: string;
  updatedAt: string;
};

export type Manifest = {
  version: 1;
  pages: Record<string, ManifestEntry>;
};

const SKIP_NAMES = new Set([
  ".git",
  ".alab",
  "node_modules",
  ".DS_Store",
  "Thumbs.db",
]);

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 200;

export function ensureStore(): void {
  fs.mkdirSync(sitesDir(), { recursive: true });
  if (!fs.existsSync(manifestPath())) {
    writeManifest({ version: 1, pages: {} });
  }
}

export function readManifest(): Manifest {
  ensureStore();
  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath(), "utf8")) as Manifest;
    if (!raw || raw.version !== 1 || typeof raw.pages !== "object") {
      return { version: 1, pages: {} };
    }
    return raw;
  } catch {
    return { version: 1, pages: {} };
  }
}

export function writeManifest(m: Manifest): void {
  fs.mkdirSync(contentRoot(), { recursive: true });
  fs.writeFileSync(manifestPath(), JSON.stringify(m, null, 2) + "\n", "utf8");
}

export type WalkedFile = { rel: string; abs: string; size: number };

export function walkSource(srcDir: string): WalkedFile[] {
  const absRoot = path.resolve(srcDir);
  if (!fs.existsSync(absRoot) || !fs.statSync(absRoot).isDirectory()) {
    throw new Error(`Not a directory: ${srcDir}`);
  }

  const out: WalkedFile[] = [];

  function walk(dir: string, relBase: string): void {
    for (const name of fs.readdirSync(dir)) {
      if (SKIP_NAMES.has(name)) continue;
      if (name.startsWith(".env")) continue;
      const abs = path.join(dir, name);
      const rel = relBase ? path.join(relBase, name) : name;
      const st = fs.statSync(abs);
      if (st.isDirectory()) {
        walk(abs, rel);
      } else if (st.isFile()) {
        if (rel.includes("..") || path.isAbsolute(rel)) {
          throw new Error(`Unsafe path rejected: ${rel}`);
        }
        out.push({ rel: rel.split(path.sep).join("/"), abs, size: st.size });
      }
    }
  }

  walk(absRoot, "");
  return out;
}

export function validateSource(files: WalkedFile[]): {
  fileCount: number;
  bytes: number;
} {
  if (files.length === 0) {
    throw new Error("No files to publish (directory is empty).");
  }
  if (files.length > MAX_FILES) {
    throw new Error(`Too many files (${files.length}). Max is ${MAX_FILES}.`);
  }
  let bytes = 0;
  for (const f of files) bytes += f.size;
  if (bytes > MAX_BYTES) {
    throw new Error(
      `Page too large (${formatBytes(bytes)}). Max is ${formatBytes(MAX_BYTES)}.`,
    );
  }
  const hasIndex = files.some(
    (f) => f.rel === "index.html" || f.rel.toLowerCase() === "index.html",
  );
  if (!hasIndex) {
    throw new Error("Missing index.html in the publish directory.");
  }
  return { fileCount: files.length, bytes };
}

/** Replace sites/<id>/ with contents of srcDir. Returns stats. */
export function putSite(
  id: string,
  srcDir: string,
): { fileCount: number; bytes: number; files: WalkedFile[] } {
  const safeId = assertValidId(id);
  const files = walkSource(srcDir);
  const stats = validateSource(files);

  const dest = siteDir(safeId);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });

  for (const f of files) {
    const target = path.join(dest, f.rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(f.abs, target);
  }

  const now = new Date().toISOString();
  const manifest = readManifest();
  const prev = manifest.pages[safeId];
  manifest.pages[safeId] = {
    id: safeId,
    fileCount: stats.fileCount,
    bytes: stats.bytes,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  };
  writeManifest(manifest);

  return { ...stats, files };
}

export function deleteSite(id: string): boolean {
  const safeId = assertValidId(id);
  const dest = siteDir(safeId);
  const manifest = readManifest();
  const known = Boolean(manifest.pages[safeId]) || fs.existsSync(dest);
  fs.rmSync(dest, { recursive: true, force: true });
  if (manifest.pages[safeId]) {
    delete manifest.pages[safeId];
    writeManifest(manifest);
  }
  return known;
}

export function listSites(): ManifestEntry[] {
  const m = readManifest();
  // Reconcile with filesystem in case of manual edits
  ensureStore();
  const onDisk = fs.existsSync(sitesDir())
    ? fs.readdirSync(sitesDir()).filter((n) => {
        if (!isValidId(n)) return false;
        return fs.statSync(siteDir(n)).isDirectory();
      })
    : [];

  for (const id of onDisk) {
    if (!m.pages[id]) {
      const files = walkSource(siteDir(id));
      let bytes = 0;
      for (const f of files) bytes += f.size;
      const now = new Date().toISOString();
      m.pages[id] = {
        id,
        fileCount: files.length,
        bytes,
        createdAt: now,
        updatedAt: now,
      };
    }
  }
  for (const id of Object.keys(m.pages)) {
    if (!onDisk.includes(id)) delete m.pages[id];
  }
  writeManifest(m);

  return Object.values(m.pages).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

export function allocateId(preferred?: string): string {
  if (preferred) return assertValidId(preferred);
  const m = readManifest();
  for (let i = 0; i < 20; i++) {
    const id = generateId(6);
    if (!m.pages[id] && !fs.existsSync(siteDir(id))) return id;
  }
  return generateId(10);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
