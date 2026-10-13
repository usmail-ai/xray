"""Restart one feed command until the stop file appears.

Python 3.9. The process is started by the caller-supplied popen so tests
do not spawn a real feed.
"""
import os
import time

EXIT_REMINT = 75
REMINT_AFTER_S = 50 * 60


def remint_due(minted_at, now, limit_s=REMINT_AFTER_S):
    """True when wall-clock age has reached the limit.

    `minted_at` and `now` are time.time() values. A paused VM jumps the wall
    clock. A frozen counter would not. Callers pass the wall clock.
    """
    return (float(now) - float(minted_at)) >= float(limit_s)


def run(command, popen, stop_path, sleep=time.sleep, max_restarts=100, pause_s=1):
    """Start command, and start it again when it exits. Stop when stop_path exists."""
    starts = 0
    codes = []
    while starts <= max_restarts:
        if os.path.exists(stop_path):
            return {"starts": starts, "codes": codes, "stopped": True}
        proc = popen(command)
        code = proc.wait()
        starts += 1
        codes.append(code)
        if os.path.exists(stop_path):
            return {"starts": starts, "codes": codes, "stopped": True}
        sleep(pause_s)
    return {"starts": starts, "codes": codes, "stopped": False}
