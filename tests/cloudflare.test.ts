import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ensurePagesProject,
  listCloudflareAccounts,
} from "../src/lib/cloudflare.js";

afterEach(() => vi.unstubAllGlobals());

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Cloudflare API", () => {
  it("discovers accounts using bearer authentication", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response(200, { success: true, result: [{ id: "acct", name: "AgentLab" }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(listCloudflareAccounts("secret")).resolves.toEqual([
      { id: "acct", name: "AgentLab" },
    ]);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      authorization: "Bearer secret",
    });
  });

  it("creates a missing Pages project with the production branch", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(404, { success: false, result: null }))
      .mockResolvedValueOnce(response(200, { success: true, result: { name: "pages" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(ensurePagesProject({
      token: "secret",
      accountId: "acct",
      project: "pages",
      branch: "main",
    })).resolves.toBe("created");
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ name: "pages", production_branch: "main" }),
    });
  });

  it("does not recreate an existing Pages project", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200, { success: true, result: {} }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(ensurePagesProject({
      token: "secret",
      accountId: "acct",
      project: "pages",
      branch: "main",
    })).resolves.toBe("existing");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects an existing project with a different production branch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200, {
      success: true,
      result: { production_branch: "production" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(ensurePagesProject({
      token: "secret",
      accountId: "acct",
      project: "pages",
      branch: "main",
    })).rejects.toThrow(/already uses production branch production/);
  });
});
