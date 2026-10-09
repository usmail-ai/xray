#!/bin/sh
# Delta pusher. The lock is fd 9. Sleep closes that fd so a stopped pusher
# cannot leave an orphan sleep holding the flock.
set -eu
LOCK=${BURST_LOCK:-${BURST_STATE:-$HOME/.burst}/push.lock}
CHECK=${BURST_PUSH_CHECK:-2}
mkdir -p "$(dirname "$LOCK")"
exec 9>"$LOCK"
flock -n 9 || exit 0
here=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
# Post the delta while the lock is held. A 409 refetches the feed and posts once more.
node "$here/push-delta.mjs" || exit $?
# arch1 inbox only. A miss does not drop the lock or skip the sleep.
node "$here/push-inbox.mjs" || echo "inbox mirror failed" >&2
# The sleep must not inherit fd 9.
sleep "$CHECK" 9>&-
exec 9>&-
