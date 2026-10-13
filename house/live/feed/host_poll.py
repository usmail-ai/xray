#!/usr/bin/env python3
"""Read-only Railway deploy poller for the Operator node (run by watchdog.sh every ~3 min, NOT by the feed).

It runs only `railway deployment list --json` (fixed argv: never approve, redeploy, up or variables) with the
box's logged-in CLI, so the Railway login never enters the credential-free feed process. It writes a sanitized
file the feed reads: short deployment id, project/service/environment names, status, created time and whether it
came from a CLI upload (no commit hash = a deploy the Operator triggered). It keeps no commit messages, authors,
URLs or logs.
"""
import json, os, subprocess, sys, time
from datetime import datetime, timezone
from pathlib import Path

RUN = Path(os.environ.get("MESH_RUN", "/srv/live/run"))
OUT = Path(os.environ.get("LIVE_RAILWAY_FILE", RUN / "feed" / "railway-deploys.json"))
# project name, project id, service, environments. Set LIVE_RAILWAY_TARGETS to a JSON list of
# [project_name, project_id, service, [environments...]]; nothing is polled when it is unset.
TARGETS = [(p, i, s, tuple(e)) for p, i, s, e in json.loads(os.environ.get("LIVE_RAILWAY_TARGETS", "[]"))]
# example: [["app-project", "<project id>", "app", ["development", "production"]], ["mcp-project", "<project id>", "mcp", ["production"]]]
ALLOWED = ("deployment", "list")   # the only subcommand this script may run


def list_deploys(pid, service, env):
    argv = ["railway", *ALLOWED, "--project", pid, "--service", service, "--environment", env, "--limit", "20", "--json"]
    assert argv[1:3] == list(ALLOWED)
    r = subprocess.run(argv, capture_output=True, text=True, timeout=45, cwd="/tmp")
    if r.returncode:
        raise RuntimeError(f"railway exit {r.returncode}")
    return json.loads(r.stdout or "[]")


def main():
    out, errors = [], []
    for pname, pid, service, envs in TARGETS:
        for env in envs:
            try:
                for d in list_deploys(pid, service, env):
                    meta = d.get("meta") or {}
                    out.append({"id": str(d.get("id", ""))[:8], "project": pname, "service": service, "env": env,
                                "status": str(d.get("status", ""))[:20], "created": d.get("createdAt"),
                                "cli": not meta.get("commitHash")})
            except Exception as ex:   # noqa: BLE001 (one target failing must not stop the others)
                errors.append(f"{service}/{env}: {type(ex).__name__}")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUT.with_suffix(f".tmp.{os.getpid()}")
    tmp.write_text(json.dumps({"polled_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                               "deploys": out, "errors": errors}))
    os.replace(tmp, OUT)
    print(f"host_poll: {len(out)} deployments, {len(errors)} errors", file=sys.stderr)


if __name__ == "__main__":
    main()
