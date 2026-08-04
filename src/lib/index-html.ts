import { createCipheriv, pbkdf2Sync, randomBytes } from "node:crypto";
import type { ManifestEntry } from "./store.js";

export function buildPublicLandingHtml(opts: {
  pageCount: number;
  baseUrl: string;
}): string {
  const { pageCount, baseUrl } = opts;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>agentlab pages</title>
  <style>
    :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, sans-serif; }
    body { max-width: 36rem; margin: 4rem auto; padding: 0 1.25rem; line-height: 1.5; }
    h1 { font-size: 1.25rem; font-weight: 600; margin: 0 0 0.5rem; }
    p { color: #666; margin: 0.4rem 0; }
    @media (prefers-color-scheme: dark) { p { color: #aaa; } }
    code { font-size: 0.9em; }
  </style>
</head>
<body>
  <h1>agentlab pages</h1>
  <p>Scratch host for tiny HTML apps. Publish with <code>alab pages put .</code></p>
  <p>${pageCount} page${pageCount === 1 ? "" : "s"} live under <code>${escapeHtml(baseUrl)}/&lt;id&gt;/</code></p>
  <p>Set <code>indexPassword</code> in <code>~/.alab/config.json</code> to enable a password-gated directory of ids.</p>
</body>
</html>
`;
}

/**
 * Root index that decrypts a page list in the browser.
 * Not a substitute for real access control on individual pages (those stay public).
 * Only hides the directory listing behind a password.
 */
export function buildEncryptedIndexHtml(opts: {
  password: string;
  pages: ManifestEntry[];
  baseUrl: string;
}): string {
  const payload = {
    baseUrl: opts.baseUrl,
    pages: opts.pages.map((p) => ({
      id: p.id,
      fileCount: p.fileCount,
      bytes: p.bytes,
      updatedAt: p.updatedAt,
      url: `${opts.baseUrl.replace(/\/$/, "")}/${p.id}/`,
    })),
  };

  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = pbkdf2Sync(opts.password, salt, 100_000, 32, "sha256");
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const blob = Buffer.concat([encrypted, tag]).toString("base64");

  const saltB64 = salt.toString("base64");
  const ivB64 = iv.toString("base64");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>agentlab pages</title>
  <style>
    :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, sans-serif; }
    body { max-width: 40rem; margin: 3rem auto; padding: 0 1.25rem; line-height: 1.45; }
    h1 { font-size: 1.25rem; font-weight: 600; margin: 0 0 1rem; }
    form { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
    input[type=password] {
      flex: 1; padding: 0.5rem 0.65rem; border: 1px solid #ccc; border-radius: 6px;
      font: inherit; background: transparent;
    }
    button {
      padding: 0.5rem 0.9rem; border: 0; border-radius: 6px; font: inherit;
      background: #111; color: #fff; cursor: pointer;
    }
    @media (prefers-color-scheme: dark) {
      button { background: #eee; color: #111; }
      input[type=password] { border-color: #444; }
    }
    .err { color: #c00; font-size: 0.9rem; min-height: 1.2em; }
    ul { list-style: none; padding: 0; margin: 0; }
    li {
      display: flex; justify-content: space-between; gap: 1rem;
      padding: 0.55rem 0; border-bottom: 1px solid #e5e5e5;
    }
    @media (prefers-color-scheme: dark) { li { border-color: #333; } }
    a { color: inherit; font-weight: 500; }
    .meta { color: #888; font-size: 0.85rem; white-space: nowrap; }
    #list { display: none; }
    #list.show { display: block; }
  </style>
</head>
<body>
  <h1>agentlab pages</h1>
  <form id="gate" autocomplete="current-password">
    <input id="pw" type="password" placeholder="Index password" required />
    <button type="submit">Unlock</button>
  </form>
  <p class="err" id="err"></p>
  <ul id="list"></ul>
  <script type="module">
const SALT_B64 = ${JSON.stringify(saltB64)};
const IV_B64 = ${JSON.stringify(ivB64)};
const BLOB_B64 = ${JSON.stringify(blob)};
const ITER = 100000;

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function formatBytes(n) {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / (1024 * 1024)).toFixed(2) + " MB";
}

async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
}

async function unlock(password) {
  const salt = b64ToBytes(SALT_B64);
  const iv = b64ToBytes(IV_B64);
  const blob = b64ToBytes(BLOB_B64);
  const tagLen = 16;
  const data = blob.slice(0, blob.length - tagLen);
  const tag = blob.slice(blob.length - tagLen);
  const cipher = new Uint8Array(data.length + tag.length);
  cipher.set(data, 0);
  cipher.set(tag, data.length);
  const key = await deriveKey(password, salt);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return JSON.parse(new TextDecoder().decode(plain));
}

const form = document.getElementById("gate");
const err = document.getElementById("err");
const list = document.getElementById("list");
const saved = sessionStorage.getItem("alab-pages-pw");
if (saved) form.pw.value = saved;

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  err.textContent = "";
  const password = form.pw.value;
  try {
    const data = await unlock(password);
    sessionStorage.setItem("alab-pages-pw", password);
    form.style.display = "none";
    list.innerHTML = "";
    for (const p of data.pages) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = p.url;
      a.textContent = p.id;
      a.target = "_blank";
      a.rel = "noopener";
      const meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = formatBytes(p.bytes) + " · " + p.updatedAt.slice(0, 10);
      li.append(a, meta);
      list.append(li);
    }
    if (!data.pages.length) {
      list.innerHTML = "<li class='meta'>No pages yet.</li>";
    }
    list.classList.add("show");
  } catch {
    err.textContent = "Wrong password or corrupt index.";
    sessionStorage.removeItem("alab-pages-pw");
  }
});

if (saved) form.requestSubmit();
  </script>
</body>
</html>
`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
