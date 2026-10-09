# Burst

Live activity for the house mesh.

The install a human and a bot can follow is [SETUP.md](SETUP.md). Watchers and the fixes log are in [PLAYBOOK.md](PLAYBOOK.md).

## Setup

[SETUP.md](SETUP.md) is the full sequence: GitHub Apps, tokens, the hosted collector, the box pusher, seat wrappers, activity lines, and the plate stamp.

Short form for the host token:

1. Create a fine-grained personal access token. GitHub: Settings → Developer settings → Personal access tokens → Fine-grained.
2. Resource owner: your org.
3. Repository access: only the watched repos.
4. Permissions, read-only: Contents, Pull requests, Issues, Actions, Commit statuses. Metadata is included automatically.
5. Fine-grained tokens have no Checks permission. The collector derives check state from Actions runs and jobs, and from commit statuses.
6. Set the token as the host variable `GITHUB_READ_TOKEN`.
7. Keep the GitHub App private key on the seat box. That key can mint write tokens.
8. Keep the token out of the repo. Set an expiry and rotate it.

The box or laptop pushes only local signals (prompt lines, cloud-agent logs, lab-run mtimes) as deltas. The server merges them by id. If the box is down, GitHub events still flow and box-sourced seat state shows stale.

A seat that commits from a laptop uses `house/burst/bin` for its own git and `gh` identity. See [SETUP.md](SETUP.md) sections 6 and 7.
