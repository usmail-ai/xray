#!/usr/bin/env node
// Prints a 1-hour READ-ONLY installation token for GitHub App ops-app (env GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID),
// narrowed to the repos in env LIVE_REPOS (space-separated names, default "app mcp"). Every permission requested and returned must be "read".
// Key comes from env GITHUB_APP_PRIVATE_KEY (pasted with spaces for newlines; repaired in memory). Never logs the key or token.
// stdout: the token only. With --meta: a JSON line on stderr {permissions, expires_at, repositories} (no token).
// Refuses (exit 2, token discarded) if GitHub returns any permission other than "read".
import crypto from "node:crypto";
const PERMS = { metadata: "read", issues: "read", pull_requests: "read", checks: "read", statuses: "read",
                contents: "read", actions: "read" };
const REPOS = (process.env.LIVE_REPOS || "app mcp").split(/\s+/).filter(Boolean);
const APP_ID = process.env.GITHUB_APP_ID, INSTALL_ID = process.env.GITHUB_APP_INSTALLATION_ID;
if (!APP_ID || !INSTALL_ID) { console.error("GITHUB_APP_ID / GITHUB_APP_INSTALLATION_ID not set"); process.exit(1); }
const raw = process.env.GITHUB_APP_PRIVATE_KEY;
if (!raw) { console.error("GITHUB_APP_PRIVATE_KEY not set"); process.exit(1); }
const m = raw.match(/-----BEGIN ([A-Z ]+)-----([\s\S]*?)-----END \1-----/);
if (!m) { console.error("GITHUB_APP_PRIVATE_KEY is not a PEM"); process.exit(1); }
const key = `-----BEGIN ${m[1]}-----\n${m[2].replace(/\s+/g, "").match(/.{1,64}/g).join("\n")}\n-----END ${m[1]}-----\n`;
const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const unsigned = b({ alg: "RS256", typ: "JWT" }) + "." + b({ iat: now - 60, exp: now + 540, iss: APP_ID });
const jwt = unsigned + "." + crypto.createSign("RSA-SHA256").update(unsigned).sign(key, "base64url");
const r = await fetch(`https://api.github.com/app/installations/${INSTALL_ID}/access_tokens`, {
  method: "POST",
  headers: { Authorization: `Bearer ${jwt}`, Accept: "application/vnd.github+json",
             "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
  body: JSON.stringify({ permissions: PERMS, repositories: REPOS }) });
const j = await r.json();
if (!j.token) { console.error("mint failed:", r.status, j.message); process.exit(1); }
const perms = j.permissions || {};
const bad = Object.entries(perms).filter(([, v]) => v !== "read");
if (!Object.keys(perms).length || bad.length) {
  console.error("refusing token: non-read permissions", JSON.stringify(bad)); process.exit(2);
}
if (process.argv.includes("--meta")) {
  console.error(JSON.stringify({ permissions: perms, expires_at: j.expires_at,
    repository_selection: j.repository_selection, repositories: (j.repositories || []).map((x) => x.full_name) }));
}
process.stdout.write(j.token);
