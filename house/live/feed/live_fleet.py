"""Fleet state from files the fleet already writes on this box. Zero bot turns, zero LLM calls, zero API calls.

Runs inside the 60 s watcher pass. A file is (re)read only when its mtime or size changed (state: fleet-state.json),
and an event is emitted only when something changed. Events carry ONLY ids, severity, status words, counts, times
and a short relative source tag. Never: bug text, repro steps, file contents, emails, names or customer data.
Only the roots below are walked. Lab fixtures (labtest/fixtures-*, labtest/prod-*), exports and scripts are never
read. In run scratch dirs (qa/runs/mq*) only http/probe call logs are read, and only their HTTP status lines are
counted (no URLs, headers or bodies).
"""
import hashlib, json, os, re, subprocess, time
from datetime import datetime
from pathlib import Path

WS = Path(os.environ.get("LIVE_FLEET_ROOT", "/srv"))
LABQA, LABTEST, HOUSE = WS / "qa", WS / "labtest", WS / "fleet-house" / "house"
OP_REPO = Path(os.environ.get("LIVE_OPERATOR_REPO", WS / "live-mesh-repo"))   # ops-app commits (git log only)
CLOUD_SEATS = {"Builder", "Builder-cloud", "Reviewer", "Tester", "QA", "QaOne", "QaTwo", "Operator", "Coord", "Lead"}
CLOUD_ACTIONS = {"launch", "reply", "finished", "cancel"}
CLOUD_AGENT_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{2,40}")
PROMPT_SEATS = {"operator": "Operator", "coordinator": "Coord", "coord": "Coord", "builder": "Builder", "builder-cloud": "Builder-cloud", "reviewer": "Reviewer",
                "tester": "Tester", "lab qa": "QA", "qa": "QA", "qa-one": "QA", "qa two": "QA",
                "qa-two": "QA", "lead": "Lead", "lead-alt": "Lead", "lead-login": "Lead",
                "cloud agents": "CloudAgents", "cloudagents": "CloudAgents", "growth": "Others"}  # known seats; else Others
WORKING_PULSE_S = 10 * 60    # fail-safe spinner: a seat that SENT a prompts pulse is working this long after it
MISSING_ACT_S = 60 * 60      # gap flag: pulsed in this window but no fleet/activity.jsonl line in it


def seat_of(name):
    """'Coordinator' -> Coord, 'Lab Tester: Tester' -> Tester, 'operator' -> Operator; unknown -> None."""
    v = re.sub(r"\s+", " ", str(name or "")).strip().lower()
    if not v:
        return None
    for cand in (v, v.rsplit(":", 1)[-1].strip(), re.sub(r"\s*\(.*?\)\s*", " ", v).strip()):
        if cand in PROMPT_SEATS:
            return PROMPT_SEATS[cand]
        for s in SEATS:
            if cand == s.lower():
                return s
    return None


PROMPT_RECENT_S = 2 * 3600   # first read: lines newer than this are emitted; older ones seed silently
WORKING_PROMPT_S = 30 * 60   # spinner: unanswered prompt within this window
WORKING_CLOUD_S = 60 * 60    # spinner: open cloud agent within this window
WORKING_CHECK_S = 30 * 60    # spinner: open PR with queued/in_progress/failing check
WORKING_ACT_S = 30 * 60      # spinner: open turn/subagent/watcher from remote activity (start/tick, no end yet)
ACT_SEATS = {"Builder", "Builder-cloud"}        # off-box seats that POST /activity (the server forces the seat from the key)
ACT_WORK_KINDS = {"turn", "subagent", "watcher"}
WORKING_LOCAL_S = 60 * 60    # spinner: box-local fleet/activity.jsonl start with no later end (Operator background work)
LOCAL_TAG_RE = re.compile(r"[^A-Za-z0-9 ._:@#+/-]")
# Lab work in progress (Tester, QA = QaOne + QaTwo + QA): a seat is working while files under its lab trees
# changed in the last WORKING_FILES_S, or processes running inside those trees burned >= WORK_CPU_BUSY_S of CPU in a
# pass (test runners write nothing for minutes), held WORKING_CPU_HOLD_S. mtimes, /proc cwd and CPU ticks only:
# no file is opened, no command line or environment read, no path stored.
WORKING_FILES_S = 150
WORKING_CPU_HOLD_S = 120
WORK_CPU_BUSY_S = 1.0
WORK_MAX_ENTRIES = 150000            # per pass, all trees (bounded cost; ~0.2 s today)
WORK_SKIP_DIRS = {"node_modules", ".git", ".next", ".cache", ".turbo", "dist", "coverage"}
PRIVATE_ART = "private/qa-artifacts"   # under WS; stat only, never read
CHECK_BUSY = {"queued", "in_progress", "pending", "waiting", "requested", "running"}
CHECK_FAIL = {"failure", "timed_out", "startup_failure", "action_required", "cancelled", "error", "fail"}
CLOUD_RECENT_S = 30 * 60   # first read: lines newer than this are live work and are emitted; older ones seed silently
RW_ENV = {"development": "dev.example.com", "labtest": "labtest", "production": "app.example.com"}
RW_APPROVAL = {"WAITING", "NEEDS_APPROVAL"}   # awaiting approval (QUEUED is a normal queue state)
# house files Coord writes: known names only become tags; anything else is "house/other" (names can be free text)
HOUSE_TAGS = {"HOUSE": "HOUSE", "merge-queue": "merge-queue", "digest": "digest", "station": "station",
              "STATION": "station", "DIGEST": "digest"}
CARD_ID_RE = re.compile(r"\b([A-Z][A-Z0-9]{1,9}-\d{1,5})\b")
TICK_RE = re.compile(r"(?m)^- \[(.)\] ")
ACTIVE_MIN = 15
SEATS = ["Builder", "Builder-cloud", "Reviewer", "Tester", "QaOne", "QaTwo", "QA", "Operator", "Coord"]   # file owners
BOARD = {"QaOne": "QA", "QaTwo": "QA"}   # board seats: QA = QaOne + QA two + QA
BOARD_SEATS = ["Builder", "Builder-cloud", "Reviewer", "Tester", "QA", "Operator", "Coord"]
SEAT_OF = {"tester": "Tester", "qa-one": "QaOne", "qa-two": "QaTwo"}
SEV_RE = re.compile(r"(?i)severity\W{0,8}(S[0-4])\b")
STATUS_RE = re.compile(r"(?im)^\W{0,4}status\W{0,6}(OPEN|FIXED|REOPENED|PARTLY|WITHDRAWN|PASS|FAIL|CLOSED|WONTFIX|DUPLICATE)\b")
PASS_RE, FAIL_RE = re.compile(r"\bPASS(?:ED)?\b"), re.compile(r"\bFAIL(?:ED)?\b")
# call logs (curl -i dumps / "METHOD /path [code]" lines): only the status code class is counted
STATUS_LINE_RE = re.compile(r"(?m)^HTTP/[0-9.]+ ([1-5])\d\d\b|\[([1-5])\d\d\]")
HOSTS = (("app.example.com", re.compile(r"app\.live\.ai")),
         ("dev.example.com", re.compile(r"dev\.live\.ai|live-lab")),
         ("labtest", re.compile(r"localhost|127\.0\.0\.1|\blabtest\b")))
INSTANCES = ("dev.example.com", "labtest", "app.example.com")


def instance_of(text, name="", default="dev.example.com"):
    """Which Example instance a log talks to: file-name hint first, else the most-mentioned host (count only)."""
    n = name.lower()
    if "-prod" in n or n.startswith("prod"):
        return "app.example.com"
    if "labtest" in n:
        return "labtest"
    counts = {h: len(r.findall(text)) for h, r in HOSTS}
    best = max(counts, key=counts.get)
    return best if counts[best] else default


CARD_RE = re.compile(r"\*\*([A-Z][A-Z0-9]{1,9}-\d{1,5})\*\*\s*\((To Do|Idea|In Progress|Testing|Done|Marketing Complete|On Hold[^)]{0,30})\)")
SECTION_RE = re.compile(r"^## (.+)$", re.M)
STATUS_WORDS = ("BLOCKED", "PARKED", "AWAITING", "DONE", "MERGED", "HOLD", "PASS", "FAIL", "OPEN")


def _ts(iso):
    try:
        return datetime.fromisoformat(str(iso).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def _ct(ts, CT):
    return datetime.fromtimestamp(ts, CT).replace(microsecond=0).isoformat()


def bug_id(name):
    """BUG-lab-tester-031.md -> (tester-031, Tester, dev); BUG-PROD-qa-two-002 / PROD-05-<slug> / PROD-qa-one-01
    -> PROD ids on app.example.com. The descriptive slug after a PROD number is dropped (it is free text)."""
    s = name[:-3]
    m = re.fullmatch(r"BUG-lab-(tester|qa-one|qa-two)-(\d{1,4}[a-z]?)", s)
    if m:
        return f"{m[1]}-{m[2]}", SEAT_OF[m[1]], "dev.example.com"
    m = re.fullmatch(r"(?:BUG-)?PROD-(tester|qa-one|qa-two)-(\d{1,4})", s)
    if m:
        return f"PROD-{m[1]}-{m[2]}", SEAT_OF[m[1]], "app.example.com"
    m = re.match(r"PROD-(\d{1,4})(?:-|$)", s)
    if m:
        return f"PROD-{m[1]}", "Others", "app.example.com"
    return None


def run_seat(name):
    m = re.match(r"(?:lab-)?(tester|qa-one|qa-two)-", name)
    return SEAT_OF[m[1]] if m else None


class Fleet:
    def __init__(self, state_path, CT):
        self.path, self.CT = Path(state_path), CT
        s = json.loads(self.path.read_text()) if self.path.exists() else {}
        self.files = s.get("files", {})      # rel -> [mtime, size]
        self.bugs = s.get("bugs", {})        # id -> {sev, status}
        self.cards = s.get("cards", {})      # id -> status
        self.sections = s.get("sections", {})  # file#slug -> hash
        self.runs = s.get("runs", {})        # run id -> [pass, fail]
        self.events = s.get("events", {})    # id -> event (small; ids/counts only)
        self.seeded = set(s.get("seeded", []))   # sources read at least once (first read is silent: no live)
        self.rw = s.get("rw", {})            # railway deployment id -> status
        self.git = s.get("git", {})          # repo tag -> last seen commit time / ref-log signature
        self.cloud = s.get("cloud", {"offset": 0, "agents": {}})   # byte offset + agent id -> [last action, time]
        self.prompts = s.get("prompts", {"offset": 0, "seen": []})   # byte offset + recent line hashes (dedupe)
        # remote activity (fleet/remote-activity.jsonl, pulled from POST /activity): offset, line hashes, seat -> last
        # time, open work items "seat:kind:id" -> last start/tick time
        self.activity = s.get("activity", {"offset": 0, "seen": [], "seat_t": {}, "open": {}})
        # box-local activity (fleet/activity.jsonl, same line schema as POST /activity): offset + open
        # "seat:kind:tag" -> start time. Working only (spinner); never counted in N of M.
        self.local_act = s.get("local_act", {"offset": 0, "open": {}})
        self.work = s.get("work", {"files": {}, "busy": {}})   # seat -> last lab file change / last busy pass
        self._cpu = {}                       # pid -> CPU ticks at the last pass (memory only)
        self.seat_mtime = s.get("seat_mtime", {})   # seat -> last activity (kept across passes and restarts)
        self._quiet = False
        for e in self.events.values():       # labtest gate runs / flights are the Operator's runs
            if e.get("source") in ("labtest/gate-results", "labtest/flights", "labtest/run"):
                e["from"], e["seat"] = "Operator", "operator"

    def _changed(self, p, rel):
        try:
            st = p.stat()
        except OSError:
            return False
        sig = [int(st.st_mtime), st.st_size]
        key = hashlib.sha1(rel.encode()).hexdigest()[:16]   # state never stores file names (slugs can be free text)
        old = self.files.get(key)
        self.files[key] = sig
        return old != sig

    def _touch(self, seat, mtime):
        if seat:
            self.seat_mtime[seat] = max(self.seat_mtime.get(seat, 0), mtime)

    def _emit(self, eid, mtime, frm, to, kind, label, tag, **extra):
        if self._quiet:          # first read of a new source: record state, emit nothing
            return
        e = {"id": eid, "t_ct": _ct(mtime, self.CT), "from": frm, "to": to, "kind": kind, "direction": "internal",
             "label": label[:54], "source": tag, "src_file": tag, "time_basis": "file mtime"}
        e.update({k: v for k, v in extra.items() if v is not None})
        self.events[eid] = e

    # ---- priority 1: lab testing
    def scan_bugs(self):
        for d, tag in ((LABQA / "bugs", "qa/bugs"),):
            if not d.is_dir():
                continue
            for p in d.iterdir():
                if not (p.is_file() and p.name.endswith(".md")):
                    continue
                b = bug_id(p.name)
                if not b:
                    continue
                bid, seat, host = b
                mt = p.stat().st_mtime
                self._touch(seat, mt)
                if not self._changed(p, f"{tag}/{p.name}") and bid in self.bugs:
                    continue
                txt = p.read_text(errors="ignore")
                sev = (SEV_RE.search(txt) or [None, None])[1]
                stm = STATUS_RE.search(txt)
                status = stm[1].upper() if stm else None
                del txt
                old = self.bugs.get(bid)
                self.bugs[bid] = {"sev": sev, "status": status}
                if old is None:
                    self._emit(f"lab:bug:{bid}", mt, seat, host, "lab_bug", f"new bug {bid}" + (f" ({sev})" if sev else ""),
                               tag, bug_id=bid, severity=sev, bug_status=status, seat=seat.lower())
                elif old != self.bugs[bid]:
                    word = status or "updated"
                    self._emit(f"lab:bug:{bid}:{sev}:{status}", mt, seat, host, "lab_bug_update",
                               f"bug {bid} {word}" + (f" ({sev})" if sev else ""), tag, bug_id=bid, severity=sev,
                               bug_status=status, seat=seat.lower())

    def scan_issue_drafts(self):
        if not LABQA.is_dir():
            return
        for d in sorted(LABQA.glob("issues-*")):
            if not d.is_dir():
                continue
            for p in d.iterdir():
                m = re.fullmatch(r"(tester|qa-one|qa-two)-(\d{1,4}[a-z]?)\.md", p.name)
                if not m or not p.is_file():
                    continue
                mt = p.stat().st_mtime
                seat = SEAT_OF[m[1]]
                self._touch(seat, mt)
                rel = f"qa/{d.name}/{p.name}"
                if self._changed(p, rel) or f"lab:issue:{m[1]}-{m[2]}" not in self.events:
                    iid = f"{m[1]}-{m[2]}"
                    self._emit(f"lab:issue:{iid}", mt, seat, "dev.example.com", "lab_issue", f"issue drafted {iid}",
                               "qa/issues", bug_id=iid, seat=m[1])

    def _run(self, rid, p_or_mt, seat, host, tag, npass, nfail):
        mt = p_or_mt
        if self.runs.get(rid) == [npass, nfail]:
            return
        self.runs[rid] = [npass, nfail]
        self._emit(f"lab:run:{rid}:{npass}:{nfail}", mt, seat, host, "lab_run",
                   f"test run, {npass} pass / {nfail} fail", tag, run_id=rid, passed=npass, failed=nfail,
                   seat=seat.lower(), instance=host)

    def scan_calls(self):
        """Tester -> instance call logs in qa/runs/mq*/ (http-*.txt, probes-*.txt): status classes only."""
        d = LABQA / "runs"
        if not d.is_dir():
            return
        for run in d.glob("mq*"):
            if not run.is_dir():
                continue
            for p in run.iterdir():
                if not (p.is_file() and re.fullmatch(r"(http|probes)-[A-Za-z0-9_-]{1,40}\.txt", p.name)):
                    continue
                mt = p.stat().st_mtime
                self._touch("Tester", mt)
                rel = f"qa/runs/{run.name}/{p.name}"
                if not self._changed(p, rel):
                    continue
                txt = p.read_text(errors="ignore")
                classes = {}
                for a, b in STATUS_LINE_RE.findall(txt):
                    c = (a or b) + "xx"
                    classes[c] = classes.get(c, 0) + 1
                inst = instance_of(txt, p.name)
                del txt
                n = sum(classes.values())
                if not n:
                    continue
                key = hashlib.sha1(rel.encode()).hexdigest()[:10]
                rid = re.sub(r"[^a-z0-9-]", "", f"{run.name}-{p.name[:-4]}".lower())[:40]
                parts = " / ".join(f"{classes[c]} {c}" for c in sorted(classes))
                self._emit(f"lab:calls:{key}:{n}:{parts}", mt, "Tester", inst, "lab_calls",
                           f"{n} calls · {parts}", "qa/runs", run_id=rid, calls=n, status_classes=classes,
                           seat="tester", instance=inst)

    def scan_runs(self):
        d = LABQA / "runs"
        if d.is_dir():
            for p in d.iterdir():
                if not (p.is_file() and p.name.endswith(".md")):
                    continue
                seat = run_seat(p.name)
                if not seat:
                    continue
                mt = p.stat().st_mtime
                self._touch(seat, mt)
                if not self._changed(p, f"qa/runs/{p.name}"):
                    continue
                txt = p.read_text(errors="ignore")
                n_pass, n_fail = len(PASS_RE.findall(txt)), len(FAIL_RE.findall(txt))
                inst = instance_of(txt, p.name)
                del txt
                rid = re.sub(r"[^a-z0-9-]", "", p.name[:-3].lower())[:40]
                self._run(rid, mt, seat, inst, "qa/runs", n_pass, n_fail)
            for p in d.glob("mq-*"):   # merge-queue retest scratch: mtime only, never read
                self._touch("Tester", p.stat().st_mtime)
        # gate runs: one dir per run, NN-step.exit holds the exit code (0 = pass)
        for g in sorted(LABTEST.glob("*/gate-results-*")):
            if not g.is_dir():
                continue
            exits = [x for x in g.glob("*.exit") if x.is_file()]
            if not exits:
                continue
            mt = max(x.stat().st_mtime for x in exits)
            self._touch("Operator", mt)
            codes = []
            for x in exits:
                try:
                    codes.append(int((x.read_text(errors="ignore").strip() or "1")[:6]))
                except ValueError:
                    codes.append(1)
            rid = re.sub(r"[^a-z0-9-]", "", f"{g.parent.name}-{g.name[len('gate-results-'):]}".lower())[:48]
            sig = [int(mt), len(exits), sum(codes)]
            if self.runs.get(f"gate-{rid}:sig") == sig:
                continue
            self.runs[f"gate-{rid}:sig"] = sig
            hosts = {}
            for lg in g.glob("*.log"):
                if lg.is_file() and lg.stat().st_size < 5_000_000:
                    h = instance_of(lg.read_text(errors="ignore"), "", "")
                    if h:
                        hosts[h] = hosts.get(h, 0) + 1
            inst = max(hosts, key=hosts.get) if hosts else "labtest"
            self._run(f"gate-{rid}", mt, "Operator", inst, "labtest/gate-results",
                      sum(c == 0 for c in codes), sum(c != 0 for c in codes))
        for p in sorted((LABTEST / "flights").glob("*.md")) if (LABTEST / "flights").is_dir() else []:
            mt = p.stat().st_mtime
            self._touch("Operator", mt)
            if not self._changed(p, f"labtest/flights/{p.name}"):
                continue
            txt = p.read_text(errors="ignore")
            n_pass, n_fail = len(PASS_RE.findall(txt)), len(FAIL_RE.findall(txt))
            inst = instance_of(txt, p.name, "labtest")
            del txt
            self._run("flight-" + re.sub(r"[^0-9-]", "", p.name)[:10], mt, "Operator", inst,
                      "labtest/flights", n_pass, n_fail)

    # ---- priority 2: house boards (card ids + status words only)
    def scan_house(self):
        jm = HOUSE / "JIRA-BOARD-MAP.md"
        if jm.is_file():
            mt = jm.stat().st_mtime
            self._touch("Coord", mt)
            if self._changed(jm, "house/JIRA-BOARD-MAP.md") or not self.cards:
                seen = {}
                for cid, st in CARD_RE.findall(jm.read_text(errors="ignore")):
                    seen.setdefault(cid, re.sub(r"\s+", " ", st).strip())
                for cid, st in seen.items():
                    old = self.cards.get(cid)
                    if old != st:
                        self.cards[cid] = st
                        self._emit(f"board:card:{cid}:{st}", mt, "Coord", "Example", "board_card",
                                   f"card {cid} → {st}" if old else f"card {cid} {st}", "house/JIRA-BOARD-MAP",
                                   card_id=cid, card_status=st, prev_status=old)
        for name, tag in (("BOARD.md", "house/BOARD"), ("ATTENTION_STATE.md", "house/ATTENTION_STATE")):
            p = HOUSE / name
            if not p.is_file():
                continue
            mt = p.stat().st_mtime
            self._touch("Coord", mt)
            if not self._changed(p, tag) and any(k.startswith(tag + "#") for k in self.sections):
                continue
            txt = p.read_text(errors="ignore")
            parts = SECTION_RE.split(txt)
            del txt
            now = {}
            for i in range(1, len(parts) - 1, 2):
                slug = re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", parts[i].split("(")[0].lower())).strip("-")[:32]
                body = parts[i + 1]
                word = next((w for w in STATUS_WORDS if re.search(rf"\b{w}\b", body)), None)
                now[f"{tag}#{slug}"] = (hashlib.sha1(body.encode()).hexdigest()[:12], word)
            for key, (h, word) in now.items():
                old = self.sections.get(key)
                if old is None or old[0] != h:
                    st = "added" if old is None else "updated"
                    slug = key.split("#", 1)[1]
                    self._emit(f"board:{key}:{h}", mt, "Coord", "Example", "board_status",
                               f"{tag.split('/')[1]} {slug} {st}", tag, card_id=slug, card_status=st, status_word=word)
                self.sections[key] = [h, word]
            for key in [k for k in self.sections if k.startswith(tag + "#") and k not in now]:
                self._emit(f"board:{key}:removed:{int(mt)}", mt, "Coord", "Example", "board_status",
                           f"{tag.split('/')[1]} {key.split('#', 1)[1]} removed", tag,
                           card_id=key.split("#", 1)[1], card_status="removed")
                del self.sections[key]
        mq = HOUSE / "watchers" / "merge-queue.md"
        if mq.is_file():
            self._touch("Tester", mq.stat().st_mtime)
        tn = HOUSE / "triager-notes"
        if tn.is_dir():
            self._touch("Coord", tn.stat().st_mtime)

    # ---- Operator: Railway deploys it triggers / approvals (sanitized file from host_poll.py), ops-app
    # commits (git log of the live-mesh checkout), labtest runs (gate results, flights, run.json: counts only)
    def scan_operator(self):
        self._source("op-railway", self._scan_railway)
        self._source("op-git", self._scan_op_git)
        self._source("op-runjson", self._scan_runjson)

    def _scan_railway(self):
        f = self.path.parent / "railway-deploys.json"
        if not f.is_file() or not self._changed(f, "feed/railway-deploys.json"):
            return
        try:
            d = json.loads(f.read_text())
        except ValueError:
            return
        polled = _ts(d.get("polled_at")) or f.stat().st_mtime
        for x in d.get("deploys", []):
            did, st = str(x.get("id", ""))[:8], str(x.get("status", ""))[:20]
            if not did or not (x.get("cli") or st in RW_APPROVAL):
                continue                     # GitHub-triggered deploys arrive via commit statuses already
            created = _ts(x.get("created")) or polled
            self._touch("Operator", created)
            old = self.rw.get(did)
            if old == st:
                continue
            self.rw[did] = st
            svc, env = str(x.get("service", ""))[:24], str(x.get("env", ""))[:12]
            inst = RW_ENV.get(env) if svc != "live-mesh" else None
            word = "approval" if st in RW_APPROVAL else "deploy"
            self._emit(f"op:rw:{did}:{st}", created if old is None else polled, "Operator", inst or "Railway",
                       "op_deploy", f"{word} {svc} · {env} · {st}", "railway/deployments", deploy_id=did,
                       service=svc, env=env, status=st, instance=inst, time_basis="railway createdAt / poll time")

    def _scan_op_git(self):
        head = OP_REPO / ".git" / "logs" / "HEAD"
        refs = [p for p in (OP_REPO / ".git" / "logs" / "refs").rglob("*") if p.is_file()] if head.exists() else []
        if not head.exists():
            return
        sig = [int(max(p.stat().st_mtime for p in [head, *refs])), len(refs)]
        if self.git.get("live-mesh:sig") == sig:
            return
        self.git["live-mesh:sig"] = sig
        try:
            r = subprocess.run(["git", "-C", str(OP_REPO), "log", "--all", "--source", "--since=7.days",
                                "--author=ops-app", "--format=%H%x09%ct%x09%S"],
                               capture_output=True, text=True, timeout=20)
        except (OSError, subprocess.TimeoutExpired):
            return
        seen = self.git.setdefault("live-mesh:shas", [])
        for line in reversed(r.stdout.splitlines()):
            parts = line.split("\t")
            if len(parts) != 3 or not re.fullmatch(r"[0-9a-f]{40}", parts[0]):
                continue
            sha, ct, ref = parts[0], int(parts[1]), parts[2]
            self._touch("Operator", ct)
            if sha[:12] in seen:
                continue
            seen.append(sha[:12])
            branch = re.sub(r"^refs/(heads|remotes/origin)/", "", ref)
            branch = branch if re.fullmatch(r"[A-Za-z0-9._/-]{1,40}", branch) else "branch"
            self._emit(f"op:git:live-mesh:{sha[:12]}", ct, "Operator", "GitHub", "op_commit",
                       f"live-mesh commit {sha[:7]} · {branch}", "live-mesh-repo/git", sha=sha, branch=branch,
                       repo="example-org/live-mesh", time_basis="commit time")
        del seen[:-200]

    def _scan_runjson(self):
        for p in LABTEST.glob("*/run.json"):
            self._runjson(p, f"labtest/{p.parent.name}/run.json")
        for p in LABTEST.glob("*/*/run.json"):
            if not re.match(r"(fixtures|prod)-", p.parent.parent.name) and not re.match(r"(fixtures|prod)-", p.parent.name):
                self._runjson(p, f"labtest/{p.parent.parent.name}/{p.parent.name}/run.json")

    def _runjson(self, p, rel):
        if re.match(r"(fixtures|prod)-", p.parent.name) or not p.is_file() or p.stat().st_size > 2_000_000:
            return
        mt = p.stat().st_mtime
        self._touch("Operator", mt)
        if not self._changed(p, rel):
            return
        try:
            d = json.loads(p.read_text(errors="ignore"))
        except ValueError:
            return
        def num(*keys):
            for k in keys:
                v = d.get(k) if isinstance(d, dict) else None
                if isinstance(v, int) and not isinstance(v, bool):
                    return v
            return None
        npass, nfail = num("passed", "pass", "n_pass", "ok"), num("failed", "fail", "n_fail", "errors")
        if npass is None and nfail is None:
            return
        rid = "runjson-" + hashlib.sha1(rel.encode()).hexdigest()[:10]
        self._run(rid, mt, "Operator", "labtest", "labtest/run", npass or 0, nfail or 0)

    # ---- Coord: files it writes under the house (tag + card id / status word / counts only) and its house commits
    def scan_cos(self):
        self._source("coord-files", self._scan_cos_files)
        self._source("coord-git", self._scan_cos_git)

    def _scan_cos_files(self):
        if not HOUSE.is_dir():
            return
        files = [p for p in HOUSE.glob("*.md")] + [p for p in (HOUSE / "watchers").glob("*.md")] + \
                [p for p in (HOUSE / "triager-notes").glob("*.md")]
        for p in files:
            if ".bak" in p.name or not p.is_file() or p.name in ("BOARD.md", "ATTENTION_STATE.md", "JIRA-BOARD-MAP.md"):
                continue                     # boards are covered card by card in scan_house
            mt = p.stat().st_mtime
            self._touch("Coord", mt)
            rel = f"house/{p.parent.name}/{p.name}"
            if not self._changed(p, rel):
                continue
            stem = p.name[:-3]
            if p.parent.name == "triager-notes":
                m = CARD_ID_RE.search(stem)
                tag, card = "triager-note", (m[1] if m else None)
            else:
                tag, card = HOUSE_TAGS.get(stem, "house/other"), None
            extra, label = {}, f"{tag} updated"
            if tag == "merge-queue":
                ticks = TICK_RE.findall(p.read_text(errors="ignore"))
                extra = {"ticked_pass": sum(t in "xX" for t in ticks), "ticked_fail": ticks.count("!"),
                         "open": ticks.count(" ")}
                label = f"merge-queue · {extra['ticked_pass']} pass / {extra['ticked_fail']} fail / {extra['open']} open"
            elif card:
                label = f"triager note {card}"
            key = hashlib.sha1(rel.encode()).hexdigest()[:10]
            self._emit(f"coord:file:{key}:{int(mt)}", mt, "Coord", "Example", "cos_file", label, f"house/{tag}",
                       card_id=card, **extra)

    def _scan_cos_git(self):
        head = HOUSE / ".git" / "logs" / "HEAD"
        if not head.is_file():
            return
        sig = [int(head.stat().st_mtime), head.stat().st_size]
        if self.git.get("house:sig") == sig:
            return
        self.git["house:sig"] = sig
        try:
            r = subprocess.run(["git", "-C", str(HOUSE), "log", "--since=7.days", "--author=Coordinator",
                                "--format=%x00%H%x09%ct", "--name-only"], capture_output=True, text=True, timeout=20)
        except (OSError, subprocess.TimeoutExpired):
            return
        seen = self.git.setdefault("house:shas", [])
        for chunk in reversed(r.stdout.split("\0")):
            lines = [x for x in chunk.splitlines() if x.strip()]
            if not lines or "\t" not in lines[0]:
                continue
            sha, ct = lines[0].split("\t")
            if not re.fullmatch(r"[0-9a-f]{40}", sha):
                continue
            ct = int(ct)
            self._touch("Coord", ct)
            if sha[:12] in seen:
                continue
            seen.append(sha[:12])
            tags = sorted({HOUSE_TAGS.get(Path(f).stem, Path(f).stem if Path(f).stem in
                           ("BOARD", "ATTENTION_STATE", "JIRA-BOARD-MAP") else "other") for f in lines[1:]})[:4]
            self._emit(f"coord:git:{sha[:12]}", ct, "Coord", "Example", "cos_commit",
                       f"house commit {sha[:7]} · {', '.join(tags) or 'house'}", "house/git", sha=sha, files=tags,
                       time_basis="commit time")
        del seen[:-200]

    def _source(self, name, fn):
        self._quiet = name not in self.seeded
        try:
            fn()
        finally:
            self._quiet = False
            self.seeded.add(name)

    # ---- Cloud agents: fleet/cloud-agents.jsonl (appended by the Operator), tailed by byte offset.
    # Only t_ct, by, action, agent, repo, tag are used; any other field is ignored.
    def scan_cloud(self):
        f = self.path.parent.parent / "fleet" / "cloud-agents.jsonl"
        if not f.is_file():
            return
        first = "cloud" not in self.seeded
        size = f.stat().st_size
        off = self.cloud.get("offset", 0)
        if size < off:
            off = 0                          # truncated / rotated: start over
        if size == off:
            self.seeded.add("cloud")
            return
        with open(f, "rb") as fh:
            fh.seek(off)
            chunk = fh.read(size - off)
        end = chunk.rfind(b"\n") + 1        # only whole lines; a partial last line waits for the next pass
        if not end:
            return
        self.cloud["offset"] = off + end
        now = time.time()
        for raw in chunk[:end].splitlines():
            try:
                d = json.loads(raw)
            except ValueError:
                continue
            if isinstance(d, dict):
                self._cloud_line(d, first, now)
        del_old = sorted(self.cloud["agents"].items(), key=lambda kv: kv[1][1])[:-200]
        for k, _ in del_old:
            del self.cloud["agents"][k]
        self.seeded.add("cloud")

    def _cloud_line(self, d, first, now, src="fleet/cloud-agents"):
        """One cloud-agents line (also used for remote activity kind=cloud_agent, by = the key's seat)."""
        t = _ts(d.get("t_ct"))
        action, agent = str(d.get("action", "")).lower(), str(d.get("agent", ""))
        if t is None or action not in CLOUD_ACTIONS or not CLOUD_AGENT_ID.fullmatch(agent):
            return
        by = str(d.get("by", ""))
        by = by if by in CLOUD_SEATS else "Others"
        repo = re.sub(r"[^A-Za-z0-9._-]", "", str(d.get("repo", "")).split("/")[-1])[:32] or "repo"
        tag = re.sub(r"\s+", " ", str(d.get("tag", ""))).strip()[:40] or "-"
        self.cloud["agents"][agent] = [action, t]
        by_t = self.cloud.setdefault("by_t", {})
        by_t[by] = max(by_t.get(by, 0), t)   # a cloud line is activity from `by` (clears their prompt spinner)
        if first and now - t > CLOUD_RECENT_S:
            return                           # history: seed silently
        frm, to = ("CloudAgents", by) if action == "finished" else (by, "CloudAgents")
        self._emit(f"cloud:{agent}:{action}:{int(t)}", t, frm, to, f"cloud_{action}", f"{action} · {tag} · {repo}",
                   src, agent=agent, by=by, action=action, repo_short=repo, cloud_tag=tag,
                   time_basis="t_ct from the cloud-agents log")

    # ---- Lead -> bot messages: fleet/prompts.jsonl, tailed by byte offset, deduped by line hash.
    # Only t_ct, from and to are used; message text and any other field are never read into the feed.
    def scan_prompts(self):
        f = self.path.parent.parent / "fleet" / "prompts.jsonl"
        if not f.is_file():
            return
        first = "prompts" not in self.seeded
        size = f.stat().st_size
        off = self.prompts.get("offset", 0)
        if size < off:
            off = 0                          # truncated / rotated: start over (line hashes still dedupe)
        if size == off:
            self.seeded.add("prompts")
            return
        with open(f, "rb") as fh:
            fh.seek(off)
            chunk = fh.read(size - off)
        end = chunk.rfind(b"\n") + 1        # only whole lines
        if not end:
            return
        self.prompts["offset"] = off + end
        seen = self.prompts.setdefault("seen", [])
        seen_set, now = set(seen), time.time()
        for raw in chunk[:end].splitlines():
            raw = raw.strip()
            if not raw:
                continue
            h = hashlib.sha1(raw).hexdigest()[:16]
            if h in seen_set:
                continue                     # same line written twice
            try:
                d = json.loads(raw)
            except ValueError:
                continue
            if not isinstance(d, dict):
                continue
            if _ts(d.get("t_ct")) is None:
                continue
            seen.append(h); seen_set.add(h)
            self._prompt_line(d, h, first, now)
        del seen[:-2000]
        self.seeded.add("prompts")

    def _prompt_line(self, d, h, first, now, src="fleet/prompts"):
        """One prompts line: only t_ct, from, to (also used for remote activity kind=prompt)."""
        t = _ts(d.get("t_ct"))
        if t is None:
            return
        norm = lambda v: re.sub(r"\s+", " ", str(v or "")).strip().lower()
        frm = seat_of(d.get("from")) or "Others"
        to = seat_of(d.get("to")) or "Others"
        # sender is working / active; also track the prompt onto the target for the in-flight spinner
        st = self.prompts.setdefault("seat_t", {})
        if frm != "Others":
            st[frm] = max(st.get(frm, 0), t)
        pending = self.prompts.setdefault("pending", {})   # seat -> latest unanswered prompt time
        if to not in ("Others",) and to != frm:
            pending[to] = max(pending.get(to, 0), t)
        if first and now - t > PROMPT_RECENT_S:
            return                           # history: seed silently
        self._emit(f"prompt:{h}", t, frm, to, "prompt_message", "message", src,
                   time_basis="t_ct from the prompts log")

    # ---- Off-box seats (Builder on its own machine): fleet/remote-activity.jsonl, written by the box pusher from the
    # mesh app's write-only POST /activity. Only t_ct, seat, kind, action, to, agent, tag are used.
    #   prompt received        -> Lead -> seat message (seat working until it acts again), like prompts.jsonl
    #   prompt sent (to=X)     -> seat -> X message (X working until it acts), like prompts.jsonl
    #   cloud_agent            -> exactly a cloud-agents.jsonl line with by = seat
    #   turn/subagent/watcher  -> start/tick opens, end closes; seat working while any is open (30 min max)
    # Every line marks the seat active.
    # ---- Box-local seats (e.g. Operator background work): fleet/activity.jsonl {t_ct, seat, kind, action, tag}.
    # Only those five fields are read; a seat is working while a start has no later end, for up to 60 min.
    def scan_local_activity(self, now=None):
        f = self.path.parent.parent / "fleet" / "activity.jsonl"
        if not f.is_file():
            return
        A, now = self.local_act, now or time.time()
        size, off = f.stat().st_size, self.local_act.get("offset", 0)
        if size < off:                      # truncated / rotated: re-read from the start
            off, A["open"] = 0, {}
        if size > off:
            with open(f, "rb") as fh:
                fh.seek(off)
                chunk = fh.read(size - off)
            end = chunk.rfind(b"\n") + 1
            A["offset"] = off + end
            opn = A.setdefault("open", {})
            for raw in chunk[:end].splitlines():
                try:
                    d = json.loads(raw)
                except ValueError:
                    continue
                if not isinstance(d, dict):
                    continue
                seat, kind, action, t = seat_of(d.get("seat")), d.get("kind"), d.get("action"), _ts(d.get("t_ct"))
                if seat not in SEATS or not isinstance(kind, str) or t is None or t > now + 300:
                    continue
                lst = A.setdefault("seat_t", {})   # any valid line counts against the missing_activity flag
                lst[seat] = max(lst.get(seat, 0), t)
                if action not in ("start", "end"):
                    continue
                kind = LOCAL_TAG_RE.sub("", kind)[:24] or "work"
                tag = LOCAL_TAG_RE.sub("", str(d.get("tag") or "-"))[:40] or "-"
                key = f"{seat}:{kind}:{tag}"
                if action == "end":
                    if t >= opn.get(key, 0):
                        opn.pop(key, None)
                else:
                    opn[key] = max(opn.get(key, 0), t)
        for key, t in list(A.get("open", {}).items()):
            if now - t > WORKING_LOCAL_S:
                A["open"].pop(key, None)

    def scan_activity(self):
        f = self.path.parent.parent / "fleet" / "remote-activity.jsonl"
        if not f.is_file():
            return
        A = self.activity
        first = "activity" not in self.seeded
        size = f.stat().st_size
        off = A.get("offset", 0)
        if size < off:
            off = 0
        if size == off:
            self.seeded.add("activity")
            return
        with open(f, "rb") as fh:
            fh.seek(off)
            chunk = fh.read(size - off)
        end = chunk.rfind(b"\n") + 1
        if not end:
            return
        A["offset"] = off + end
        seen = A.setdefault("seen", [])
        seen_set, now = set(seen), time.time()
        for raw in chunk[:end].splitlines():
            raw = raw.strip()
            if not raw:
                continue
            h = hashlib.sha1(raw).hexdigest()[:16]
            if h in seen_set:
                continue
            try:
                d = json.loads(raw)
            except ValueError:
                continue
            if not isinstance(d, dict) or d.get("seat") not in ACT_SEATS:
                continue
            seat, kind, action, t = d["seat"], d.get("kind"), d.get("action"), _ts(d.get("t_ct"))
            if t is None or t > now + 300:
                continue
            seen.append(h); seen_set.add(h)
            st = A.setdefault("seat_t", {})
            st[seat] = max(st.get(seat, 0), t)
            if kind == "prompt" and action == "received":
                self._prompt_line({"t_ct": d["t_ct"], "from": "Lead", "to": seat}, h, first, now, "remote/activity")
            elif kind == "prompt" and action == "sent":
                self._prompt_line({"t_ct": d["t_ct"], "from": seat, "to": d.get("to")}, h, first, now, "remote/activity")
            elif kind == "cloud_agent":
                self._cloud_line({"t_ct": d["t_ct"], "by": seat, "action": action, "agent": d.get("agent"),
                                  "tag": d.get("tag")}, first, now, "remote/activity")
            elif kind in ACT_WORK_KINDS and action in ("start", "tick", "end"):
                ident = re.sub(r"[^A-Za-z0-9_-]", "", str(d.get("agent") or d.get("tag") or "-"))[:40] or "-"
                key = f"{seat}:{kind}:{ident}"
                opn = A.setdefault("open", {})
                if action == "end":
                    if t >= opn.get(key, 0):
                        opn.pop(key, None)
                else:
                    opn[key] = max(opn.get(key, 0), t)
                to = d.get("to")
                if to and action != "tick" and not (first and now - t > PROMPT_RECENT_S):
                    tgt = PROMPT_SEATS.get(re.sub(r"\s+", " ", str(to)).strip().lower(), "Others")
                    self._emit(f"act:{h}", t, seat, tgt, f"{kind}_{action}", f"{kind} {action}", "remote/activity",
                               time_basis="t_ct from the activity log")
        del seen[:-2000]
        for k in [k for k, t in A.get("open", {}).items() if now - t > 6 * 3600]:
            del A["open"][k]
        self.seeded.add("activity")

    # ---- Lab work in progress: which seat owns a lab tree (by its top-level name only)
    @staticmethod
    def _tree_seat(name, private):
        n = name.lower()
        if private:
            m = re.match(r"lab-(tester|qa-one|qa-two)", n)
            return SEAT_OF[m[1]] if m else ("QA" if n.startswith("qa") else None)
        if re.match(r"mqx?-", n):
            return "Tester"                   # merge-queue retests are Tester's (as in scan_runs)
        return run_seat(name)

    def _work_trees(self):
        out = []
        for base, private in ((LABQA / "runs", False), (WS / PRIVATE_ART, True)):
            try:
                entries = list(os.scandir(base))
            except OSError:
                continue
            for e in entries:
                seat = self._tree_seat(e.name, private)
                if seat and e.is_dir(follow_symlinks=False):
                    out.append((e.path, seat))
        return out

    def scan_work(self, now=None):
        now = now or time.time()
        W = self.work
        trees = self._work_trees()
        # 1) newest mtime per seat (files + dirs), bounded walk; nothing opened, nothing stored but a time per seat
        budget = WORK_MAX_ENTRIES
        for root, seat in trees:
            newest, stack = 0.0, [root]
            while stack and budget > 0:
                d = stack.pop()
                try:
                    with os.scandir(d) as it:
                        for e in it:
                            budget -= 1
                            try:
                                if e.is_dir(follow_symlinks=False):
                                    if e.name not in WORK_SKIP_DIRS:
                                        stack.append(e.path)
                                    newest = max(newest, e.stat(follow_symlinks=False).st_mtime)
                                elif e.is_file(follow_symlinks=False):
                                    newest = max(newest, e.stat(follow_symlinks=False).st_mtime)
                            except OSError:
                                continue
                except OSError:
                    continue
            if newest and newest <= now + 60:
                W["files"][seat] = max(W["files"].get(seat, 0), newest)
                self._touch(seat, newest)
        # 2) CPU used by processes whose cwd is inside a lab tree since the last pass
        roots = [(os.path.realpath(r) + os.sep, seat) for r, seat in trees]
        tck, cpu, seat_cpu = os.sysconf("SC_CLK_TCK"), {}, {}
        for pid in os.listdir("/proc") if roots and os.path.isdir("/proc") else []:
            if not pid.isdigit():
                continue
            try:
                cwd = os.readlink(f"/proc/{pid}/cwd") + os.sep
                seat = next((s_ for r, s_ in roots if cwd.startswith(r)), None)
                if not seat:
                    continue
                with open(f"/proc/{pid}/stat") as fh:
                    f = fh.read().rsplit(")", 1)[1].split()
                ticks, start = int(f[11]) + int(f[12]), int(f[19]) / tck   # utime + stime; start since boot
            except (OSError, ValueError, IndexError):
                continue
            cpu[pid] = ticks
            prev = self._cpu.get(pid)
            if prev is None and not self._cpu:
                continue                     # first pass after a restart: baseline only
            if prev is None:
                prev = 0                     # new process since the last pass: all its CPU is new
            seat_cpu[seat] = seat_cpu.get(seat, 0) + max(0, ticks - prev) / tck
        self._cpu = cpu or {"-": 0}
        for seat, sec in seat_cpu.items():
            if sec >= WORK_CPU_BUSY_S:
                W["busy"][seat] = now        # working only; does not make the seat active (N of M)

    def _work_working(self, now):
        out = {}
        for seat in ("Tester", "QaOne", "QaTwo", "QA"):
            b = BOARD.get(seat, seat)
            tf, tb = self.work.get("files", {}).get(seat, 0), self.work.get("busy", {}).get(seat, 0)
            if now - tf <= WORKING_FILES_S and tf >= tb:
                out.setdefault(b, {"via": "files", "since_ct": _ct(tf, self.CT)})
            elif now - tb <= WORKING_CPU_HOLD_S:
                out.setdefault(b, {"via": "run", "since_ct": _ct(tb, self.CT)})
            elif now - tf <= WORKING_FILES_S:
                out.setdefault(b, {"via": "files", "since_ct": _ct(tf, self.CT)})
        return out

    def cloud_state(self, feed_events, now=None):
        """Active = a launch/reply with no later finished/cancel for that agent, or cursoragent on GitHub < 15 min."""
        now = now or time.time()
        open_ = sorted(a for a, (act, _) in self.cloud.get("agents", {}).items() if act in ("launch", "reply"))
        gh = 0
        for e in feed_events:
            if e.get("src_file") == "github-api" and e.get("from") == "CloudAgents":
                gh = max(gh, _ts(e.get("t_ct")) or 0)
        last = max([gh] + [t for _, t in self.cloud.get("agents", {}).values()])
        return {"active": bool(open_) or bool(gh and now - gh <= ACTIVE_MIN * 60), "open_agents": open_[:20],
                "github_last_ct": _ct(gh, self.CT) if gh else None, "last_ct": _ct(last, self.CT) if last else None}

    def _seat_activity(self, feed_events):
        """Latest activity time per board seat: GitHub, fleet files, fleet events, cloud-agents by=seat, prompts sent."""
        last = {}
        for e in feed_events:
            frm = e.get("from")
            b = BOARD.get(frm, frm) if frm else None
            if b not in BOARD_SEATS and b != "CloudAgents":
                continue
            t = _ts(e.get("t_ct"))
            if t:
                last[b] = max(last.get(b, 0), t)
        for s in SEATS:
            b = BOARD.get(s, s)
            for t in (self.seat_mtime.get(s, 0), self.prompts.get("seat_t", {}).get(s, 0),
                      self.cloud.get("by_t", {}).get(s, 0), self.activity.get("seat_t", {}).get(s, 0)):
                if t:
                    last[b] = max(last.get(b, 0), t)
        for agent, (act, t) in self.cloud.get("agents", {}).items():
            # cloud line itself is activity for the `by` seat when we stored it — see scan_cloud extras;
            # agents dict is [action, t] only, so use feed events with kind cloud_* and by=
            pass
        for e in self.events.values():
            if not str(e.get("kind", "")).startswith("cloud_"):
                continue
            by = e.get("by")
            b = BOARD.get(by, by) if by else None
            t = _ts(e.get("t_ct"))
            if b in BOARD_SEATS and t:
                last[b] = max(last.get(b, 0), t)
        return last

    def _repo_num(self, e):
        """Best-effort (repo, number) from event fields or id like 'example-org/x#200:...'."""
        repo, n = e.get("repo") or "", e.get("number")
        eid = e.get("id") or ""
        if isinstance(eid, str) and (not repo or n is None):
            head = eid.split(":", 1)[0]
            if "#" in head:
                r, _, rest = head.partition("#")
                repo = repo or r
                if n is None and rest.isdigit():
                    n = int(rest)
        return repo, (int(n) if n is not None else None)

    def _pr_check_working(self, feed_events, now):
        """Seat working from GitHub already in the feed: open PR they authored whose newest check is
        queued/in_progress/failing and newer than the last merge, within 30 min. No extra API calls."""
        prs, sha_pr, checks = {}, {}, {}
        for e in feed_events:
            kind = e.get("kind")
            t = _ts(e.get("t_ct"))
            if t is None:
                continue
            repo, n = self._repo_num(e)
            sha = (e.get("sha") or e.get("head_sha") or "")
            if sha:
                sha = sha[:40]
            if kind == "pr_open" and n is not None:
                key = (repo, int(n))
                cur = prs.setdefault(key, {"author": None, "head": None, "head_t": 0, "merged_t": 0})
                cur["author"] = e.get("from") or cur["author"]
            elif kind == "merged" and n is not None:
                key = (repo, int(n))
                cur = prs.setdefault(key, {"author": None, "head": None, "head_t": 0, "merged_t": 0})
                cur["merged_t"] = max(cur["merged_t"], t)
                if e.get("from"):
                    cur["author"] = cur["author"] or e.get("from")
            elif kind == "pr_commit" and n is not None and sha:
                key = (repo, int(n))
                cur = prs.setdefault(key, {"author": None, "head": None, "head_t": 0, "merged_t": 0})
                if t >= cur["head_t"]:
                    cur["head"], cur["head_t"] = sha, t
                sha_pr[sha] = sha_pr[sha[:7]] = key
            elif kind in ("check_run", "check_suite", "workflow_run", "commit_status",
                          "deploy", "deploy_fail", "deploy_pending", "critic_fail"):
                if kind == "critic_fail":
                    if n is not None:
                        key = (repo, int(n))
                        if sha:
                            sha_pr[sha] = sha_pr[sha[:7]] = key
                    st, conc = "completed", "failure"
                else:
                    st = (e.get("status") or "").lower()
                    conc = (e.get("conclusion") or e.get("state") or "").lower()
                if not sha:
                    continue
                busy = st in CHECK_BUSY or conc in CHECK_BUSY or kind == "deploy_pending"
                fail = conc in CHECK_FAIL or kind in ("deploy_fail", "critic_fail")
                if not (busy or fail):
                    continue
                prev = checks.get(sha) or checks.get(sha[:7])
                if not prev or t >= prev[0]:
                    checks[sha] = checks[sha[:7]] = (t, "fail" if fail else "busy", (e.get("label") or "")[:40])
        out = {}
        for key, pr in prs.items():
            if pr.get("merged_t"):
                continue
            author = BOARD.get(pr.get("author"), pr.get("author"))
            if author not in BOARD_SEATS:
                continue
            head = pr.get("head")
            if not head:
                continue
            chk = checks.get(head) or checks.get(head[:7])
            if not chk:
                continue
            t, why, lab = chk
            if t <= pr.get("merged_t", 0) or now - t > WORKING_CHECK_S:
                continue
            out[author] = {"via": "check", "since_ct": _ct(t, self.CT),
                           "pr": f"{key[0]}#{key[1]}" if key[0] else f"#{key[1]}",
                           "state": why, "label": lab}
        return out

    def working_state(self, feed_events, now=None):
        """In-flight spinners (not counted in N of M): unanswered prompt, open cloud agent, or open PR check."""
        now = now or time.time()
        act = self._seat_activity(feed_events)
        working = {}
        for seat, pt in list(self.prompts.get("pending", {}).items()):
            b = BOARD.get(seat, seat)
            if b not in BOARD_SEATS and b != "CloudAgents":
                continue
            if now - pt > WORKING_PROMPT_S:
                continue
            if act.get(b, 0) > pt:
                continue
            working[b] = {"via": "prompt", "since_ct": _ct(pt, self.CT)}
        for agent, (actn, t) in self.cloud.get("agents", {}).items():
            if actn not in ("launch", "reply") or now - t > WORKING_CLOUD_S:
                continue
            prev = working.get("CloudAgents")
            if not prev or t >= (_ts(prev["since_ct"]) or 0):
                working["CloudAgents"] = {"via": "cloud", "since_ct": _ct(t, self.CT), "agent": agent}
        for key, t in self.activity.get("open", {}).items():   # remote turn/subagent/watcher still open
            seat, kind = key.split(":")[:2]
            b = BOARD.get(seat, seat)
            if b in BOARD_SEATS and now - t <= WORKING_ACT_S and b not in working:
                working[b] = {"via": kind, "since_ct": _ct(t, self.CT)}
        for key, t in self.local_act.get("open", {}).items():   # box-local start without end (fleet/activity.jsonl)
            seat, kind = key.split(":")[:2]
            b = BOARD.get(seat, seat)
            if b in BOARD_SEATS and now - t <= WORKING_LOCAL_S and b not in working:
                working[b] = {"via": kind, "since_ct": _ct(t, self.CT)}
        for seat, t in self.prompts.get("seat_t", {}).items():   # fail-safe: sent a pulse in the last 10 min
            b = BOARD.get(seat, seat)
            if b in BOARD_SEATS and now - t <= WORKING_PULSE_S and b not in working:
                working[b] = {"via": "pulse", "since_ct": _ct(t, self.CT)}
        for seat, info in self._work_working(now).items():   # lab battery in progress (files / busy processes)
            if seat not in working:
                working[seat] = info
        for seat, info in self._pr_check_working(feed_events, now).items():
            if seat not in working:          # log signal wins if already set; either turns the gear on
                working[seat] = info
        return working

    def fleet_state(self, feed_events, now=None):
        """Seat active = owned file, GitHub, or a message the seat sent, in the last 15 min. Working = spinner only."""
        now = now or time.time()
        gh_last = {}
        for e in feed_events:
            if e.get("src_file") == "github-api" and e.get("from") in SEATS:
                try:
                    t = datetime.fromisoformat(e["t_ct"]).timestamp()
                except (KeyError, ValueError):
                    continue
                gh_last[e["from"]] = max(gh_last.get(e["from"], 0), t)
        last_by = {}
        for s in SEATS:   # fold file owners into board seats: a board seat is active if any member is
            b = BOARD.get(s, s)
            for src, t in (("files", self.seat_mtime.get(s, 0)), ("github", gh_last.get(s, 0)),
                           ("message", self.prompts.get("seat_t", {}).get(s, 0)),
                           ("activity", self.activity.get("seat_t", {}).get(s, 0))):
                if t > last_by.get(b, (0, None))[0]:
                    last_by[b] = (t, src)
        working = self.working_state(feed_events, now)
        seats = {}
        for s in BOARD_SEATS:
            last, via = last_by.get(s, (0, None))
            seats[s] = {"active": bool(last and now - last <= ACTIVE_MIN * 60),
                        "last_ct": _ct(last, self.CT) if last else None, "via": via,
                        "working": s in working}   # spinner; does not affect active / N of M
            if s in working:
                seats[s]["working_via"] = working[s].get("via")
        cloud = self.cloud_state(feed_events, now)
        cloud["working"] = "CloudAgents" in working   # header chip spinner
        # gap flag (feed only, not drawn): seats that pulsed in the last 60 min with no activity.jsonl line in it
        act_t = {}
        for s, t in self.local_act.get("seat_t", {}).items():
            b = BOARD.get(s, s); act_t[b] = max(act_t.get(b, 0), t)
        missing = sorted({BOARD.get(s, s) for s, t in self.prompts.get("seat_t", {}).items()
                          if BOARD.get(s, s) in BOARD_SEATS and now - t <= MISSING_ACT_S
                          and now - act_t.get(BOARD.get(s, s), 0) > MISSING_ACT_S})
        return {"as_of": _ct(now, self.CT), "window_min": ACTIVE_MIN, "seats": seats,
                "active": sum(v["active"] for v in seats.values()), "total": len(BOARD_SEATS),
                "cloud": cloud, "working": working,   # working not counted in N of M
                "missing_activity": missing}

    def scan(self):
        for f in (self.scan_bugs, self.scan_issue_drafts, self.scan_runs, self.scan_calls, self.scan_house,
                  self.scan_operator, self.scan_cos, self.scan_cloud, self.scan_prompts, self.scan_activity, self.scan_local_activity,
                  self.scan_work):
            try:
                f()
            except (OSError, ValueError) as ex:
                print(f"[fleet] {f.__name__}: {type(ex).__name__}", flush=True)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(f".tmp.{os.getpid()}")
        tmp.write_text(json.dumps({"files": self.files, "bugs": self.bugs, "cards": self.cards,
                                   "sections": self.sections, "runs": self.runs, "events": self.events,
                                   "seeded": sorted(self.seeded), "rw": self.rw, "git": self.git,
                                   "seat_mtime": self.seat_mtime, "cloud": self.cloud,
                                   "prompts": self.prompts, "activity": self.activity, "local_act": self.local_act, "work": self.work}))
        os.replace(tmp, self.path)
        return list(self.events.values())
