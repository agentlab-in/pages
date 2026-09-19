import { Command } from "commander";
import { deleteCommand } from "./commands/delete.js";
import { lsCommand } from "./commands/ls.js";
import { openCommand } from "./commands/open.js";
import { putCommand } from "./commands/put.js";
import { readCommand } from "./commands/read.js";
import { setupCommand } from "./commands/setup.js";
import { resolveConfig } from "./lib/config.js";
import { alabHome, contentRoot } from "./lib/paths.js";

function addPagesCommands(root: Command): void {
  root.command("setup").description("Configure Cloudflare and provision the Pages project")
    .option("--api-token <token>", "Cloudflare API token")
    .option("--account-id <id>", "Cloudflare account id")
    .option("--project <name>", "Cloudflare Pages project name")
    .option("--branch <name>", "production branch")
    .option("--base-url <url>", "public base URL")
    .option("--index-password <password>", "password for the root directory listing")
    .option("--yes", "disable interactive account selection", false)
    .option("--json", "machine readable output", false)
    .addHelpText("after", [
      "", "Token setup:",
      "  Create a token at https://dash.cloudflare.com/profile/api-tokens",
      "  with Account, Cloudflare Pages, Edit permission for the target account.",
      "  Interactive entry is hidden. For automation, prefer CLOUDFLARE_API_TOKEN.", "",
    ].join("\n"))
    .action(async (opts) => setupCommand(opts));

  root.command("put").description("Publish a local directory, creating or updating its page")
    .argument("[dir]", "directory to publish", ".")
    .option("--id <id>", "page id, defaults to saved state or a new id")
    .option("--dry-run", "assemble without deploying (local store is still updated)", false)
    .option("--skip-deploy", "update the local store only", false)
    .option("--json", "machine readable output", false)
    .action(async (dir: string, opts: { id?: string; dryRun?: boolean; skipDeploy?: boolean; json?: boolean }) => putCommand({ dir, ...opts }));

  root.command("remove").alias("delete").description("Remove a page and redeploy")
    .argument("[id]", "page id, defaults to saved state in the current directory")
    .option("--dry-run", "remove locally without redeploying", false)
    .option("--skip-deploy", "remove from the local store only", false)
    .option("--json", "machine readable output", false)
    .action(async (id: string | undefined, opts: { dryRun?: boolean; skipDeploy?: boolean; json?: boolean }) => {
      await deleteCommand({ id, dryRun: opts.dryRun, skipDeploy: opts.skipDeploy || opts.dryRun, json: opts.json });
    });

  root.command("read").description("Show metadata and the public URL for a locally stored page")
    .argument("[id]", "page id, defaults to saved state in the current directory")
    .option("--dir <path>", "resolve the page id from a published directory")
    .option("--json", "machine readable output", false)
    .action((id: string | undefined, opts: { dir?: string; json?: boolean }) => readCommand({ id, ...opts }));

  root.command("list").alias("ls").description("List pages in the local store")
    .option("--json", "machine readable output", false)
    .action((opts: { json?: boolean }) => lsCommand(opts));

  root.command("open").description("Open a page URL in the browser")
    .argument("[id]", "page id, defaults to saved state in the current directory")
    .action((id: string | undefined) => openCommand({ id }));

  root.command("info").description("Show local paths and configuration targets").action(() => {
    const cfg = resolveConfig();
    console.log(`ALAB_HOME     ${alabHome()}`);
    console.log(`content store ${contentRoot()}`);
    console.log(`project       ${cfg.project}`);
    console.log(`base URL      ${cfg.baseUrl}`);
    console.log(`deploy branch ${cfg.branch}`);
    console.log(`index gate    ${cfg.indexPassword ? "password set" : "off (public landing)"}`);
    console.log(`CF token      ${cfg.apiToken ? "set" : "missing"}`);
    console.log(`CF account    ${cfg.accountId ? "set" : "missing"}`);
  });
}

const HELP_TEXT = ["", "Quick start:", "  Run `alab pages setup`, then `alab pages put <directory>`.", "", "Deploys use the Cloudflare Pages API directly.", "Every deploy targets the configured production branch.", "--dry-run still updates the local store; it only skips the upload.", "Run `alab pages info` to inspect the active configuration.", ""].join("\n");

const PAGES_VERSION = "3.0.0";

export function createPagesCommand(): Command {
  const pages = new Command("pages");
  pages.exitOverride();
  pages.description("Publish static pages with AgentLab Pages").version(PAGES_VERSION).addHelpText("after", HELP_TEXT);
  addPagesCommands(pages);
  return pages;
}

export function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  program.name("alab").description("agentlab CLI").version(PAGES_VERSION);
  program.addCommand(createPagesCommand());
  return program;
}
