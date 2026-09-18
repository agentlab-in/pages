# AgentLab Pages

AgentLab Pages is a standalone CLI for publishing small static sites to one Cloudflare Pages project. A published directory keeps a stable public URL at `https://<project>.pages.dev/<id>/`, or at an explicitly configured custom base URL.

```bash
agentlab-pages setup
agentlab-pages put ./site
agentlab-pages read
```

Every page URL is public. The optional root password obscures only the directory listing. It does not protect direct page URLs.

## Install and run

This repository requires Node.js 20 or newer and pnpm.

```bash
pnpm install
pnpm build
pnpm link --global
agentlab-pages --help
```

For development without a global link, use `pnpm alab <command>`. The package retains `alab pages <command>` for compatibility. Shared binary integrations should import `runCli` from `src/program.ts`; `src/cli.ts` is the executable entry point and starts immediately when loaded.

## Guided setup

Run `agentlab-pages setup`. It prompts for a Cloudflare API token, validates it, lets you select an accessible account, and creates or reuses the configured Pages project. On macOS, the token is stored in Keychain. Other configuration is stored under `~/.alab/`.

Create the token at [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens) with `Account`, `Cloudflare Pages`, `Edit` permission for the target account. Interactive token input is hidden.

For automation:

```bash
agentlab-pages setup \
  --account-id "$CLOUDFLARE_ACCOUNT_ID" \
  --project agentlab-pages \
  --branch main \
  --yes
```

Environment variables remain supported for CI. Do not put credentials in published content or commit local configuration.

## Commands

```text
agentlab-pages setup [options]
agentlab-pages put [dir] [--id <id>] [--dry-run] [--skip-deploy] [--json]
agentlab-pages remove [id] [--dry-run] [--skip-deploy] [--json]
agentlab-pages read [id] [--dir <path>] [--json]
agentlab-pages list [--json]
agentlab-pages open [id]
agentlab-pages info
```

`delete` is an alias for `remove`. `ls` is an alias for `list`.

`read` reads local metadata and prints the public URL. It never downloads deployed files. With no ID, `read`, `open`, and `remove` use `.alab/pages.json` in the current published directory. `open` also prints the URL after launching it in the browser. `info` prints local paths and configuration targets without changing anything.

`put` and `remove` update the local full snapshot before deployment. `--dry-run` skips Cloudflare deployment, but it still changes local state. Use an isolated store for experiments:

```bash
scratch_root="$(mktemp -d)"
export ALAB_HOME="$scratch_root/home"
export ALAB_PAGES_CONTENT="$scratch_root/content"
mkdir -p "$scratch_root/site"
printf '<h1>test</h1>\n' > "$scratch_root/site/index.html"
pnpm alab put "$scratch_root/site" --dry-run --json
```

## Publishing model

| Item | Behavior |
| --- | --- |
| Content store | `~/.alab/pages-content/sites/<id>/` |
| Stable ID | Saved in `<published-directory>/.alab/pages.json` |
| Deployment | Complete local snapshot sent through the Cloudflare Pages API directly; no Wrangler dependency |
| Production branch | Always the configured branch, `main` by default |
| Limits | 200 files and 5 MiB per page |
| Skipped content | `.git`, `.alab`, `node_modules`, `.env*`, `.DS_Store`, `Thumbs.db` |

Cloudflare project configuration, custom domains, and DNS remain external infrastructure. Attaching `pages.agentlab.in` still requires domain configuration in Cloudflare.

## Development

```bash
pnpm test
pnpm build
```

Tests isolate `ALAB_HOME` and `ALAB_PAGES_CONTENT`. Routine verification must not use a live deployment.
