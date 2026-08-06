#!/usr/bin/env node
import { Command } from "commander";
import { deleteCommand } from "./commands/delete.js";
import { lsCommand } from "./commands/ls.js";
import { openCommand } from "./commands/open.js";
import { putCommand } from "./commands/put.js";
import { resolveConfig } from "./lib/config.js";
import { alabHome, contentRoot } from "./lib/paths.js";

const program = new Command();

program
  .name("alab")
  .description("agentlab CLI")
  .version("1.0.0");

const pages = program
  .command("pages")
  .description("Scratch HTML host on Cloudflare Pages")
  .addHelpText(
    "after",
    [
      "",
      "Quick start:",
      "  Put your files in a folder, then run `alab pages put <folder-name>`.",
      "  That's it, no config or setup needed.",
      "",
      "Deploy branch:",
      "  Every deploy targets the project's production branch (default `main`),",
      "  never the branch of whatever git repo you happen to be standing in.",
      "  Override with ALAB_PAGES_BRANCH or `pagesBranch` in ~/.alab/config.json.",
      "  Run `alab pages info` to see the branch in effect.",
      "",
    ].join("\n"),
  );

pages
  .command("put")
  .description("Publish a local directory (create or update)")
  .argument("[dir]", "directory to publish", ".")
  .option("--id <id>", "page id (default: .alab/pages.json or new id)")
  .option("--dry-run", "assemble only; do not call wrangler", false)
  .option("--skip-deploy", "update local store only", false)
  .option("--json", "machine-readable output", false)
  .action(
    async (
      dir: string,
      opts: {
        id?: string;
        dryRun?: boolean;
        skipDeploy?: boolean;
        json?: boolean;
      },
    ) => {
      await putCommand({
        dir,
        id: opts.id,
        dryRun: opts.dryRun,
        skipDeploy: opts.skipDeploy,
        json: opts.json,
      });
    },
  );

pages
  .command("ls")
  .description("List published pages in the local store")
  .option("--json", "machine-readable output", false)
  .action((opts: { json?: boolean }) => {
    lsCommand(opts);
  });

pages
  .command("open")
  .description("Open a page URL in the browser")
  .argument("[id]", "page id (default: .alab/pages.json in cwd)")
  .action((id: string | undefined) => {
    openCommand({ id });
  });

pages
  .command("delete")
  .description("Delete a page and redeploy")
  .argument("[id]", "page id (default: .alab/pages.json in cwd)")
  .option("--dry-run", "remove from store only; do not redeploy", false)
  .option("--skip-deploy", "remove from store only", false)
  .option("--json", "machine-readable output", false)
  .action(
    async (
      id: string | undefined,
      opts: { dryRun?: boolean; skipDeploy?: boolean; json?: boolean },
    ) => {
      await deleteCommand({
        id,
        dryRun: opts.dryRun,
        skipDeploy: opts.skipDeploy || opts.dryRun,
        json: opts.json,
      });
    },
  );

pages
  .command("info")
  .description("Show local paths and config targets")
  .action(() => {
    const cfg = resolveConfig();
    console.log(`ALAB_HOME     ${alabHome()}`);
    console.log(`content store ${contentRoot()}`);
    console.log(`project       ${cfg.project}`);
    console.log(`base URL      ${cfg.baseUrl}`);
    console.log(`deploy branch ${cfg.branch}`);
    console.log(
      `index gate    ${cfg.indexPassword ? "password set" : "off (public landing)"}`,
    );
    console.log(`CF token      ${cfg.apiToken ? "set" : "missing"}`);
    console.log(`CF account    ${cfg.accountId ? "set" : "missing"}`);
  });

program.exitOverride();

async function main(): Promise<void> {
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    const e = err as { code?: string; message?: string };
    if (e?.code === "commander.helpDisplayed" || e?.code === "commander.version") {
      process.exit(0);
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${msg}`);
    process.exit(1);
  }
}

main();
