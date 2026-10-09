"""Working signals for a seat. One time per seat. Not an active count.

Lab runs: any file mtime under the seat's run folders in the last 150s
(skip directories named node_modules and .git), or a process whose cwd is
inside the seat's lab folders and that used at least 1s of CPU since the
previous pass (stay lit 120s). Reads mtimes, cwd, and utime+stime only.

GitHub checks: a running, queued, or failing check on a PR the seat
authored, newer than that PR's last merge, within 30 minutes.

Seat activity: fleet/activity.jsonl, one start or end. The seat stays lit
while a start has no later end for the same seat, kind, and tag, for at
most 60 minutes. The line's text is not kept.
"""
from __future__ import annotations

import json
import os
import re
from datetime import datetime
from pathlib import Path

RUN_MTIME_S = 150
CPU_HOLD_S = 120
CPU_MIN_S = 1.0
CHECK_WINDOW_S = 30 * 60
ACTIVITY_HOLD_S = 60 * 60
PROMPT_HOLD_S = 10 * 60
MISSING_WINDOW_S = 60 * 60
_SEAT_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{1,40}$")
SKIP_DIRS = {"node_modules", ".git"}
ACTIVITY_KINDS = {"subagent", "turn", "watcher"}
_FREE_TEXT = re.compile(r"body|text|message", re.I)
CHECK_BUSY = {"queued", "in_progress", "pending", "waiting", "requested", "running"}
CHECK_FAIL = {"failure", "timed_out", "startup_failure", "action_required", "cancelled", "error", "fail"}


def _ts(iso):
    if not iso:
        return None
    try:
        return datetime.fromisoformat(str(iso).replace("Z", "+00:00")).timestamp()
    except (TypeError, ValueError):
        return None


def max_file_mtime(root: Path):
    """Latest file mtime under root. Directory mtimes are ignored. Names are not kept."""
    if not root.is_dir():
        return None
    latest = None
    for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            try:
                mt = os.stat(os.path.join(dirpath, fn), follow_symlinks=False).st_mtime
            except OSError:
                continue
            if latest is None or mt > latest:
                latest = mt
    return latest


def stat_cpu_ticks(stat_path: Path) -> int:
    """utime + stime. The command field in parentheses is discarded."""
    rest = stat_path.read_text().rsplit(")", 1)[-1].split()
    return int(rest[11]) + int(rest[12])


def notes_from_host_ci(author, merged_at, workflow_runs, jobs, commit_status):
    """Busy or failing CI from Actions runs, their jobs, and commit statuses.

    A fine-grained host token has no Checks permission. Names are not stored.
    """
    notes = []
    for run in workflow_runs or []:
        noted = note_check(
            author, merged_at, run.get("status"), run.get("conclusion"),
            run.get("run_started_at") or run.get("created_at"), run.get("updated_at"))
        if noted:
            notes.append(noted)
    for job in jobs or []:
        noted = note_check(
            author, merged_at, job.get("status"), job.get("conclusion"),
            job.get("started_at") or job.get("created_at"), job.get("completed_at"))
        if noted:
            notes.append(noted)
    rollup = commit_status or {}
    state = (rollup.get("state") or "").lower()
    if state == "pending":
        status, conclusion = "pending", None
    elif state in ("failure", "error"):
        status, conclusion = "completed", state
    else:
        status, conclusion = None, None
    if status:
        when = None
        for item in rollup.get("statuses") or []:
            when = item.get("updated_at") or item.get("created_at") or when
        noted = note_check(author, merged_at, status, conclusion, when, when)
        if noted:
            notes.append(noted)
    return notes


def note_check(author, merged_at, status, conclusion, started_at, completed_at):
    """One note from a check run. The check's name is not accepted."""
    st = (status or "").lower()
    conc = (conclusion or "").lower()
    if st not in CHECK_BUSY and conc not in CHECK_FAIL:
        return None
    t = started_at or completed_at
    if not t or not author:
        return None
    return {"author": author, "merged_at": merged_at, "t": t}


def alias_map(seats_config):
    """Display name -> seat id. Comparison is case-insensitive. The map is names only."""
    out = {}
    if not isinstance(seats_config, dict):
        return out
    for display, sid in (seats_config.get("aliases") or {}).items():
        if isinstance(display, str) and isinstance(sid, str) and sid:
            out[" ".join(display.split()).casefold()] = sid
    for seat in seats_config.get("seats") or []:
        if not isinstance(seat, dict):
            continue
        sid = seat.get("id") or (seat.get("plate") or {}).get("seat")
        if not isinstance(sid, str) or not sid:
            continue
        out[sid.casefold()] = sid
        for alias in seat.get("aliases") or []:
            if isinstance(alias, str) and alias.strip():
                out[" ".join(alias.split()).casefold()] = sid
    return out


def canonical_seat(name, aliases=None):
    """Resolve a display name. Unknown free-text names are dropped."""
    if not isinstance(name, str):
        return None
    key = " ".join(name.split()).casefold()
    if not key:
        return None
    table = aliases or {}
    if key in table:
        return table[key]
    for sid in table.values():
        if isinstance(sid, str) and sid.casefold() == key:
            return sid
    if _SEAT_ID.fullmatch(name):
        return name
    return None


def _clean_line(line):
    if not isinstance(line, dict):
        return None
    if any(_FREE_TEXT.search(str(key)) for key in line):
        return None
    if any(isinstance(val, str) and _FREE_TEXT.search(val) for val in line.values()):
        return None
    return line


def read_jsonl(path):
    """JSON objects from a file. A bad line is skipped. Text is not returned as a field."""
    lines = []
    for raw in Path(path).read_text(encoding="utf-8").splitlines():
        raw = raw.strip()
        if not raw:
            continue
        try:
            lines.append(json.loads(raw))
        except ValueError:
            continue
    return lines


def _prompt_seat(row):
    """Seat a prompt line pulses, or None.

    New lines: {t_ct, seat, kind: "prompt", action: "sent"}.
    Legacy lines: {t_ct, from, to} with no seat, kind, or action. The
    seat that got the prompt (`to`) is the one pulsed SENT.
    """
    if row.get("seat") is None and "action" not in row and "kind" not in row:
        if row.get("from") is not None and row.get("to") is not None:
            return row.get("to")
        return None
    if str(row.get("action") or "").casefold() != "sent":
        return None
    kind = row.get("kind")
    if kind is not None and str(kind).casefold() != "prompt":
        return None
    return row.get("seat")


def prompt_pulses(lines, aliases, now):
    """Latest SENT time per seat. Display names use the alias table.

    Accepts the new line shape and legacy {t_ct, from, to} lines.
    """
    latest = {}
    for line in lines or []:
        row = _clean_line(line)
        if row is None:
            continue
        name = _prompt_seat(row)
        if name is None:
            continue
        seat = canonical_seat(name, aliases)
        t = _ts(row.get("t_ct") or row.get("t"))
        if not seat or t is None or t > now + 120:
            continue
        if seat not in latest or t > latest[seat]:
            latest[seat] = t
    return latest


def prompt_working(pulses, now, hold_s=PROMPT_HOLD_S):
    """Working until 10 minutes after a SENT pulse. One time per seat."""
    out = {}
    for seat, t in (pulses or {}).items():
        if now - t > hold_s:
            continue
        out[seat] = t + hold_s
    return out


def missing_activity(pulses, activity_lines, aliases, now, window_s=MISSING_WINDOW_S):
    """Seats that SENT in the last 60 minutes and have no activity line in that window."""
    seen = set()
    for line in activity_lines or []:
        row = _clean_line(line)
        if row is None:
            continue
        seat = canonical_seat(row.get("seat"), aliases)
        t = _ts(row.get("t_ct") or row.get("t"))
        if seat and t is not None and now - window_s <= t <= now + 120:
            seen.add(seat)
    missing = []
    for seat, t in (pulses or {}).items():
        if now - t <= window_s and seat not in seen:
            missing.append(seat)
    return sorted(missing)


def activity_working(lines, now, hold_s=ACTIVITY_HOLD_S, aliases=None):
    """Map seat -> until (unix). One number per seat.

    A start is open when no later end shares its seat, kind, and tag.
    The light ends at that start plus 60 minutes. Names and times only.
    """
    groups = {}
    for line in lines or []:
        if not isinstance(line, dict):
            continue
        if _clean_line(line) is None:
            continue
        kind = line.get("kind")
        action = line.get("action")
        seat = canonical_seat(line.get("seat"), aliases)
        tag = line.get("tag") if line.get("tag") is not None else ""
        if kind not in ACTIVITY_KINDS or action not in ("start", "end"):
            continue
        if not seat:
            continue
        if not isinstance(tag, str) or len(tag) > 80:
            continue
        t = _ts(line.get("t_ct"))
        if t is None or t > now + 120:
            continue
        groups.setdefault((seat, kind, tag), []).append((t, action))
    out = {}
    for (seat, _kind, _tag), events in groups.items():
        events.sort()
        open_start = None
        for t, action in events:
            if action == "start":
                open_start = t
            elif open_start is not None and t >= open_start:
                open_start = None
        if open_start is None:
            continue
        until = open_start + hold_s
        if until <= now:
            continue
        if seat not in out or until > out[seat]:
            out[seat] = until
    return out


def activity_working_file(path, now, hold_s=ACTIVITY_HOLD_S, aliases=None):
    """Read a JSONL file. A bad line is skipped. The text is not returned."""
    return activity_working(read_jsonl(path), now, hold_s, aliases)


def check_working(notes, now, window_s=CHECK_WINDOW_S):
    """Map seat -> until (unix). One number per seat. No PR titles."""
    out = {}
    for note in notes or []:
        author = note.get("author")
        if not author or author == "GitHub":
            continue
        t = _ts(note.get("t"))
        if t is None or t > now + 120 or now - t > window_s:
            continue
        merged = _ts(note.get("merged_at")) if note.get("merged_at") else None
        if merged is not None and t <= merged:
            continue
        until = t + window_s
        if author not in out or until > out[author]:
            out[author] = until
    return out


class RunWatch:
    """In-memory until-times and CPU baselines. Baselines are not written out."""

    def __init__(self):
        self.until = {}
        self.cpu_prev = {}

    def cpu_from_proc(self, labs, proc_root: Path, clk: int):
        folders = []
        for lab in labs or []:
            for rel in (lab.get("folders") or lab.get("runs") or []):
                try:
                    folders.append((lab["seat"], str(Path(rel).resolve())))
                except OSError:
                    continue
        if not folders or not proc_root.is_dir():
            return {}
        totals = {}
        seen = set()
        for entry in proc_root.iterdir():
            if not entry.name.isdigit():
                continue
            pid = entry.name
            try:
                cwd = os.readlink(entry / "cwd")
                ticks = stat_cpu_ticks(entry / "stat")
            except OSError:
                continue
            seat = None
            for name, folder in folders:
                base = folder.rstrip("/")
                if cwd == folder or cwd.startswith(base + "/"):
                    seat = name
                    break
            if not seat:
                continue
            seen.add(pid)
            prev = self.cpu_prev.get(pid)
            self.cpu_prev[pid] = ticks
            if prev is None:
                continue
            delta = (ticks - prev) / float(clk or 100)
            if delta > 0:
                totals[seat] = totals.get(seat, 0.0) + delta
        for pid in list(self.cpu_prev):
            if pid not in seen:
                self.cpu_prev.pop(pid, None)
        return totals

    def scan(self, labs, now, cpu_seconds=None, proc_root=None, clk=None):
        """Return {seat: until}. File names, cwd, and command lines are not in the result."""
        mtimes = {}
        seats = set()
        for lab in labs or []:
            seat = lab.get("seat")
            if not seat:
                continue
            seats.add(seat)
            latest = None
            for rel in lab.get("runs") or []:
                mt = max_file_mtime(Path(rel))
                if mt is not None and (latest is None or mt > latest):
                    latest = mt
            if latest is not None:
                mtimes[seat] = latest
        if cpu_seconds is None:
            root = Path(proc_root) if proc_root else Path("/proc")
            cpu_seconds = self.cpu_from_proc(labs, root, clk or os.sysconf("SC_CLK_TCK") or 100)
        until = {s: t for s, t in self.until.items() if s in seats}
        for seat in seats:
            evidence = 0.0
            mt = mtimes.get(seat)
            if mt is not None and now - mt <= RUN_MTIME_S:
                evidence = mt + RUN_MTIME_S
            if float(cpu_seconds.get(seat, 0) or 0) >= CPU_MIN_S:
                evidence = max(evidence, now + CPU_HOLD_S)
            if evidence:
                until[seat] = max(float(until.get(seat) or 0), evidence)
            elif float(until.get(seat) or 0) < now:
                until.pop(seat, None)
        self.until = until
        return dict(until)


WATCH = RunWatch()
