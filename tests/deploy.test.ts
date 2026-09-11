import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deployAll, uploadSnapshot, type DeployConfig } from "../src/lib/deploy.js";
import { putSite } from "../src/lib/store.js";

const cfg: DeployConfig = {
  accountId: "acct/id",
  apiToken: "secret-token",
  project: "agentlab pages",
  baseUrl: "https://pages.agentlab.in",
  indexPassword: undefined,
  branch: "main",
};
let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "alab-deploy-test-"));
  process.env.ALAB_HOME = tmp;
  process.env.ALAB_PAGES_CONTENT = path.join(tmp, "content");
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  delete process.env.ALAB_HOME;
  delete process.env.ALAB_PAGES_CONTENT;
});

describe("direct Cloudflare deployment", () => {
  it("uploads every asset and creates a deployment on the configured branch", async () => {
    const out = path.join(tmp, "snapshot");
    fs.mkdirSync(path.join(out, "site"), { recursive: true });
    fs.writeFileSync(path.join(out, "index.html"), "<h1>root</h1>");
    fs.writeFileSync(path.join(out, "site", "app.js"), "console.log('ok')");
    const responses = [
      jsonResponse({ success: true, result: { jwt: "upload-jwt" } }),
      jsonResponse({ success: true, result: [
        "14252ca42442a40579359274e6bbcf48",
        "4c921c257c2018965c9a963284d975cb",
      ] }),
      jsonResponse({ success: true, result: null }),
      jsonResponse({ success: true, result: null }),
      jsonResponse({ success: true, result: {
        id: "deployment-id",
        latest_stage: { name: "deploy", status: "success" },
      } }),
    ];
    const request = vi.fn<typeof fetch>(async () => responses.shift()!);

    await expect(uploadSnapshot(cfg, out, request)).resolves.toMatchObject({ id: "deployment-id" });
    expect(request).toHaveBeenCalledTimes(5);
    expect(request.mock.calls[0][0]).toBe(
      "https://api.cloudflare.com/client/v4/accounts/acct%2Fid/pages/projects/agentlab%20pages/upload-token",
    );
    expect(request.mock.calls[0][1]?.headers).toEqual({ Authorization: "Bearer secret-token" });

    const cacheRequest = request.mock.calls[1];
    expect(cacheRequest[0]).toBe("https://api.cloudflare.com/client/v4/pages/assets/check-missing");

    const assetRequest = request.mock.calls[2];
    expect(assetRequest[0]).toBe("https://api.cloudflare.com/client/v4/pages/assets/upload");
    expect(assetRequest[1]?.headers).toEqual({
      Authorization: "Bearer upload-jwt",
      "Content-Type": "application/json",
    });
    const assets = JSON.parse(String(assetRequest[1]?.body));
    expect(assets).toHaveLength(2);
    expect(assets.map((asset: { metadata: { contentType: string } }) => asset.metadata.contentType)).toEqual([
      "text/html; charset=utf-8",
      "text/javascript; charset=utf-8",
    ]);
    expect(assets.every((asset: { key: string }) => /^[a-f0-9]{32}$/.test(asset.key))).toBe(true);

    const upsertRequest = request.mock.calls[3];
    expect(upsertRequest[0]).toBe("https://api.cloudflare.com/client/v4/pages/assets/upsert-hashes");

    const deploymentRequest = request.mock.calls[4];
    expect(deploymentRequest[0]).toBe(
      "https://api.cloudflare.com/client/v4/accounts/acct%2Fid/pages/projects/agentlab%20pages/deployments",
    );
    const form = deploymentRequest[1]?.body as FormData;
    expect(form.get("branch")).toBe("main");
    expect(form.get("commit_dirty")).toBe("true");
    expect(Object.keys(JSON.parse(String(form.get("manifest"))))).toEqual([
      "/index.html",
      "/site/app.js",
    ]);
  });

  it("reports Cloudflare errors without exposing credentials", async () => {
    const out = path.join(tmp, "snapshot");
    fs.mkdirSync(out);
    fs.writeFileSync(path.join(out, "index.html"), "ok");
    const request = vi.fn<typeof fetch>(async () => jsonResponse(
      { success: false, errors: [{ code: 9109, message: "Invalid access token" }] },
      403,
    ));
    const promise = uploadSnapshot(cfg, out, request);
    await expect(promise).rejects.toThrow(
      "Could not request an asset upload token: 9109: Invalid access token.",
    );
    await expect(promise).rejects.not.toThrow("secret-token");
  });

  it("waits for Cloudflare to confirm deployment success", async () => {
    const out = path.join(tmp, "snapshot");
    fs.mkdirSync(out);
    fs.writeFileSync(path.join(out, "index.html"), "ok");
    const responses = [
      jsonResponse({ success: true, result: { jwt: "upload-jwt" } }),
      jsonResponse({ success: true, result: [] }),
      jsonResponse({ success: true, result: null }),
      jsonResponse({ success: true, result: {
        id: "deployment-id",
        latest_stage: { name: "queued", status: "active" },
      } }),
      jsonResponse({ success: true, result: {
        id: "deployment-id",
        latest_stage: { name: "deploy", status: "success" },
      } }),
    ];
    const request = vi.fn<typeof fetch>(async () => responses.shift()!);
    const sleep = vi.fn(async () => undefined);

    await expect(uploadSnapshot(cfg, out, request, sleep)).resolves.toMatchObject({ id: "deployment-id" });
    expect(sleep).toHaveBeenCalledOnce();
    expect(request.mock.calls[4]?.[0]).toBe(
      "https://api.cloudflare.com/client/v4/accounts/acct%2Fid/pages/projects/agentlab%20pages/deployments/deployment-id",
    );
  });

  it("assembles the full snapshot and cleans it after success", async () => {
    const source = path.join(tmp, "source");
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, "index.html"), "<h1>site</h1>");
    putSite("site01", source);
    const responses = [
      jsonResponse({ success: true, result: { jwt: "jwt" } }),
      jsonResponse({ success: true, result: [] }),
      jsonResponse({ success: true, result: null }),
      jsonResponse({ success: true, result: {
        id: "done",
        latest_stage: { name: "deploy", status: "success" },
      } }),
    ];
    const result = await deployAll(cfg, { fetch: vi.fn<typeof fetch>(async () => responses.shift()!) });
    expect(result.pageCount).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ id: "done" });
    expect(fs.existsSync(result.outDir)).toBe(false);
  });

  it("keeps dry runs local", async () => {
    const request = vi.fn<typeof fetch>();
    const result = await deployAll(cfg, { dryRun: true, fetch: request });
    expect(fs.existsSync(result.outDir)).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });

  it("keeps the assembled snapshot when deployment fails", async () => {
    const request = vi.fn<typeof fetch>(async () => jsonResponse(
      { success: false, errors: [{ message: "Project not found" }] },
      404,
    ));
    let message = "";
    try {
      await deployAll(cfg, { fetch: request });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("Assembled files remain at ");
    expect(message).toContain("Project not found");
    const retainedPath = message.match(/remain at (.+)\. Could not/)?.[1];
    expect(retainedPath && fs.existsSync(retainedPath)).toBe(true);
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
