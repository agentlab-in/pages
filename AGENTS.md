# AgentLab Pages

This repository contains `@agentlab/pages`, the implementation behind
`alab pages`: publishing directories of static files to one Cloudflare Pages
project. Its public URL namespace is `https://pages.agentlab.in/<id>/`.

The package publishes no bins. Users run the single `alab` binary owned by
`alab-cli`, which mounts this repository's `pages` command. Development runs
through `pnpm alab pages ...`.

These instructions apply only inside this repository. Follow the workspace-level
instructions in the parent directory as well.

## Product boundaries

- This is a scratch host for small static HTML, CSS, JavaScript, and asset bundles.
- It is not a general hosting platform, authentication service, versioned content
  store, or per-page domain manager.
- Every page at `/<id>/` is public to anyone who knows or discovers the URL.
- The optional root password protects only the directory listing. It does not
  restrict direct access to any published page.
- One deployment contains the complete local snapshot of every stored page. A
  put or remove can therefore affect the deployed project as a whole.
- Cloudflare Pages, its project configuration, custom domains, and DNS are
  external infrastructure. Do not change any of them unless explicitly asked.

## Runtime and tooling

- Node.js 20 or newer is required.
- Use `pnpm` for dependency installation and repository scripts.
- The package is ESM and TypeScript uses `NodeNext` module resolution.
- Source imports include `.js` extensions intentionally so compiled ESM works.
  Preserve that convention in TypeScript files.
- Deployments use the Cloudflare Pages REST API directly through `fetch` in
  `src/lib/deploy.ts` and `src/lib/cloudflare.ts`. There is no Wrangler
  dependency, subprocess, or global installation.

Useful commands:

```bash
pnpm install
pnpm build
pnpm test
pnpm alab pages info
pnpm alab pages put <directory> --dry-run
```

This package publishes no bins, so there is nothing to link globally. The
`pnpm alab` script runs the development-only `src/cli.ts`, which behaves like
the `alab` binary root with the `pages` command mounted.

## Architecture

The execution path is intentionally shallow:

```text
src/cli.ts (development-only entry, behaves like the alab binary root)
  -> src/program.ts (createPagesCommand mountable builder, side-effect free for integration)
  -> src/commands/{setup,put,delete,ls,read,open}.ts
  -> src/lib/{config,state,store,assemble,deploy,cloudflare,index-html,id,paths}.ts
  -> local content store and, for a real deploy, the Cloudflare Pages API
```

Key responsibilities:

- `src/cli.ts` is a development-only entry point. It builds the dev root,
  parses once, and re-exports `createPagesCommand` and `createProgram` from
  `src/program.ts`. Shared binary integrations must import from
  `src/program.ts`, never from `src/cli.ts`.
- `src/program.ts` exports `createPagesCommand`, the mountable `pages`
  command the `alab` binary attaches with `addCommand`, and `createProgram`,
  the dev root named `alab` with `pages` mounted. There are no standalone
  top-level commands and no legacy compatibility route. It also defines the
  read-only `info` command, Commander options, help text, and exit behavior.
  Both the dev root and the mountable `pages` command use `exitOverride`, so
  errors throw instead of exiting and the hosting binary owns exit codes.
- `src/commands/setup.ts` prompts for or accepts a Cloudflare API token,
  selects an account, creates or reuses the Pages project, stores the token
  in macOS Keychain when available, and writes local configuration.
- `src/commands/put.ts` resolves the source directory, chooses an ID, copies the
  source into the store, writes per-directory state, then assembles or deploys.
- `src/commands/delete.ts` backs the `remove` command (`delete` is an alias).
  It resolves and validates an ID, removes it from the local
  store, clears matching per-directory state, then optionally redeploys.
- `src/commands/ls.ts` backs `list` (`ls` is an alias). It lists the local
  store and derives public URLs.
- `src/commands/read.ts` shows local metadata and the public URL for one page.
  It never downloads deployed files.
- `src/commands/open.ts` validates a locally known ID, launches the platform URL
  opener, and prints the URL.
- `src/lib/config.ts` merges environment variables, explicit overrides, config
  file values, and defaults, in that precedence order.
- `src/lib/paths.ts` owns all paths under `ALAB_HOME` and
  `ALAB_PAGES_CONTENT`. Do not duplicate these path rules elsewhere.
- `src/lib/state.ts` owns `<published-directory>/.alab/pages.json`, which keeps an
  existing page ID stable across later puts.
- `src/lib/store.ts` owns validation, copying, manifest reconciliation, page ID
  allocation, size limits, and deletion in the local content store.
- `src/lib/assemble.ts` creates a temporary, complete Pages deploy root containing
  all stored sites, the root index, and `_manifest.json`.
- `src/lib/index-html.ts` generates either the public root landing page or the
  client-side encrypted directory listing.
- `src/lib/deploy.ts` talks to the Cloudflare Pages API directly with `fetch`:
  request an asset upload token, check missing content hashes, upload missing
  assets, upsert hashes, create a deployment with an explicit production
  branch, then poll until it succeeds or fails. The explicit branch prevents
  a feature branch or worktree from silently becoming a preview deployment.
- `src/lib/cloudflare.ts` lists Cloudflare accounts and creates or reuses the
  configured Pages project during setup.
- `src/lib/id.ts` is the sole authority for page ID generation and validation.

## State and side effects

There are three distinct state boundaries. Keep them explicit in code and tests.

### Repository state

- Source, tests, config examples, and documentation are tracked here.
- `dist/`, `node_modules/`, `.wrangler/`, `.tmp-deploy/`, logs, and the local
  `config.json` are ignored.
- Do not commit built output, credentials, local content, or generated page state.

### Local user state

- Configuration defaults to `~/.alab/config.json`.
- Stored content defaults to `~/.alab/pages-content/`.
- The store contains `manifest.json` and `sites/<id>/...`.
- A published source directory receives `.alab/pages.json` containing its stable
  ID and derived URL.
- Tests must isolate this state with temporary directories and set `ALAB_HOME`
  and `ALAB_PAGES_CONTENT`. They must remove both environment variables and the
  temporary directory during cleanup.
- Never inspect, print, overwrite, or commit a real config file, API token,
  account ID, index password, or unrelated content from the user's store.

### External state

- A real deploy sends the assembled full snapshot to the configured Cloudflare
  Pages project and production branch.
- `pages open` starts an external browser process.
- Project creation, custom domains, DNS changes, publishing, and deletion from the
  live site are external writes. Perform them only when explicitly requested.

## Command semantics

Treat command flags according to their actual behavior, not their names alone:

| Command | Local store | Source `.alab/pages.json` | Temp assembly | Cloudflare |
| --- | --- | --- | --- | --- |
| `info` | May read config paths | No change | No | No |
| `list` / `ls` | Reconciles and rewrites manifest | No change | No | No |
| `read` | Reads manifest | No change | No | No |
| `open` | Reads manifest | No change | No | No, but opens browser |
| `setup` | No change to pages; writes config and may use Keychain | No change | No | Yes: validates token, lists accounts, creates or reuses project |
| `put --skip-deploy` | Writes or replaces page | Writes | No | No |
| `put --dry-run` | Writes or replaces page | Writes | Yes | No |
| `put` | Writes or replaces page | Writes | Yes | Yes |
| `remove` / `delete --skip-deploy` | Deletes page | Clears matching state | No | No |
| `remove` / `delete --dry-run` | Deletes page | Clears matching state | No | No |
| `remove` / `delete` | Deletes page | Clears matching state | Yes | Yes |

Important: `--dry-run` is deployment-only. It does not make `put` or `remove`
read-only. Both commands mutate local user state before deployment is skipped.
Never run either against the real local store merely to inspect behavior.

`put` requires a directory with an `index.html`, accepts at most 200 files and 5
MiB total, and skips `.git`, `.alab`, `node_modules`, `.DS_Store`, `Thumbs.db`,
and names beginning with `.env`. Explicit IDs normalize to lowercase and must be
4 to 32 lowercase ASCII letters or digits.

`remove` (`delete` is an alias) rejects IDs absent from the local manifest.
A successful local deletion before a failed deploy remains a local deletion.
Do not assume rollback.

## Safe development workflow

For CLI experiments, isolate all state even when using `--dry-run`:

```bash
scratch_root="$(mktemp -d)"
export ALAB_HOME="$scratch_root/home"
export ALAB_PAGES_CONTENT="$scratch_root/content"
mkdir -p "$scratch_root/site"
printf '<h1>test</h1>\n' > "$scratch_root/site/index.html"
pnpm alab pages put "$scratch_root/site" --dry-run --json
```

Do not set Cloudflare credentials for local tests. A safe dry run must never
contact Cloudflare. Remove the explicit temporary directory after
inspection. Do not use broad paths or unresolved variables for cleanup.

When changing deployment behavior, test `deployAll` and `uploadSnapshot`
directly with an injected `fetch` mock rather than contacting Cloudflare.
Preserve the explicit production `branch` and `commit_dirty` deployment fields
and the upload-token, check-missing, upload, upsert-hashes, deployments
sequence unless the product contract is intentionally being changed.

## Security and public content

- Treat all published files as world-readable, including source maps, comments,
  embedded JSON, asset metadata, and client-side JavaScript.
- Never publish `.env` files, tokens, private keys, cookies, personal data,
  internal URLs, or credentials. The skip rules are a backstop, not permission to
  publish an unreviewed directory.
- Do not describe the encrypted root listing as authentication or access control.
  It only obscures page IDs in the root index.
- The index password is embedded indirectly through derived ciphertext and is used
  in the browser. Individual site URLs remain ungated.
- Keep page IDs path-safe. All filesystem destinations derived from an ID must pass
  through `assertValidId` or an equivalent single validation boundary.
- Preserve HTML escaping for values interpolated into generated markup. Prefer DOM
  construction and `textContent` for decrypted or dynamic values.
- Be cautious with symlinks and filesystem traversal when modifying the walker.
  Any change must keep copied content confined to the intended source and store.
- JSON output is an automation interface. Keep it valid JSON on stdout and send
  progress or subprocess output to stderr.

## Tests and verification

Tests use Vitest and live under `tests/`. Match a behavior change to the narrowest
relevant suite:

- `store.test.ts`: source walking, validation, replacement, manifest, deletion.
- `state.test.ts`: per-directory ID state lifecycle.
- `assemble.test.ts`: full snapshot layout and public or encrypted root indexes.
- `deploy.test.ts`: direct Pages API upload sequence, production branch
  pinning, and deployment polling with an injected `fetch` mock.
- `cloudflare.test.ts`: account listing and project creation or reuse.
- `setup.test.ts`: setup prompts, account selection, config and Keychain writes.
- `read.test.ts`: local metadata reads and URL derivation.
- `cli.test.ts`: the single `pages` mount surface on the dev root and on
  `createPagesCommand`, the side-effect free `src/program.ts` integration
  entry point, exact help streams, and exact error streams and exit status.
- `id.test.ts`: ID format, normalization, generation, and traversal rejection.

For normal code changes, run both:

```bash
pnpm test
pnpm build
```

Documentation-only changes require at least `pnpm test` unless dependencies are
unavailable. Report exactly what ran, passed, failed, or was skipped. Never use a
live deployment as routine verification.

Add regression tests for changed command behavior, state transitions, validation,
generated HTML, JSON output, or deployment arguments. Tests must not depend on the
real home directory, network, Cloudflare credentials, browser, or global tools.

## Change discipline

- Keep command orchestration in `src/commands` and reusable rules in `src/lib`.
- Preserve the simple synchronous filesystem model unless a concrete requirement
  justifies changing it.
- Avoid adding frameworks or runtime dependencies for behavior available from
  Node.js standard modules.
- Keep user-facing help, README examples, command behavior, and tests aligned.
- Preserve unrelated worktree changes.
- Do not deploy, publish the package, push, change DNS, or modify Cloudflare unless
  the task explicitly authorizes that action.
- Do not commit unless explicitly requested.

## Definition of done

A change is complete when:

1. The requested behavior is implemented within this repository's product scope.
2. Public-page exposure and local versus external side effects were reviewed.
3. IDs, paths, credentials, generated HTML, and JSON output remain safe.
4. Relevant regression tests were added or updated.
5. `pnpm test` passes.
6. `pnpm build` passes for source changes.
7. README and CLI help are updated when the user-visible contract changed.
8. No live deploy, publish, DNS change, secret exposure, or unrelated file change
   occurred without explicit authorization.
9. The handoff states the files changed and the exact verification results.
