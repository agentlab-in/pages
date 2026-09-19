# AgentLab Pages

AgentLab Pages is the implementation behind `alab pages`: publishing small static sites to one Cloudflare Pages project. A published directory keeps a stable public URL at `https://<project>.pages.dev/<id>/`, or at an explicitly configured custom base URL.

This package publishes no executables. Users run the single `alab` binary:

```bash
alab pages setup
alab pages put ./site
alab pages read
```

Every page URL is public. The optional root password obscures only the directory listing. It does not protect direct page URLs.

## Install and run

Users install the `alab` binary and need no Node.js setup. This repository requires Node.js 20 or newer and pnpm for development:

```bash
pnpm install
pnpm build
pnpm alab pages --help
```

Shared binary integrations must import `createPagesCommand` from `src/program.ts` and mount it with `addCommand`; `src/cli.ts` is a development-only entry point and starts immediately when loaded, so never import it.

## Guided setup

Run `alab pages setup`. It prompts for a Cloudflare API token, validates it, lets you select an accessible account, and creates or reuses the configured Pages project. On macOS, the token is stored in Keychain. Other configuration is stored under `~/.alab/`.

Create the token at [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens) with `Account`, `Cloudflare Pages`, `Edit` permission for the target account. Interactive token input is hidden.

For automation:

```bash
alab pages setup \
  --account-id "$CLOUDFLARE_ACCOUNT_ID" \
  --project agentlab-pages \
  --branch main \
  --yes
```

Environment variables remain supported for CI. Do not put credentials in published content or commit local configuration.

## Commands

```text
alab pages setup [options]
alab pages put [dir] [--id <id>] [--dry-run] [--skip-deploy] [--json]
alab pages remove [id] [--dry-run] [--skip-deploy] [--json]
alab pages read [id] [--dir <path>] [--json]
alab pages list [--json]
alab pages open [id]
alab pages info
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
pnpm alab pages put "$scratch_root/site" --dry-run --json
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
