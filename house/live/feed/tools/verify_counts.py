#!/usr/bin/env python3
"""Compare live-events.json counts with GitHub (read-only token in GH_TOKEN). Prints a table; no bodies."""
import json, os, re, sys, time, urllib.request, urllib.error
from collections import Counter
FEED = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.environ.get("MESH_RUN", "/srv/live-mesh-run"), "feed/live-events.json")
T = os.environ["GH_TOKEN"]; API = "https://api.github.com"
def req(url, data=None):
    r = urllib.request.Request(url, data=data, method="POST" if data else "GET", headers={
        "Authorization": f"Bearer {T}", "Accept": "application/vnd.github+json", "User-Agent": "live-board-verify",
        **({"Content-Type": "application/json"} if data else {})})
    with urllib.request.urlopen(r, timeout=90) as x:
        return json.loads(x.read()), x.headers
def count(path):
    d, h = req(API + path + ("&" if "?" in path else "?") + "per_page=1")
    m = re.search(r'[?&]page=(\d+)>; rel="last"', h.get("Link") or "")
    return int(m.group(1)) if m else len(d)
def allpages(path):
    out, url = [], API + path + ("&" if "?" in path else "?") + "per_page=100"
    while url:
        d, h = req(url); out += d
        m = re.search(r'<([^>]+)>;\s*rel="next"', h.get("Link") or ""); url = m.group(1) if m else None
    return out
def gql(q, v):
    for i in range(5):   # pace + back off on secondary rate limits (403/502)
        time.sleep(1)
        try:
            d, _ = req(API + "/graphql", json.dumps({"query": q, "variables": v}).encode()); break
        except urllib.error.HTTPError as e:
            if e.code not in (403, 502) or i == 4: raise
            time.sleep(30 * (i + 1))
    if d.get("errors"): raise RuntimeError(d["errors"][0]["message"])
    return d["data"]
QH = """query($o:String!,$n:String!,$r:String!,$a:String){ repository(owner:$o,name:$n){ ref(qualifiedName:$r){ target{ ... on Commit {
 history(first:50, after:$a){ pageInfo{hasNextPage endCursor} nodes{ oid checkSuites(first:20){ totalCount nodes{ databaseId checkRuns(first:1){ totalCount } } } } } } } } } }"""
SUITES = "checkSuites(first:20){ totalCount nodes{ databaseId checkRuns(first:1){ totalCount } } }"
QH = QH.replace("history(first:50", "history(first:40")
QP = """query($o:String!,$n:String!,$a:String){ repository(owner:$o,name:$n){ pullRequests(first:50, after:$a){ pageInfo{hasNextPage endCursor}
 nodes{ number reviews(first:1){ totalCount } } } } }"""
QPC = """query($o:String!,$n:String!,$a:String){ repository(owner:$o,name:$n){ pullRequests(first:10, after:$a){ pageInfo{hasNextPage endCursor}
 nodes{ commits(first:100){ nodes{ commit{ oid } } } } } } }"""
feed = json.load(open(FEED)); ev = feed["events"]
rows = []
for repo in ("example-org/app", "example-org/mcp"):
    o, n = repo.split("/"); R = f"/repos/{repo}"
    E = [e for e in ev if e.get("repo") == repo]; K = Counter(e["kind"] for e in E)
    prs = allpages(R + "/pulls?state=all")
    gh_merged = sum(1 for p in prs if p.get("merged_at"))
    gh_closed_unmerged = sum(1 for p in prs if p["state"] == "closed" and not p.get("merged_at"))
    issues = [i for i in allpages(R + "/issues?state=all") if "pull_request" not in i]
    # check runs / suites / reviews via GraphQL totals over the commits the feed covers (develop, main, PR commits)
    shas, suites, runs, reviews = set(), {}, {}, 0
    CI = os.environ.get("VERIFY_CI", "1") == "1"   # CI rows cost ~1.5k GraphQL points; VERIFY_CI=0 skips them
    for b in (("develop", "main") if CI else ()):
        a = None
        while True:
            h = gql(QH, {"o": o, "n": n, "r": f"refs/heads/{b}", "a": a})["repository"]["ref"]["target"]["history"]
            for c in h["nodes"]:
                shas.add(c["oid"])
                for s in c["checkSuites"]["nodes"]: suites[s["databaseId"]] = s["checkRuns"]["totalCount"]
            if not h["pageInfo"]["hasNextPage"]: break
            a = h["pageInfo"]["endCursor"]
    pr_shas = set()
    a = None
    while True:
        p = gql(QP, {"o": o, "n": n, "a": a})["repository"]["pullRequests"]
        reviews += sum(pr["reviews"]["totalCount"] for pr in p["nodes"])
        if not p["pageInfo"]["hasNextPage"]: break
        a = p["pageInfo"]["endCursor"]
    a = None
    while CI:
        p = gql(QPC, {"o": o, "n": n, "a": a})["repository"]["pullRequests"]
        for pr in p["nodes"]:
            pr_shas |= {cn["commit"]["oid"] for cn in pr["commits"]["nodes"]}
        if not p["pageInfo"]["hasNextPage"]: break
        a = p["pageInfo"]["endCursor"]
    extra = sorted(pr_shas - shas) if CI else []
    for i in range(0, len(extra), 25):
        q = "query{ repository(owner:%s,name:%s){ " % (json.dumps(o), json.dumps(n)) + " ".join(
            f'c{j}: object(oid:"{x}"){{ ... on Commit {{ {SUITES} }} }}' for j, x in enumerate(extra[i:i + 25])) + " } }"
        for c in gql(q, {})["repository"].values():
            if c:
                for s in c["checkSuites"]["nodes"]: suites[s["databaseId"]] = s["checkRuns"]["totalCount"]
    shas |= pr_shas
    feed_commits = {b: sum(1 for e in E if e["kind"] == "commit" and b in e.get("branches", [])) for b in ("develop", "main")}
    runs_total = count(R + "/actions/runs") if False else req(API + R + "/actions/runs?per_page=1")[0]["total_count"]
    feed_suite_ids = {e.get("suite_id") for e in E if e["kind"] == "check_run"}
    t = [
        ("PRs opened", K["pr_open"], len(prs)),
        ("PRs merged", K["merged"], gh_merged),
        ("PRs closed unmerged (distinct PRs)", len({e["number"] for e in E if e["kind"] == "pr_close"}), gh_closed_unmerged),
        ("issues opened", K["issue_open"], len(issues)),
        ("issues closed (distinct issues)", len({e["number"] for e in E if e["kind"] == "issue_close"}),
         sum(1 for i in issues if i["state"] == "closed")),
        ("reviews", K["review"], reviews),
        ("comments (issue+PR)", K["pr_comment"] + K["issue_comment"], count(R + "/issues/comments")),
        ("review comments", K["review_comment"], count(R + "/pulls/comments")),
        ("commits on develop", feed_commits["develop"], count(R + "/commits?sha=develop")),
        ("commits on main", feed_commits["main"], count(R + "/commits?sha=main")),
        ("workflow runs", K["workflow_run"], runs_total),
    ] + ([("check suites (covered commits)", K["check_suite"], len(suites)),
          ("check runs (covered commits)", K["check_run"], sum(suites.values()))] if CI else [])
    for name, f, g in t:
        rows.append((repo.split("/")[1], name, f, g, "OK" if f == g else f"diff {f - g:+d}"))
w = max(len(r[1]) for r in rows)
print(f"{'repo':16} {'type':{w}} {'feed':>7} {'github':>7}  result")
for r in rows:
    print(f"{r[0]:16} {r[1]:{w}} {r[2]:>7} {r[3]:>7}  {r[4]}")
