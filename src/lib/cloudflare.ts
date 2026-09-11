export type CloudflareAccount = { id: string; name: string };

type ApiEnvelope<T> = {
  success: boolean;
  result: T;
  errors?: Array<{ message?: string }>;
};

const API_BASE = "https://api.cloudflare.com/client/v4";

async function request<T>(
  token: string,
  pathname: string,
  init: RequestInit = {},
): Promise<{ result: T; status: number }> {
  const response = await fetch(`${API_BASE}${pathname}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...init.headers,
    },
  });
  const body = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !body.success) {
    const detail = body.errors?.map((e) => e.message).filter(Boolean).join(", ");
    throw new Error(`Cloudflare API request failed (${response.status})${detail ? `: ${detail}` : ""}`);
  }
  return { result: body.result, status: response.status };
}

export async function listCloudflareAccounts(token: string): Promise<CloudflareAccount[]> {
  return (await request<CloudflareAccount[]>(token, "/accounts")).result;
}

export async function ensurePagesProject(opts: {
  token: string;
  accountId: string;
  project: string;
  branch: string;
}): Promise<"existing" | "created"> {
  const projectPath = `/accounts/${encodeURIComponent(opts.accountId)}/pages/projects/${encodeURIComponent(opts.project)}`;
  const existing = await fetch(`${API_BASE}${projectPath}`, {
    headers: { authorization: `Bearer ${opts.token}` },
  });
  if (existing.ok) {
    const body = (await existing.json()) as ApiEnvelope<{ production_branch?: string }>;
    if (!body.success) {
      const detail = body.errors?.map((e) => e.message).filter(Boolean).join(", ");
      throw new Error(`Cloudflare API request failed (${existing.status})${detail ? `: ${detail}` : ""}`);
    }
    const existingBranch = body.result.production_branch;
    if (existingBranch && existingBranch !== opts.branch) {
      throw new Error(
        `Cloudflare Pages project ${opts.project} already uses production branch ${existingBranch}, not ${opts.branch}. Choose the existing branch or a different project name.`,
      );
    }
    return "existing";
  }
  if (existing.status !== 404) {
    const body = (await existing.json().catch(() => null)) as ApiEnvelope<unknown> | null;
    const detail = body?.errors?.map((e) => e.message).filter(Boolean).join(", ");
    throw new Error(`Cloudflare API request failed (${existing.status})${detail ? `: ${detail}` : ""}`);
  }
  await request(
    opts.token,
    `/accounts/${encodeURIComponent(opts.accountId)}/pages/projects`,
    {
      method: "POST",
      body: JSON.stringify({ name: opts.project, production_branch: opts.branch }),
    },
  );
  return "created";
}
