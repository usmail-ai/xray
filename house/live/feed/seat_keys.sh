#!/usr/bin/env bash
# Per-seat keys for Live board (never printed). mint: create missing keys; publish: set SEAT_KEYS (sha256 hashes) on Railway.
set -euo pipefail
DIR=${SEAT_KEYS_DIR:-/srv/live-mesh-run/secrets/seat-keys}; SEATS="reviewer tester qa coord operator growth qa-one qa-two triager seat-c chatbot seo-researcher seo-writer offsite-copier assistant builder-cloud"
case "${1:-}" in
  mint) umask 077; mkdir -p "$DIR"; chmod 700 "$DIR"
        for s in $SEATS; do kf="$DIR/$s.key"; [ "$s" = builder-cloud ] && kf="$DIR/$s"; [ -s "$kf" ] || head -c 32 /dev/urandom | base64 | tr -d '/+=\n' > "$kf"; chmod 600 "$kf"; done
        echo "keys in $DIR: $(ls "$DIR" | tr '\n' ' ')" ;;
  publish) json=$(python3 -c 'import hashlib,json,sys,os; d=sys.argv[1]; print(json.dumps({s: hashlib.sha256(open(os.path.join(d,s if s=="builder-cloud" else s+".key")).read().strip().encode()).hexdigest() for s in sys.argv[2:]}))' "$DIR" $SEATS)
        cd "${MESH_APP_DEPLOY_DIR:-/srv/live-mesh-app}" && railway variables --service live-mesh --skip-deploys --set "SEAT_KEYS=$json" >/dev/null && echo "SEAT_KEYS published (hashes only)" ;;
  *) echo "usage: $0 mint|publish" >&2; exit 2 ;;
esac
