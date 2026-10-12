#!/usr/bin/env bash
# Per-seat keys for the live board (never printed).
#   mint     create missing keys
#   publish  set SEAT_KEYS (sha256 hashes only) on Railway
# Seats: SEAT_KEYS_SEATS (space-separated tokens) or SEATS_JSON (a JSON list, or {"seats":[...]}
# of strings or objects with id / plate.seat). Unset keeps the example seat list.
# Service: LIVE_RAILWAY_SERVICE (default live-mesh). Deploy dir: MESH_APP_DEPLOY_DIR (default /srv/live/deploy).
set -euo pipefail
DIR=${SEAT_KEYS_DIR:-/srv/live/run/secrets/seat-keys}
SERVICE=${LIVE_RAILWAY_SERVICE:-live-mesh}
DEPLOY=${MESH_APP_DEPLOY_DIR:-/srv/live/deploy}
DEFAULT_SEATS="reviewer tester qa coord operator growth qa-one qa-two triager seat-c chatbot seo-researcher seo-writer offsite-copier assistant builder-cloud"

seats_from_json() {
  python3 -c 'import json,sys
m=json.load(open(sys.argv[1]))
xs=m if isinstance(m, list) else (m.get("seats") or [])
out=[]
for s in xs:
    if isinstance(s, str) and s.strip():
        out.append(s.strip())
    elif isinstance(s, dict):
        name=s.get("id") or (s.get("plate") or {}).get("seat") or ""
        if isinstance(name, str) and name.strip():
            out.append(name.strip())
print(" ".join(out))' "$1"
}

if [ -n "${SEAT_KEYS_SEATS:-}" ]; then
  SEATS=$SEAT_KEYS_SEATS
elif [ -n "${SEATS_JSON:-}" ]; then
  [ -f "$SEATS_JSON" ] || { echo "SEATS_JSON is not a file" >&2; exit 1; }
  SEATS=$(seats_from_json "$SEATS_JSON")
else
  SEATS=$DEFAULT_SEATS
fi
[ -n "${SEATS// /}" ] || { echo "no seats" >&2; exit 1; }

key_path() {  # prefer <seat>.key; a legacy bare file still counts
  if [ -f "$DIR/$1.key" ]; then printf '%s\n' "$DIR/$1.key"
  elif [ -f "$DIR/$1" ]; then printf '%s\n' "$DIR/$1"
  else printf '%s\n' "$DIR/$1.key"; fi
}

case "${1:-}" in
  mint)
    umask 077; mkdir -p "$DIR"; chmod 700 "$DIR"
    for s in $SEATS; do
      kf=$(key_path "$s")
      if [ -s "$kf" ]; then continue; fi
      kf="$DIR/$s.key"
      head -c 32 /dev/urandom | base64 | tr -d '/+=\n' > "$kf"
      chmod 600 "$kf"
    done
    echo "keys in $DIR: $(ls "$DIR" | tr '\n' ' ')" ;;
  publish)
    json=$(python3 -c '
import hashlib, json, os, sys
d, seats = sys.argv[1], sys.argv[2:]
out = {}
for s in seats:
    keyed, bare = os.path.join(d, s + ".key"), os.path.join(d, s)
    path = keyed if os.path.isfile(keyed) else bare
    out[s] = hashlib.sha256(open(path).read().strip().encode()).hexdigest()
print(json.dumps(out))
' "$DIR" $SEATS)
    cd "$DEPLOY"
    railway variables --service "$SERVICE" --skip-deploys --set "SEAT_KEYS=$json" >/dev/null
    echo "SEAT_KEYS published (hashes only)" ;;
  *) echo "usage: $0 mint|publish" >&2; exit 2 ;;
esac
