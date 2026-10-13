# Upstream watcher

`UPSTREAM_REPO` (or `XRAY_REPO`) names one public repository. Unset means the watcher is off.

The board keeps one pinned card per number in `UPSTREAM_PINNED` (`owner/name#N`) plus threads that involve this fleet: authored by, assigned to, review-requested from, or mentioning a login in `XRAY_OURS`. Both lists are empty when unset, so a repo with neither setting tracks nothing.

The open-pull list (`_pulls`) runs only while the read token is authenticated. A 401, 403, or 404 drops to unauthenticated public reads, and `_pulls` then returns without calling GitHub. Bodies are used only to set flags and are not stored.
