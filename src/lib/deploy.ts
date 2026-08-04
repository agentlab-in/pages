import { spawn } from "node:child_process";
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
};

export type DeployResult = {
  pageCount: number;
  outDir: string;
  stdout: string;
};

export async function deployAll(
  cfg: DeployConfig,
  opts: { dryRun?: boolean } = {},
): Promise<DeployResult> {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "alab-pages-deploy-"));
  const { pageCount } = assembleDeployRoot({
    outDir,
    indexPassword: cfg.indexPassword,
    baseUrl: cfg.baseUrl,
  });

  if (opts.dryRun) {
    return { pageCount, outDir, stdout: "(dry-run: skipped wrangler)" };
  }

  requireDeployAuth(cfg);

  const env = {
    ...process.env,
    CLOUDFLARE_API_TOKEN: cfg.apiToken,
    CLOUDFLARE_ACCOUNT_ID: cfg.accountId,
  };

  const args = [
    "pages",
    "deploy",
    outDir,
    "--project-name",
    cfg.project,
    "--commit-dirty=true",
  ];

  const stdout = await runWrangler(args, env);

  // Keep tmp on failure only; success cleans up
  try {
    fs.rmSync(outDir, { recursive: true, force: true });
  } catch {
    // ignore
  }

  return { pageCount, outDir, stdout };
}

function runWrangler(
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Prefer npx wrangler so users need not install globally
    const child = spawn("npx", ["--yes", "wrangler@4", ...args], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => {
      const s = d.toString();
      stdout += s;
      process.stderr.write(s); // wrangler progress to stderr stream of our CLI UI
    });
    child.stderr.on("data", (d: Buffer) => {
      const s = d.toString();
      stderr += s;
      process.stderr.write(s);
    });
    child.on("error", (err) => {
      reject(
        new Error(
          `Failed to run wrangler (${err.message}). Is Node/npm available?`,
        ),
      );
    });
    child.on("close", (code) => {
      if (code === 0) resolve(stdout || stderr);
      else {
        reject(
          new Error(
            `wrangler pages deploy failed (exit ${code}).\n${stderr || stdout}`,
          ),
        );
      }
    });
  });
}
