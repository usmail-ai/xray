# Per-seat GitHub App

The install steps, manifests, and token mint are in [SETUP.md](SETUP.md). This page is the plan the code builds.

`mintPlan` builds the access-token request for one seat from config: app id, installation id, permissions, and repository names. It does not read a key and it does not print a token.

`permissionDrift` lists returned permissions that were not requested at that level. An empty permission map is drift. The caller discards the token when the list is not empty.

`readOnlyPlan` refuses any permission that is not `read`. `bin/gh` sets that mode. `bin/git-credential` and `bin/use-repo` take the bot login and id from the environment.

## Seat on a laptop

Put `house/burst/bin` first on `PATH`, ahead of a system or Homebrew `gh`. The mint CLI caches the installation token and reuses it until 120 seconds before `expires_at`. `git-credential` is the HTTPS helper and returns that token. Author commits as `<app-slug>[bot]` with that bot's noreply address, not a human name. Push with `git push origin HEAD:<branch>`. The seat polls its repos every 30 seconds and posts one `POST /activity` when a turn starts; the turn stays open until `end`. The app can push to the org's fork. Opening or merging on an upstream org needs an admin there. Ids and the key come from the environment. The accepted token shape is `^ghs_[A-Za-z0-9._-]{20,1024}$`.
