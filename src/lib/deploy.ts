import { blake3 } from "@noble/hashes/blake3.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assembleDeployRoot } from "./assemble.js";
import { requireDeployAuth } from "./config.js";

export type DeployConfig = {
  accountId: string;
  apiToken: string;
  project: string;
  baseUrl: string;
  indexPassword: string | undefined;
  branch: string;
};

export type DeployResult = { pageCount: number; outDir: string; stdout: string; baseUrl: string };
type CloudflareError = { code?: number; message?: string };
type CloudflareEnvelope<T> = { success?: boolean; result?: T; errors?: CloudflareError[] };
type CloudflareDeployment = {
  id: string;
  latest_stage?: { name?: string; status?: string };
};
type CloudflareDomain = { name?: string; status?: string };
type Asset = { filePath: string; hash: string; contentType: string; size: number };
const API_BASE = "https://api.cloudflare.com/client/v4";
const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;
const MAX_UPLOAD_FILES = 2_000;

export async function deployAll(
  cfg: DeployConfig,
  opts: { dryRun?: boolean; fetch?: typeof fetch } = {},
): Promise<DeployResult> {
  const request = opts.fetch ?? fetch;
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "alab-pages-deploy-"));

  if (opts.dryRun) {
    const baseUrl = cfg.baseUrl;
    const { pageCount } = assembleDeployRoot({
      outDir,
      indexPassword: cfg.indexPassword,
      baseUrl,
    });
    return { pageCount, outDir, stdout: "(dry-run: skipped Cloudflare upload)", baseUrl };
  }

  try {
    const baseUrl = await discoverDeploymentBaseUrl(cfg, request);
    const { pageCount } = assembleDeployRoot({
      outDir,
      indexPassword: cfg.indexPassword,
      baseUrl,
    });
    const deployment = await uploadSnapshot(cfg, outDir, request);
    fs.rmSync(outDir, { recursive: true, force: true });
    return { pageCount, outDir, stdout: JSON.stringify(deployment), baseUrl };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Cloudflare Pages deployment failed. Assembled files remain at ${outDir}. ${message}`,
      { cause: error },
    );
  }
}

export async function discoverDeploymentBaseUrl(
  cfg: DeployConfig,
  request: typeof fetch,
): Promise<string> {
  requireDeployAuth(cfg);
  const domains = await cloudflareRequest<CloudflareDomain[]>(
    request,
    `${API_BASE}/accounts/${encodeURIComponent(cfg.accountId)}/pages/projects/${encodeURIComponent(cfg.project)}/domains`,
    { headers: { Authorization: `Bearer ${cfg.apiToken}` } },
    "list project domains",
  );
  const activeDomains = domains
    .filter((domain) => domain.status === "active" && domain.name)
    .map((domain) => domain.name!);
  const configuredHostname = hostname(cfg.baseUrl);
  const configuredDomain = activeDomains.find((domain) => domain === configuredHostname);
  if (configuredDomain) return cfg.baseUrl.replace(/\/$/, "");
  if (activeDomains.length === 1) return `https://${activeDomains[0]}`;
  return `https://${cfg.project}.pages.dev`;
}

function hostname(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

export async function uploadSnapshot(
  cfg: DeployConfig,
  outDir: string,
  request: typeof fetch,
  sleep: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<unknown> {
  const account = encodeURIComponent(cfg.accountId);
  const project = encodeURIComponent(cfg.project);
  const authHeaders = { Authorization: `Bearer ${cfg.apiToken}` };
  const token = await cloudflareRequest<{ jwt?: string }>(
    request,
    `${API_BASE}/accounts/${account}/pages/projects/${project}/upload-token`,
    { headers: authHeaders },
    "request an asset upload token",
  );
  if (!token.jwt) throw new Error("Cloudflare did not return an asset upload token.");

  const assets = collectAssets(outDir);
  const missingHashes = await cloudflareRequest<string[]>(
    request,
    `${API_BASE}/pages/assets/check-missing`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token.jwt}`, "Content-Type": "application/json" },
      body: JSON.stringify({ hashes: assets.map((asset) => asset.hash) }),
    },
    "check the asset cache",
  );
  const missing = new Set(missingHashes);
  const assetsToUpload = assets.filter((asset) => missing.has(asset.hash));

  for (const batch of batchAssets(assetsToUpload)) {
    await cloudflareRequest(
      request,
      `${API_BASE}/pages/assets/upload`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token.jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(batch.map((asset) => ({
          key: asset.hash,
          value: fs.readFileSync(asset.filePath).toString("base64"),
          metadata: { contentType: asset.contentType },
          base64: true,
        }))),
      },
      "upload assets",
    );
  }

  await cloudflareRequest(
    request,
    `${API_BASE}/pages/assets/upsert-hashes`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token.jwt}`, "Content-Type": "application/json" },
      body: JSON.stringify({ hashes: assets.map((asset) => asset.hash) }),
    },
    "record uploaded asset hashes",
  );

  const manifest = Object.fromEntries(assets.map((asset) => [
    `/${path.relative(outDir, asset.filePath).split(path.sep).join("/")}`,
    asset.hash,
  ]));
  const form = new FormData();
  form.append("manifest", JSON.stringify(manifest));
  form.append("branch", cfg.branch);
  form.append("commit_dirty", "true");

  const deployment = await cloudflareRequest<CloudflareDeployment>(
    request,
    `${API_BASE}/accounts/${account}/pages/projects/${project}/deployments`,
    { method: "POST", headers: authHeaders, body: form },
    "create the production deployment",
  );
  return waitForDeployment(cfg, deployment, request, sleep);
}

async function waitForDeployment(
  cfg: DeployConfig,
  initial: CloudflareDeployment,
  request: typeof fetch,
  sleep: (milliseconds: number) => Promise<void>,
): Promise<CloudflareDeployment> {
  let deployment = initial;
  for (let attempt = 0; attempt < 10; attempt++) {
    const stage = deployment.latest_stage;
    if (stage?.name === "deploy" && stage.status === "success") return deployment;
    if (stage?.status === "failure") {
      throw new Error(`Cloudflare deployment ${deployment.id} failed during ${stage.name || "an unknown stage"}.`);
    }
    if (!deployment.id) throw new Error("Cloudflare did not return a deployment id.");
    await sleep(Math.min(1_000 * 2 ** attempt, 5_000));
    deployment = await cloudflareRequest<CloudflareDeployment>(
      request,
      `${API_BASE}/accounts/${encodeURIComponent(cfg.accountId)}/pages/projects/${encodeURIComponent(cfg.project)}/deployments/${encodeURIComponent(deployment.id)}`,
      { headers: { Authorization: `Bearer ${cfg.apiToken}` } },
      "check deployment status",
    );
  }
  throw new Error(`Cloudflare deployment ${deployment.id} did not finish before the status check timed out.`);
}

function collectAssets(root: string): Asset[] {
  const assets: Asset[] = [];
  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const filePath = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(filePath);
      else if (entry.isFile()) {
        const contents = fs.readFileSync(filePath);
        const extension = path.extname(filePath).slice(1);
        const hashInput = Buffer.from(contents.toString("base64") + extension);
        const hash = Buffer.from(blake3(hashInput)).toString("hex").slice(0, 32);
        assets.push({ filePath, hash, contentType: contentType(filePath), size: contents.byteLength });
      }
    }
  }
  walk(root);
  return assets.sort((a, b) => a.filePath.localeCompare(b.filePath));
}

function batchAssets(assets: Asset[]): Asset[][] {
  const batches: Asset[][] = [];
  let current: Asset[] = [];
  let currentBytes = 0;
  for (const asset of assets) {
    if (current.length > 0 &&
      (current.length >= MAX_UPLOAD_FILES || currentBytes + asset.size > MAX_UPLOAD_BYTES)) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(asset);
    currentBytes += asset.size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

async function cloudflareRequest<T = unknown>(
  request: typeof fetch,
  url: string,
  init: RequestInit,
  action: string,
): Promise<T> {
  let response: Response;
  try {
    response = await request(url, init);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not ${action}: ${message}`);
  }

  let body: CloudflareEnvelope<T>;
  try {
    body = (await response.json()) as CloudflareEnvelope<T>;
  } catch {
    throw new Error(`Could not ${action}: Cloudflare returned HTTP ${response.status}.`);
  }
  if (!response.ok || body.success === false) {
    const details = body.errors
      ?.map((error) => [error.code, error.message].filter(Boolean).join(": "))
      .filter(Boolean)
      .join("; ");
    throw new Error(`Could not ${action}: ${details || `Cloudflare returned HTTP ${response.status}`}.`);
  }
  return body.result as T;
}

function contentType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".html": return "text/html; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".js": return "text/javascript; charset=utf-8";
    case ".json": return "application/json";
    case ".svg": return "image/svg+xml";
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".gif": return "image/gif";
    case ".webp": return "image/webp";
    case ".ico": return "image/x-icon";
    case ".txt": return "text/plain; charset=utf-8";
    case ".xml": return "application/xml";
    case ".pdf": return "application/pdf";
    case ".wasm": return "application/wasm";
    default: return "application/octet-stream";
  }
}
