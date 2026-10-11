"""Example full-history GitHub collector (read-only token; metadata only, never bodies).

Backfill once (GraphQL for PR commits/reviews/CI and develop/main history+CI; paged REST for lists),
then poll incrementally (REST page 1 with ETag; a 304 does not count against the rate limit).
State persists in <out dir>/store/<repo>.json so supervisor restarts never re-backfill.
"""
from __future__ import annotations
import json, os, re, time, urllib.request, urllib.error, urllib.parse, http.client
from datetime import datetime, timedelta, timezone
from pathlib import Path

API = "https://api.github.com"
REST_FLOOR = int(os.environ.get("LIVE_REST_FLOOR", "1500"))   # leave this much core budget for the fleet
GQL_FLOOR = int(os.environ.get("LIVE_GQL_FLOOR", "1000"))
BACKFILL_SECONDS = float(os.environ.get("LIVE_BACKFILL_SECONDS", "150"))   # per pass
BRAND = os.environ.get("LIVE_BRAND", "Example")   # display name the product names below are relabelled to
BRAND_RE = re.compile(os.environ.get("LIVE_BRAND_RE", r"(?i)(?:acmeco|acme)(?![-/])"))   # repo names stay as identifiers
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")   # never ship addresses
CRITIC = "reviewer-app[bot]"
CRITIC_LOGINS = {CRITIC, "reviewer-app"}   # any Reviewer seat identity
CRITIC_RE = re.compile(r"^\*\*Reviewer(?:: (PASS|FAIL|HOLD)\b| re-check:\s*(?:\**\s*)?(PASS|FAIL)?\b)")
SHA_RE = re.compile(r"@\s*`?([0-9a-f]{7,40})\b")
NODE = {"builder-app[bot]": "Builder", "reviewer-app[bot]": "Reviewer", "reviewer-app": "Reviewer", "ops-app[bot]": "Operator",
        "lead-alt": "Lead", "lead-login": "Lead", "github-actions[bot]": "CI"}   # a person can have several logins
NODE_LC = {k.lower(): v for k, v in NODE.items()}   # logins are case-insensitive (lead-alt / lead-alt)
ALIAS = {"lead-alt": "Lead", "lead-login": "Lead"}   # stored node names from before the fold
# Cursor cloud agents (cursoragent, cursor-agent, ...); Bugbot (cursor[bot]) is NOT one of them
CLOUD_AGENT_RE = re.compile(r"(?i)^cursor-?(?:cloud-?)?agents?(?:\[bot\])?$")
MERGE_BASES = ("develop", "main")
# Fine-grained read-only token (Railway collector): GitHub offers no Checks permission for those, so REST
# check-suites/check-runs answer 403 and GraphQL checkSuites is FORBIDDEN. With LIVE_NO_CHECKS=1 the collector
# skips both and derives the github-actions part from Actions instead (same event ids): every workflow run is its
# check suite (check_suite_id) and every job is its check run (job id == check run id). Lost: suites/runs of other
# apps (railway-app, cursor/Bugbot); Railway deploys still arrive as commit statuses.
NO_CHECKS = os.environ.get("LIVE_NO_CHECKS") == "1"
JOBS_WINDOW_S = 2 * 3600       # jobs are fetched for runs created in the last 2 h (ETag'd until completed)


def _brand_sub(m) -> str:
    a, b = m.string[m.start() - 1:m.start()], m.string[m.end():m.end() + 1]
    inside = bool(re.match(r"[A-Za-z0-9_]", a or " ") or re.match(r"[A-Za-z0-9_]", b or " "))
    return BRAND   # inside an identifier (DirectXClient, X_sdk.zip): no dot


def brand(s: str | None) -> str:
    return EMAIL_RE.sub("[email]", BRAND_RE.sub(_brand_sub, " ".join((s or "").split())))


def node(login: str | None) -> str:
    """Mesh node for an actor. Unknown actors (e.g. Tester's new App) are kept as 'Others' + actor=login."""
    if login and CLOUD_AGENT_RE.match(login):
        return "CloudAgents"
    return NODE_LC.get((login or "").lower(), "Others" if login else "GitHub")


def gql_login(actor) -> str | None:
    """GraphQL returns a Bot's login without the REST '[bot]' suffix; normalize to the REST form."""
    if not actor or not actor.get("login"):
        return None
    return actor["login"] + "[bot]" if actor.get("__typename") == "Bot" else actor["login"]


def commit_login(cm) -> str | None:
    a = cm.get("author") or {}
    if (a.get("user") or {}).get("login"):
        return a["user"]["login"]
    name = a.get("name") or ""
    return name if name.endswith("[bot]") else None   # bot authors have no User; their git name is the login


FIXES_RE = re.compile(r"\b(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?|supersede[sd]?|replace[sd]?)\s*:?\s+#(\d{1,6})\b", re.I)
PARKED_COMMENT_RE = re.compile(r"^\s*parked:", re.I)   # Coord rule: a comment starting 'Parked:' parks the card
RESOLVED_RE = re.compile(r"\b(resolved|superseded|fixed (?:in|by) #\d+|nothing (?:on #\d+ )?(?:is )?(?:waiting|left|pending)|"
                         r"no (?:further )?action (?:needed|required)|can be closed)\b", re.I)


def card_fields(x) -> dict:
    """Board card fields from a PR / issue object this pass already fetched: branded title, state, labels and
    the packet block (sanitized, <= 200 chars a field). The body itself is discarded here, never stored."""
    import live_packet
    return {"title": brand(x.get("title") or "")[:120], "pr_state": x.get("state"), "closed_at": x.get("closed_at"),
            "labels": [lb.get("name") for lb in (x.get("labels") or []) if isinstance(lb, dict) and lb.get("name")][:8],
            "packet": live_packet.parse(x.get("body")) or None,
            "fixes": sorted({int(m) for m in FIXES_RE.findall(x.get("body") or "")} - {x.get("number")})[:10] or None}


def iso_ct(t: str, CT) -> str:
    return datetime.fromisoformat(t.replace("Z", "+00:00")).astimezone(CT).isoformat()


class RateLow(Exception):
    pass


class AuthExpired(Exception):
    """401 from GitHub: the read-only installation token expired (e.g. the box was paused past its 1 h life).
    Not an URLError/HTTPError subclass on purpose, so per-step "keep stored events" handlers don't swallow it:
    the feed exits and the supervisor re-mints."""


class Client:
    def __init__(self, token: str):
        self.token = token
        self.calls = self.not_modified = self.gql_calls = 0
        self.gql_points = 0
        self.remaining = self.gql_remaining = None

    def _req(self, url, method="GET", data=None, etag=None):
        h = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
             "User-Agent": "live-board-feed", "Authorization": f"Bearer {self.token}"}
        if etag:
            h["If-None-Match"] = etag
        if data is not None:
            h["Content-Type"] = "application/json"
        return urllib.request.Request(url, method=method, data=data, headers=h)

    def rest(self, path, params=None, etag=None, essential=False):
        """-> (status, data, etag, next_url). 304 -> (304, None, etag, None)."""
        if not essential and self.remaining is not None and self.remaining < REST_FLOOR:
            raise RateLow(f"core remaining {self.remaining} < floor {REST_FLOOR}")
        url = path if path.startswith("http") else API + path
        if params:
            url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
        self.calls += 1
        try:
            with urllib.request.urlopen(self._req(url, etag=etag), timeout=40) as r:
                rem = r.headers.get("X-RateLimit-Remaining")
                if rem is not None:
                    self.remaining = int(rem)
                body = r.read()
                m = re.search(r'<([^>]+)>;\s*rel="next"', r.headers.get("Link") or "")
                return r.status, json.loads(body or b"null"), r.headers.get("ETag"), (m.group(1) if m else None)
        except urllib.error.HTTPError as e:
            rem = e.headers.get("X-RateLimit-Remaining") if e.headers else None
            if rem is not None:
                self.remaining = int(rem)
            e.read(); e.close()
            if e.code == 304:
                self.not_modified += 1
                return 304, None, etag, None
            if e.code == 401:
                raise AuthExpired("HTTP 401 on REST") from None
            raise

    def gql(self, query, variables):
        if self.gql_remaining is not None and self.gql_remaining < GQL_FLOOR:
            raise RateLow(f"graphql remaining {self.gql_remaining} < floor {GQL_FLOOR}")
        data = json.dumps({"query": query, "variables": variables}).encode()
        self.gql_calls += 1
        try:
            with urllib.request.urlopen(self._req(API + "/graphql", "POST", data), timeout=90) as r:
                out = json.loads(r.read())
        except urllib.error.HTTPError as e:
            e.close()
            if e.code == 401:
                raise AuthExpired("HTTP 401 on GraphQL") from None
            raise
        if out.get("errors") and not out.get("data"):
            raise RuntimeError("graphql: " + "; ".join(str(e.get("message"))[:120] for e in out["errors"]))
        rl = (out.get("data") or {}).get("rateLimit") or {}
        self.gql_points += rl.get("cost") or 0
        if rl.get("remaining") is not None:
            self.gql_remaining = rl["remaining"]
        return out["data"]


COMMIT_FIELDS = """oid committedDate messageHeadline author { name user { login } }""" + ("" if NO_CHECKS else """
  checkSuites(first: 10) { totalCount nodes { databaseId status conclusion createdAt updatedAt app { slug }
    checkRuns(first: 25) { totalCount nodes { databaseId name status conclusion startedAt completedAt } } } }""") + """
  status { contexts { context state createdAt creator { login __typename } } }"""
Q_HISTORY = """query($owner:String!,$name:String!,$ref:String!,$after:String){ rateLimit{cost remaining}
 repository(owner:$owner,name:$name){ ref(qualifiedName:$ref){ target{ ... on Commit {
  history(first:50, after:$after){ totalCount pageInfo{hasNextPage endCursor} nodes{ %s } } } } } } }""" % COMMIT_FIELDS
Q_PRS = """query($owner:String!,$name:String!,$after:String){ rateLimit{cost remaining}
 repository(owner:$owner,name:$name){ pullRequests(first:10, after:$after, orderBy:{field:CREATED_AT, direction:ASC}){
  totalCount pageInfo{hasNextPage endCursor} nodes{ number
   commits(first:40){ totalCount nodes{ commit{ %s } } }
   reviews(first:60){ totalCount nodes{ databaseId state submittedAt url author{login __typename} } } } } } }""" % COMMIT_FIELDS


class RepoCollector:
    def __init__(self, repo: str, store_dir: Path, ff, log):
        self.repo, self.short = repo, repo.split("/", 1)[1]
        self.owner, self.name = repo.split("/", 1)
        self.ff, self.log, self.CT = ff, log, ff.CT
        self.path = store_dir / f"{self.short}.json"
        s = json.loads(self.path.read_text()) if self.path.exists() else {}
        self.ev: dict = s.get("events", {})
        for e in self.ev.values():   # apply the current branding + email redaction to stored labels/messages
            for k in ("from", "to"):    # and the current node mapping (lead-alt -> Lead)
                if isinstance(e.get(k), str) and e[k].lower() in ALIAS:
                    e[k] = ALIAS[e[k].lower()]
            if e.get("from") == "Others" and CLOUD_AGENT_RE.match(str(e.get("actor") or e.get("author") or "")):
                e["from"] = "CloudAgents"   # cloud-agent writes stored before the Cloud agents node existed
            for k in ("label", "message"):
                if isinstance(e.get(k), str) and (BRAND_RE.search(e[k]) or EMAIL_RE.search(e[k])):
                    e[k] = brand(e[k])
        self.st: dict = s.get("state", {})
        for k, v in (("etags", {}), ("cur", {}), ("prs", {}), ("ci", {}), ("reviewer", {}), ("bf", {}),
                     ("branch_shas", {}), ("tag_time", {}), ("gaps", {})):
            self.st.setdefault(k, v)

    # ---------------------------------------------------------------- helpers
    def save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(f".tmp.{os.getpid()}")
        tmp.write_text(json.dumps({"events": self.ev, "state": self.st}, ensure_ascii=False))
        os.replace(tmp, self.path)

    def put(self, eid, t, frm, to, kind, label, source, number=None, **extra):
        if not t:
            return
        if frm == to:
            to = "GitHub" if frm != "GitHub" else "Example"
        e = {"id": eid, "t_ct": iso_ct(t, self.CT) if (t.endswith("Z") or "+" in t[10:]) else t, "from": frm,
             "to": to, "kind": kind, "direction": "internal", "label": brand(label)[:54], "source": source,
             "src_file": "github-api", "repo": self.repo}
        if number is not None:
            e["number"] = int(number)
        for k, v in extra.items():
            if v is not None:
                e[k] = v
        self.ev[eid] = e

    def pr_node(self, n):
        p = self.st["prs"].get(str(n))
        return node(p["author"]) if p else "GitHub"

    def paged(self, c, path, params, key, stop=None, essential=True, max_pages=400):
        """Page 1 with ETag (key); then follow Link next until stop(item) is True. Yields items.
        Sets self._etag_new to the page-1 ETag to commit once the caller has processed everything."""
        st, data, etag, nxt = c.rest(path, dict(params, per_page=100), etag=self.st["etags"].get(key), essential=essential)
        self._etag_new = etag
        if st == 304:
            return
        pages = 1
        while True:
            items = data if isinstance(data, list) else (data or {}).get(params.get("_list_key", "workflow_runs"), [])
            for it in items:
                if stop and stop(it):
                    return
                yield it
            if not nxt or pages >= max_pages:
                return
            st, data, _, nxt = c.rest(nxt, essential=essential)
            pages += 1

    def mark_ci(self, sha, date, done=False, pr=None):
        ci = self.st["ci"].get(sha)
        if ci is None:
            ci = self.st["ci"][sha] = {"date": date, "done": done, "last": 0}
        elif done:
            ci["done"] = True
        if pr is not None:
            ci["pr"] = pr

    # ---------------------------------------------------------------- CI (shared GraphQL / REST mapping)
    def ci_from_commit_node(self, cm):
        sha, date = cm["oid"], cm["committedDate"]
        suites = (cm.get("checkSuites") or {}).get("nodes") or []
        incomplete = False
        truncated = (cm.get("checkSuites") or {}).get("totalCount", 0) > len(suites)
        for s in suites:
            app = ((s.get("app") or {}).get("slug")) or "app"
            if s.get("status") != "COMPLETED":
                incomplete = True
            self.put(f"{self.repo}:suite:{s['databaseId']}", s.get("createdAt"), "CI", "GitHub", "check_suite",
                     f"suite {app} {(s.get('conclusion') or s.get('status') or '').lower()} · {sha[:7]}",
                     f"https://github.com/{self.repo}/commit/{sha}/checks", None, sha=sha, app=app,
                     status=(s.get("status") or "").lower(), conclusion=(s.get("conclusion") or "").lower() or None,
                     updated=s.get("updatedAt"))
            runs = s.get("checkRuns") or {}
            if runs.get("totalCount", 0) > len(runs.get("nodes") or []):
                truncated = True
            for r in runs.get("nodes") or []:
                t = r.get("completedAt") or r.get("startedAt") or s.get("createdAt")
                self.put(f"{self.repo}:checkrun:{r['databaseId']}", t, "CI", "GitHub", "check_run",
                         f"{r['name']} {(r.get('conclusion') or r.get('status') or '').lower()} · {sha[:7]}",
                         f"https://github.com/{self.repo}/commit/{sha}/checks", None, sha=sha, name=brand(r["name"]),
                         app=app, status=(r.get("status") or "").lower(),
                         conclusion=(r.get("conclusion") or "").lower() or None, suite_id=s["databaseId"])
        for ctx in ((cm.get("status") or {}).get("contexts") or []):
            self.status_event(sha, ctx["context"], ctx["state"].lower(), ctx["createdAt"], gql_login(ctx.get("creator")))
        old = time.time() - datetime.fromisoformat(date.replace("Z", "+00:00")).timestamp() > 6 * 3600
        self.mark_ci(sha, date, done=(old or not incomplete) and not truncated)
        if truncated:
            self.st["ci"][sha]["done"] = False   # REST refresh pages through everything

    def status_event(self, sha, context, state, t, creator):
        railway = creator == "railway-app[bot]"
        kind = ("deploy" if state == "success" else "deploy_pending" if state == "pending" else "deploy_fail") \
            if railway else "commit_status"
        lab = (f"deploy{'' if state == 'success' else ' ' + state.upper()} · {self.short} {sha[:7]}" if railway
               else f"status {context} {state} · {sha[:7]}")
        self.put(f"{self.repo}:status:{sha}:{context}", t, "GitHub" if railway else node(creator),
                 "Example" if railway else "GitHub", kind, lab, f"https://github.com/{self.repo}/commit/{sha}",
                 None, sha=sha, context=brand(context), state=state, creator=creator)

    def ci_rest(self, c, sha):
        """Refresh one commit's suites, runs and statuses (ETag'd; 304s are free)."""
        ci = self.st["ci"][sha]
        incomplete = False
        for kind, path, lk in (() if NO_CHECKS else (
                ("suites", f"/repos/{self.repo}/commits/{sha}/check-suites", "check_suites"),
                ("runs", f"/repos/{self.repo}/commits/{sha}/check-runs", "check_runs"))):
            key = f"{kind}:{sha}"
            st, data, etag, nxt = c.rest(path, {"per_page": 100}, etag=self.st["etags"].get(key))
            if st == 304:
                if kind == "suites" and ci.get("suites_incomplete"):
                    incomplete = True
                continue
            items = list(data.get(lk, []))
            while nxt:
                _, d2, _, nxt = c.rest(nxt)
                items += d2.get(lk, [])
            if etag:
                self.st["etags"][key] = etag
            for x in items:
                if kind == "suites":
                    app = (x.get("app") or {}).get("slug") or "app"
                    if x.get("status") != "completed":
                        incomplete = True
                    self.put(f"{self.repo}:suite:{x['id']}", x.get("created_at"), "CI", "GitHub", "check_suite",
                             f"suite {app} {x.get('conclusion') or x.get('status')} · {sha[:7]}",
                             f"https://github.com/{self.repo}/commit/{sha}/checks", None, sha=sha, app=app,
                             status=x.get("status"), conclusion=x.get("conclusion"), updated=x.get("updated_at"))
                else:
                    t = x.get("completed_at") or x.get("started_at")
                    self.put(f"{self.repo}:checkrun:{x['id']}", t, "CI", "GitHub", "check_run",
                             f"{x['name']} {x.get('conclusion') or x.get('status')} · {sha[:7]}",
                             f"https://github.com/{self.repo}/commit/{sha}/checks", None, sha=sha,
                             name=brand(x["name"]), app=(x.get("app") or {}).get("slug"), status=x.get("status"),
                             conclusion=x.get("conclusion"), suite_id=(x.get("check_suite") or {}).get("id"))
            if kind == "suites":
                ci["suites_incomplete"] = incomplete
        key = f"statuses:{sha}"
        st, data, etag, _ = c.rest(f"/repos/{self.repo}/commits/{sha}/statuses", {"per_page": 100},
                                   etag=self.st["etags"].get(key))
        if st != 304:
            if etag:
                self.st["etags"][key] = etag
            seen = set()
            for s in data:   # newest first: keep the latest per context
                if s["context"] in seen:
                    continue
                seen.add(s["context"])
                self.status_event(sha, s["context"], s["state"], s["created_at"], (s.get("creator") or {}).get("login"))
        ci["last"] = time.time()
        old = time.time() - datetime.fromisoformat(ci["date"].replace("Z", "+00:00")).timestamp() > 6 * 3600
        if old or not incomplete:
            ci["done"] = True

    # ---------------------------------------------------------------- backfill (GraphQL)
    def backfill(self, c, deadline):
        bf = self.st["bf"]
        for b in MERGE_BASES:
            k = f"hist:{b}"
            while not bf.get(k + ":done") and time.time() < deadline:
                d = c.gql(Q_HISTORY, {"owner": self.owner, "name": self.name, "ref": f"refs/heads/{b}",
                                      "after": bf.get(k + ":cursor")})
                h = d["repository"]["ref"]["target"]["history"]
                bf[k + ":total"] = h["totalCount"]
                for cm in h["nodes"]:
                    self.commit_event(cm["oid"], cm["committedDate"], cm["messageHeadline"], commit_login(cm), b)
                    self.ci_from_commit_node(cm)
                bf[k + ":cursor"] = h["pageInfo"]["endCursor"]
                if not h["pageInfo"]["hasNextPage"]:
                    bf[k + ":done"] = True
        k = "prs"
        while not bf.get(k + ":done") and time.time() < deadline:
            d = c.gql(Q_PRS, {"owner": self.owner, "name": self.name, "after": bf.get(k + ":cursor")})
            prs = d["repository"]["pullRequests"]
            for p in prs["nodes"]:
                n = p["number"]
                for cn in p["commits"]["nodes"]:
                    cm = cn["commit"]
                    self.pr_commit_event(n, cm["oid"], cm["committedDate"], cm["messageHeadline"], commit_login(cm))
                    self.ci_from_commit_node(cm)
                    self.st["ci"][cm["oid"]]["pr"] = n
                for r in p["reviews"]["nodes"]:
                    self.review_event(n, r["databaseId"], r["state"], r.get("submittedAt"), gql_login(r.get("author")),
                                      r.get("url"))
                need = p["commits"]["totalCount"] > len(p["commits"]["nodes"]) or \
                    p["reviews"]["totalCount"] > len(p["reviews"]["nodes"])
                if need:   # page the rest through REST
                    self.st.setdefault("enrich", {})[str(n)] = True
            bf[k + ":cursor"] = prs["pageInfo"]["endCursor"]
            if not prs["pageInfo"]["hasNextPage"]:
                bf[k + ":done"] = True
        return all(bf.get(f"hist:{b}:done") for b in MERGE_BASES) and bf.get("prs:done")

    # ---------------------------------------------------------------- event builders
    def commit_event(self, sha, date, msg, login, branch):
        eid = f"{self.repo}:commit:{sha}"
        cur = self.ev.get(eid)
        branches = sorted(set((cur or {}).get("branches", [])) | {branch})
        self.st["branch_shas"].setdefault(branch, {})[sha] = 1
        m = brand((msg or "").splitlines()[0] if msg else "")[:72]
        self.put(eid, date, node(login), "GitHub", "commit", f"{'/'.join(branches)} {sha[:7]} · {m}",
                 f"https://github.com/{self.repo}/commit/{sha}", None, sha=sha, branches=branches, message=m,
                 author=login)

    def pr_commit_event(self, n, sha, date, msg, login):
        m = brand((msg or "").splitlines()[0] if msg else "")[:72]
        self.put(f"{self.repo}#{n}:commit:{sha}", date, node(login), "GitHub", "pr_commit",
                 f"{self.short} #{n} push {sha[:7]} · {m}", f"https://github.com/{self.repo}/pull/{n}/commits/{sha}",
                 n, sha=sha, message=m, author=login)

    def review_event(self, n, rid, state, t, login, url):
        if not t or state == "PENDING":
            return
        self.put(f"{self.repo}#{n}:review:{rid}", t, node(login), self.pr_node(n), "review",
                 f"{login or '?'} {state.lower()} · {self.short} #{n}", url or f"https://github.com/{self.repo}/pull/{n}",
                 n, state=state, actor=login)

    # ---------------------------------------------------------------- incremental (REST)
    def poll_pulls(self, c):
        cur = self.st["cur"].get("pulls")
        newest = cur
        for p in self.paged(c, f"/repos/{self.repo}/pulls", {"state": "all", "sort": "updated", "direction": "desc"},
                            "pulls", stop=lambda p: cur is not None and p["updated_at"] <= cur):
            n, login = p["number"], p["user"]["login"]
            prev = self.st["prs"].get(str(n), {})
            self.st["prs"][str(n)] = {"author": login, "updated_at": p["updated_at"], "head": p["head"]["sha"],
                                      "merged_at": p.get("merged_at"), "state": p["state"], "base": p["base"]["ref"]}
            url = p["html_url"]
            self.put(f"{self.repo}#{n}:open", p["created_at"], node(login), "GitHub", "pr_open",
                     f"{self.short} #{n} opened · {p['title']}", url, n, base=p["base"]["ref"], actor=login,
                     draft=p.get("draft"), **card_fields(p))
            if p.get("merged_at"):
                self.put(f"{self.repo}#{n}:merged", p["merged_at"], node(login), "GitHub", "merged",
                         f"merged {self.short} #{n} → {p['base']['ref']}", url, n, base=p["base"]["ref"],
                         merge_sha=p.get("merge_commit_sha"), actor=login)
            if self.st["bf"].get("prs:done") and prev.get("updated_at") != p["updated_at"]:
                self.st.setdefault("enrich", {})[str(n)] = True
            if newest is None or p["updated_at"] > newest:
                newest = p["updated_at"]
        self.st["cur"]["pulls"] = newest
        if self._etag_new:
            self.st["etags"]["pulls"] = self._etag_new

    def enrich_prs(self, c, limit=20):
        todo = list(self.st.get("enrich", {}).keys())[:limit]
        for n in todo:
            for r in self._all(c, f"/repos/{self.repo}/pulls/{n}/reviews"):
                self.review_event(int(n), r["id"], r["state"], r.get("submitted_at"), (r.get("user") or {}).get("login"),
                                  r.get("html_url"))
            for cm in self._all(c, f"/repos/{self.repo}/pulls/{n}/commits"):
                d = cm["commit"]["committer"]["date"]
                self.pr_commit_event(int(n), cm["sha"], d, cm["commit"]["message"], (cm.get("author") or {}).get("login"))
                self.mark_ci(cm["sha"], d, pr=int(n))
            self.st["enrich"].pop(n, None)

    def _all(self, c, path, params=None):
        st, data, _, nxt = c.rest(path, dict(params or {}, per_page=100))
        out = list(data)
        while nxt:
            _, d, _, nxt = c.rest(nxt)
            out += d
        return out

    ISSUE_EVENT_KIND = {"labeled": "labeled", "unlabeled": "unlabeled", "assigned": "assigned",
                        "unassigned": "unassigned", "milestoned": "milestoned", "demilestoned": "demilestoned",
                        "reopened": "reopen", "renamed": "edit"}

    def poll_issue_events(self, c):
        cur = self.st["cur"].get("ievents", 0)
        newest = cur
        for e in self.paged(c, f"/repos/{self.repo}/issues/events", {}, "ievents", stop=lambda e: e["id"] <= cur):
            newest = max(newest, e["id"])
            iss = e.get("issue") or {}
            n = iss.get("number")
            if n is None:
                continue
            is_pr = "pull_request" in iss
            pre = "pr" if is_pr else "issue"
            ev, actor = e["event"], (e.get("actor") or {}).get("login")
            url = iss.get("html_url") or f"https://github.com/{self.repo}/issues/{n}"
            eid = f"{self.repo}{'#' if is_pr else '!'}{n}:ev:{e['id']}"
            frm, tag = node(actor), f"{self.short} {'#' if is_pr else 'issue #'}{n}"
            if ev == "closed":
                if is_pr:
                    pr = self.st["prs"].get(str(n), {})
                    if pr.get("merged_at") and abs(datetime.fromisoformat(pr["merged_at"].replace("Z", "+00:00")).timestamp()
                                                   - datetime.fromisoformat(e["created_at"].replace("Z", "+00:00")).timestamp()) < 30:
                        continue   # the merge itself (emitted as 'merged')
                    self.put(eid, e["created_at"], frm, "GitHub", "pr_close", f"closed {tag} unmerged", url, n, actor=actor)
                else:
                    sr = e.get("state_reason") or iss.get("state_reason")
                    self.put(eid, e["created_at"], frm, "GitHub", "issue_close", f"closed {tag} ({sr or 'closed'})",
                             url, n, actor=actor, state_reason=sr)
            elif ev == "merged":
                continue
            elif ev in ("ready_for_review", "convert_to_draft") and is_pr:
                k = "pr_ready" if ev == "ready_for_review" else "pr_draft"
                self.put(eid, e["created_at"], frm, "GitHub", k,
                         f"{tag} {'ready for review' if k == 'pr_ready' else 'converted to draft'}", url, n, actor=actor)
            elif ev in ("review_requested", "review_request_removed") and is_pr:
                who = (e.get("requested_reviewer") or {}).get("login") or (e.get("requested_team") or {}).get("name")
                k = "pr_review_requested" if ev == "review_requested" else "pr_review_request_removed"
                self.put(eid, e["created_at"], frm, node(who) if who else "GitHub", k,
                         f"{tag} review {'requested' if k.endswith('requested') else 'request removed'}: {who}",
                         url, n, actor=actor, reviewer=who)
            elif ev == "base_ref_changed" and is_pr:
                self.put(eid, e["created_at"], frm, "GitHub", "pr_edit", f"{tag} base changed", url, n, actor=actor,
                         change="base")
            elif ev == "head_ref_force_pushed" and is_pr:
                self.put(eid, e["created_at"], frm, "GitHub", "pr_force_push", f"{tag} force-pushed", url, n,
                         actor=actor)
            elif ev in self.ISSUE_EVENT_KIND:
                k = self.ISSUE_EVENT_KIND[ev]
                detail = {"labeled": (e.get("label") or {}).get("name"), "unlabeled": (e.get("label") or {}).get("name"),
                          "assigned": (e.get("assignee") or {}).get("login"),
                          "unassigned": (e.get("assignee") or {}).get("login"),
                          "milestoned": (e.get("milestone") or {}).get("title"),
                          "demilestoned": (e.get("milestone") or {}).get("title")}.get(ev)
                word = {"reopen": "reopened", "edit": "title edited"}.get(k, k)
                self.put(eid, e["created_at"], frm, "GitHub", f"{pre}_{k}",
                         f"{tag} {word}" + (f": {detail}" if detail else ""), url, n, actor=actor,
                         detail=brand(detail) if detail else None, change="title" if k == "edit" else None)
            else:
                self.put(eid, e["created_at"], frm, "GitHub", f"{pre}_activity", f"{tag} {ev.replace('_', ' ')}",
                         url, n, actor=actor, event=ev)
        self.st["cur"]["ievents"] = newest
        if self._etag_new:
            self.st["etags"]["ievents"] = self._etag_new

    def poll_issues(self, c):
        cur = self.st["cur"].get("issues")
        newest = cur
        for i in self.paged(c, f"/repos/{self.repo}/issues", {"state": "all", "sort": "updated", "direction": "desc"},
                            "issues", stop=lambda i: cur is not None and i["updated_at"] <= cur):
            if newest is None or i["updated_at"] > newest:
                newest = i["updated_at"]
            if "pull_request" in i:
                continue
            n, login = i["number"], (i.get("user") or {}).get("login")
            self.put(f"{self.repo}!{n}:open", i["created_at"], node(login), "GitHub", "issue_open",
                     f"{self.short} issue #{n} opened · {i['title']}", i["html_url"], n, actor=login, **card_fields(i))
        self.st["cur"]["issues"] = newest
        if self._etag_new:
            self.st["etags"]["issues"] = self._etag_new

    def poll_comments(self, c):
        cur = self.st["cur"].get("comments")
        if not self.st["bf"].get("comments:critic3"):   # one-time: re-read 14 days of comments (Parked: flags, Reviewer verdicts)
            back = (datetime.now(timezone.utc) - timedelta(days=14)).strftime("%Y-%m-%dT%H:%M:%SZ")
            cur = min(cur, back) if cur else cur
            self.st["etags"].pop("comments", None)       # else page 1 answers 304 and nothing is re-read
            self.st["bf"]["comments:critic3"] = True
        newest = self.st["cur"].get("comments")
        for cm in self.paged(c, f"/repos/{self.repo}/issues/comments", {"sort": "updated", "direction": "desc"},
                             "comments", stop=lambda x: cur is not None and x["updated_at"] <= cur):
            if newest is None or cm["updated_at"] > newest:
                newest = cm["updated_at"]
            n = int(cm["issue_url"].rsplit("/", 1)[1])
            is_pr = "/pull/" in cm["html_url"]
            login = (cm.get("user") or {}).get("login")
            k = "pr_comment" if is_pr else "issue_comment"
            to = self.pr_node(n) if is_pr else "GitHub"
            self.put(f"{self.repo}{'#' if is_pr else '!'}{n}:comment:{cm['id']}", cm["created_at"], node(login), to, k,
                     f"{login or '?'} comment · {self.short} {'#' if is_pr else 'issue #'}{n}", cm["html_url"], n,
                     actor=login, resolved=True if RESOLVED_RE.search(cm.get("body") or "") else None,   # flags only
                     parked=True if PARKED_COMMENT_RE.match(cm.get("body") or "") else None)
            if is_pr and login in CRITIC_LOGINS:   # verdict word + SHA only; the body is discarded here
                body = (cm.get("body") or "").lstrip()
                m = CRITIC_RE.match(body)
                if m:
                    sm = SHA_RE.search(body.splitlines()[0])
                    verdict, result = (m.group(1), None) if m.group(1) else ("RE-CHECK", m.group(2))
                    prev = self.st["reviewer"].get(str(n))
                    if prev is None or [cm["created_at"], cm["id"]] > [prev["t"], prev["id"]]:
                        self.st["reviewer"][str(n)] = {"t": cm["created_at"], "id": cm["id"], "verdict": verdict,
                                                     "result": result, "sha": sm.group(1) if sm else None,
                                                     "url": cm["html_url"]}
        self.st["cur"]["comments"] = newest
        if self._etag_new:
            self.st["etags"]["comments"] = self._etag_new
        for n, v in self.st["reviewer"].items():   # latest verdict per PR, stable id
            word = v["result"] or v["verdict"]
            kind = {"PASS": "critic_pass", "FAIL": "critic_fail", "HOLD": "critic_hold"}.get(word, "critic_recheck")
            shown = (f"re-check {v['result']}" if v["result"] else "re-check") if v["verdict"] == "RE-CHECK" else v["verdict"]
            self.put(f"{self.repo}#{n}:reviewer", v["t"], "Reviewer", self.pr_node(n), kind,
                     f"reviewer {shown} · {self.short} #{n}" + (f" @ {v['sha'][:7]}" if v["sha"] else ""), v["url"], n,
                     verdict=v["verdict"], recheck_result=v["result"], sha=v["sha"])

    def poll_review_comments(self, c):
        cur = self.st["cur"].get("rcomments")
        newest = cur
        for cm in self.paged(c, f"/repos/{self.repo}/pulls/comments", {"sort": "updated", "direction": "desc"},
                             "rcomments", stop=lambda x: cur is not None and x["updated_at"] <= cur):
            if newest is None or cm["updated_at"] > newest:
                newest = cm["updated_at"]
            n = int(cm["pull_request_url"].rsplit("/", 1)[1])
            login = (cm.get("user") or {}).get("login")
            self.put(f"{self.repo}#{n}:rcomment:{cm['id']}", cm["created_at"], node(login), self.pr_node(n),
                     "review_comment", f"{login or '?'} review comment · {self.short} #{n}", cm["html_url"], n,
                     actor=login)
        if newest is None and self._etag_new:   # empty list: pin so a later 200 cannot re-walk history
            newest = "1970-01-01T00:00:00Z"
        self.st["cur"]["rcomments"] = newest
        if self._etag_new:
            self.st["etags"]["rcomments"] = self._etag_new

    def poll_commits(self, c):
        for b in MERGE_BASES:
            known = self.st["branch_shas"].setdefault(b, {})
            for cm in self.paged(c, f"/repos/{self.repo}/commits", {"sha": b}, f"commits:{b}",
                                 stop=lambda x: x["sha"] in known):
                d = cm["commit"]["committer"]["date"]
                self.commit_event(cm["sha"], d, cm["commit"]["message"], (cm.get("author") or {}).get("login")
                                  or (cm["commit"]["author"]["name"] if cm["commit"]["author"]["name"].endswith("[bot]") else None), b)
                self.mark_ci(cm["sha"], d)
            if self._etag_new:
                self.st["etags"][f"commits:{b}"] = self._etag_new

    def poll_runs(self, c):
        cur = self.st["cur"].get("runs_max_id", 0)
        newest = cur
        backfilled = self.st["bf"].get("runs:done")
        st, data, etag, nxt = c.rest(f"/repos/{self.repo}/actions/runs", {"per_page": 100},
                                     etag=self.st["etags"].get("runs"))
        if st == 304:
            return
        pages = 1
        while True:
            for r in data.get("workflow_runs", []):
                newest = max(newest, r["id"])
                self.put(f"{self.repo}:run:{r['id']}", r.get("run_started_at") or r["created_at"], "CI", "GitHub",
                         "workflow_run", f"run {r['name']} · {r.get('head_branch') or '?'} · {r.get('conclusion') or r['status']}",
                         r["html_url"], None, name=brand(r["name"]), event=r["event"], branch=r.get("head_branch"),
                         status=r["status"], conclusion=r.get("conclusion"), run_number=r.get("run_number"),
                         head_sha=r.get("head_sha"), updated=r.get("updated_at"), actor=(r.get("actor") or {}).get("login"))
                if NO_CHECKS and r.get("check_suite_id"):
                    self.suite_from_run(r)
                recent = r.get("head_sha") and time.time() - datetime.fromisoformat(
                    r["created_at"].replace("Z", "+00:00")).timestamp() < JOBS_WINDOW_S
                if recent:
                    self.mark_ci(r["head_sha"], r["created_at"])   # history comes from the GraphQL backfill
                    if NO_CHECKS:
                        self.st.setdefault("jobs", {}).setdefault(str(r["id"]), {})
                        self.st["jobs"][str(r["id"])].update(sha=r["head_sha"], created=r["created_at"],
                                                             suite=r.get("check_suite_id"), status=r["status"])
            # backfill: every page once; afterwards page 1 only (ETag refreshes in-progress runs)
            if not nxt or (backfilled and pages >= 1):
                break
            st, data, _, nxt = c.rest(nxt)
            pages += 1
        self.st["bf"]["runs:done"] = True
        self.st["cur"]["runs_max_id"] = newest
        if etag:
            self.st["etags"]["runs"] = etag

    def suite_from_run(self, r):
        """Actions workflow run == its check suite (check_suite_id): same id/kind as the Checks API mapping."""
        sha = r.get("head_sha") or ""
        self.put(f"{self.repo}:suite:{r['check_suite_id']}", r["created_at"], "CI", "GitHub", "check_suite",
                 f"suite github-actions {r.get('conclusion') or r['status']} · {sha[:7]}",
                 f"https://github.com/{self.repo}/commit/{sha}/checks", None, sha=sha, app="github-actions",
                 status=r["status"], conclusion=r.get("conclusion"), updated=r.get("updated_at"), derived="actions-run")

    def poll_jobs(self, c):
        """Actions jobs of recent runs -> check_run events (job id == check run id). ETag'd; stop once completed."""
        jobs, now = self.st.setdefault("jobs", {}), time.time()
        for rid, j in list(jobs.items()):
            try:
                age = now - datetime.fromisoformat(j["created"].replace("Z", "+00:00")).timestamp()
            except (KeyError, ValueError, AttributeError):
                age = 1e9
            if age > JOBS_WINDOW_S:
                jobs.pop(rid, None); self.st["etags"].pop(f"jobs:{rid}", None)
                continue
            if j.get("done"):
                continue
            st, data, etag, nxt = c.rest(f"/repos/{self.repo}/actions/runs/{rid}/jobs", {"per_page": 100},
                                         etag=self.st["etags"].get(f"jobs:{rid}"))
            if st == 304:
                continue
            items = list(data.get("jobs", []))
            while nxt:
                _, d2, _, nxt = c.rest(nxt)
                items += d2.get("jobs", [])
            if etag:
                self.st["etags"][f"jobs:{rid}"] = etag
            sha = j.get("sha") or ""
            for x in items:
                t = x.get("completed_at") or x.get("started_at") or x.get("created_at")
                self.put(f"{self.repo}:checkrun:{x['id']}", t, "CI", "GitHub", "check_run",
                         f"{x['name']} {x.get('conclusion') or x.get('status')} · {sha[:7]}",
                         f"https://github.com/{self.repo}/commit/{sha}/checks", None, sha=sha,
                         name=brand(x["name"]), app="github-actions", status=x.get("status"),
                         conclusion=x.get("conclusion"), suite_id=j.get("suite"), derived="actions-job")
            if j.get("status") == "completed" and items and all(x.get("status") == "completed" for x in items):
                j["done"] = True

    def poll_tags_releases(self, c):
        if time.time() - self.st["cur"].get("tags_last", 0) < 600:
            return
        st, data, etag, _ = c.rest(f"/repos/{self.repo}/tags", {"per_page": 100}, etag=self.st["etags"].get("tags"))
        if st != 304:
            for tg in data:
                sha = tg["commit"]["sha"]
                if sha not in self.st["tag_time"]:
                    _, cm, _, _ = c.rest(f"/repos/{self.repo}/commits/{sha}")
                    self.st["tag_time"][sha] = cm["commit"]["committer"]["date"]
                self.put(f"{self.repo}:tag:{tg['name']}", self.st["tag_time"][sha], "GitHub", "Example", "tag",
                         f"tag {tg['name']} · {sha[:7]}", f"https://github.com/{self.repo}/releases/tag/{tg['name']}",
                         None, tag=brand(tg["name"]), sha=sha, time_basis="tagged commit date")
            if etag:
                self.st["etags"]["tags"] = etag
        st, data, etag, _ = c.rest(f"/repos/{self.repo}/releases", {"per_page": 100}, etag=self.st["etags"].get("releases"))
        if st != 304:
            for r in data:
                self.put(f"{self.repo}:release:{r['id']}", r.get("published_at") or r["created_at"], node((r.get("author") or {}).get("login")),
                         "GitHub", "release", f"release {r.get('tag_name')} · {r.get('name') or ''}", r["html_url"], None,
                         tag=r.get("tag_name"), name=brand(r.get("name")), draft=r.get("draft"), prerelease=r.get("prerelease"))
            if etag:
                self.st["etags"]["releases"] = etag
        self.st["cur"]["tags_last"] = time.time()

    def poll_deployments(self, c):
        if time.time() - self.st["gaps"].get("deployments_checked", 0) < 3600:
            return
        try:
            c.rest(f"/repos/{self.repo}/deployments", {"per_page": 1})
            self.st["gaps"]["deployments"] = None
        except urllib.error.HTTPError as e:
            self.st["gaps"]["deployments"] = f"HTTP {e.code} (token has no deployments permission; not widened)"
        self.st["gaps"]["deployments_checked"] = time.time()

    def refresh_ci(self, c, deadline, limit=6):
        """Incremental: only a few recent incomplete SHAs per pass. Older open CI is marked done
        (one last check if never polled, else just closed) so a pass stays well under 60s."""
        now = time.time()
        recent, stale = [], []
        for sha, v in self.st["ci"].items():
            if v.get("done"):
                continue
            try:
                age = now - datetime.fromisoformat(v["date"].replace("Z", "+00:00")).timestamp()
            except (KeyError, ValueError, TypeError):
                age = 1e9
            if age > 2 * 3600:          # cold history: do not keep re-polling
                stale.append(sha)
            elif now - v.get("last", 0) > 90:
                recent.append(sha)
        for sha in stale:               # drop from the open set (ci_rest would also mark done by age)
            self.st["ci"][sha]["done"] = True
        recent.sort(key=lambda s: self.st["ci"][s].get("date") or "", reverse=True)
        for sha in recent[:limit]:
            if time.time() > deadline:
                break
            self.ci_rest(c, sha)

    # ---------------------------------------------------------------- one pass
    def run(self, c, deadline):
        steps = [("pulls", self.poll_pulls), ("issues", self.poll_issues), ("issue events", self.poll_issue_events),
                 ("comments", self.poll_comments), ("review comments", self.poll_review_comments),
                 ("runs", self.poll_runs)] + ([("jobs", self.poll_jobs)] if NO_CHECKS else []) + [
                 ("tags/releases", self.poll_tags_releases),
                 ("deployments", self.poll_deployments)]
        for name, fn in steps:
            try:
                fn(c)
            except RateLow as e:
                self.log(f"{self.short}: {name} deferred ({e})")
            except (urllib.error.URLError, http.client.HTTPException, TimeoutError, OSError, ValueError, KeyError) as e:
                self.log(f"{self.short}: {name} failed ({type(e).__name__}: {str(e)[:80]}); keeping stored events")
        try:
            done = self.backfill(c, deadline)
        except (RateLow, RuntimeError, urllib.error.URLError, http.client.HTTPException, TimeoutError, OSError, KeyError,
                TypeError) as e:
            done = False
            self.log(f"{self.short}: backfill paused ({type(e).__name__}: {str(e)[:100]})")
        if done:
            for name, fn in (("commits", self.poll_commits), ("pr enrich", self.enrich_prs),
                             ("ci refresh", lambda c: self.refresh_ci(c, deadline))):
                try:
                    fn(c)
                except RateLow as e:
                    self.log(f"{self.short}: {name} deferred ({e})")
                except (urllib.error.URLError, http.client.HTTPException, TimeoutError, OSError, ValueError, KeyError) as e:
                    self.log(f"{self.short}: {name} failed ({type(e).__name__}: {str(e)[:80]})")
        self.save()
        return done
