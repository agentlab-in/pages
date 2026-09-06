# agentlab pages

Scratch web host for tiny HTML/CSS/JS apps. Agents (or you) run one command and get a stable public URL on Cloudflare Pages.

```bash
alab pages put .
# ✓ Stored 3 files (147 KB) as f2k9aq
# ✓ Deployed 1 page(s) to agentlab-pages
#   URL: https://pages.agentlab.in/f2k9aq/
```

## What this is

| Piece | Choice |
|-------|--------|
| Host | One Cloudflare Pages project (`agentlab-pages`) |
| URL shape | `https://pages.agentlab.in/<id>/` |
| Content store | Local: `~/.alab/pages-content/sites/<id>/` |
| Deploy | `wrangler pages deploy` (via `npx wrangler@4`) |
| Id stability | `.alab/pages.json` in the published directory |
| Deploy branch | Always the production branch (`main` by default), pinned with `--branch` |

Not in scope: per-page subdomains, R2/Workers custom hosting, version history, auth on individual pages.

**Security note:** every page under `/<id>/` is **public**. Only the root directory listing can be password-gated (optional client-side AES). Do not put secrets in published HTML.

## One-time Cloudflare setup

1. Install nothing global; the CLI shells out to `npx wrangler@4`.

2. Create a Pages project (once):

   ```bash
   export CLOUDFLARE_API_TOKEN=...   # Account → Cloudflare Pages → Edit
   export CLOUDFLARE_ACCOUNT_ID=...
   npx wrangler@4 pages project create agentlab-pages --production-branch=main
   ```

3. Attach custom domain in the Cloudflare dashboard:
   - Project **agentlab-pages** → Custom domains → `pages.agentlab.in`
   - DNS for `agentlab.in` must be on Cloudflare (CNAME/managed by Pages).

4. Configure the CLI (either env or config file):

   ```bash
   mkdir -p ~/.alab
   cat > ~/.alab/config.json <<'EOF'
   {
     "cloudflareAccountId": "YOUR_ACCOUNT_ID",
     "pagesProject": "agentlab-pages",
     "pagesBaseUrl": "https://pages.agentlab.in",
     "pagesBranch": "main",
     "indexPassword": "pick-a-strong-password"
   }
   EOF
   ```

   On macOS, store the token in Keychain instead of this file. The CLI reads
   the item named `alab-pages-cloudflare-token` for the current account:

   ```bash
   read -rsp "Cloudflare token: " token; printf '\n'
   security add-generic-password -U -a "$USER" \
     -s "alab-pages-cloudflare-token" -w "$token"
   unset token
   ```

   Prefer env for the token in CI:

   ```bash
   export CLOUDFLARE_API_TOKEN=...
   export CLOUDFLARE_ACCOUNT_ID=...
   # optional:
   export ALAB_PAGES_INDEX_PASSWORD=...
   ```

   If `indexPassword` / `ALAB_PAGES_INDEX_PASSWORD` is set, `https://pages.agentlab.in/` shows a password form and decrypts the id list in the browser. If unset, the root is a plain landing page with no id listing.

5. Smoke test:

   ```bash
   mkdir /tmp/demo-page && echo '<h1>hello</h1>' > /tmp/demo-page/index.html
   pnpm alab pages put /tmp/demo-page
   open https://pages.agentlab.in/<id>/
   ```

## Install (this repo)

```bash
cd pages
pnpm install
pnpm build
pnpm link --global   # optional: puts `alab` on PATH
```

Dev without build:

```bash
pnpm alab pages put ./example --dry-run
```

## Commands

```text
alab pages put [dir] [--id <id>] [--dry-run] [--skip-deploy] [--json]
alab pages ls [--json]
alab pages open [id]
alab pages delete [id] [--skip-deploy] [--json]
alab pages info
```

### Agent loop

1. Generate HTML into a folder (must include `index.html`).
2. `alab pages put .`
3. Return the printed URL to the user.
4. On edits, run `alab pages put .` again (same URL; id lives in `.alab/pages.json`).

### Limits

- Max **5 MB** and **200 files** per page.
- Skips `.git`, `node_modules`, `.alab`, `.env*`.
- Each `put` redeploys the **full** project snapshot (all pages). Cloudflare free tier is ~500 deployments/month.
- Deploys pass `--branch` explicitly. Without it wrangler infers the branch from the cwd's git repo, so publishing from any feature branch or agent worktree silently produces a *preview* deployment that never reaches `pages.agentlab.in`.

## Layout

```text
pages/
  src/
    cli.ts
    commands/     put, ls, open, delete
    lib/          store, assemble, deploy, config, encrypted index
  tests/
  f1.md           idea dump (historical)
```

Local data (not in git):

```text
~/.alab/config.json
~/.alab/pages-content/
  manifest.json
  sites/<id>/...
```

## Tests

```bash
pnpm test
```
