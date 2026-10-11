"""Packet fields from an issue / PR body, captured in the existing feed pass (the body itself is never stored).

A packet is 7 fields: goal, constraints, path, acceptance, evidence, next owner, escalate. Two forms:
  ## Packet                         single line:
  - Goal: ...                       Packet: goal: ... | constraints: ... | acceptance: ... | next owner: ...
  - Next owner: ...                 (';' also separates fields)
Every field: emails -> [email], links whose host is not GitHub, Railway or example.com are stripped, <= 200 chars."""
import re
from urllib.parse import urlparse

FIELDS = ("goal", "constraints", "path", "acceptance", "evidence", "next owner", "escalate")
ALIAS = {"next": "next owner", "next_owner": "next owner", "owner": "next owner", "constraint": "constraints",
         "accept": "acceptance", "done when": "acceptance", "escalation": "escalate"}
MAX = 200
EMAIL = re.compile(r"[\w.+-]+@[\w-]+(\.[\w-]+)+")
URL = re.compile(r"https?://[^\s)>\]]+")
MDLINK = re.compile(r"\[([^\]]*)\]\((https?://[^)\s]+)\)")
OK_HOSTS = ("github.com", "railway.app", "railway.com", "example.com")


def _host_ok(u):
    h = (urlparse(u).hostname or "").lower()
    return any(h == d or h.endswith("." + d) for d in OK_HOSTS)


def clean(s):
    s = MDLINK.sub(lambda m: m.group(0) if _host_ok(m.group(2)) else m.group(1), str(s or ""))
    s = URL.sub(lambda m: m.group(0) if _host_ok(m.group(0)) else "", s)
    s = EMAIL.sub("[email]", s)
    s = " ".join(s.replace("**", "").replace("`", "").split())
    return s[:MAX].rstrip()


def _key(k):
    k = re.sub(r"[*_`]", "", k).strip().lower()
    k = ALIAS.get(k, k)
    return k if k in FIELDS else None


def parse(body):
    """-> {field: text} for the fields present (cleaned), or {} when the body has no packet."""
    if not body:
        return {}
    text = str(body).replace("\r\n", "\n")
    out = {}
    m = re.search(r"^#{1,4}\s*packet\s*$(.*?)(?=^#{1,4}\s|\Z)", text, re.I | re.M | re.S)
    if m:
        for line in m.group(1).splitlines():
            lm = re.match(r"^\s*(?:[-*]\s*)?(?:\*\*)?([A-Za-z _]{3,20}?)(?:\*\*)?\s*:\s*(.+)$", line)
            if lm and _key(lm.group(1)) and lm.group(2).strip():
                out.setdefault(_key(lm.group(1)), clean(lm.group(2)))
    if not out:
        sm = re.search(r"^\s*\**packet\**\s*:\s*(.+)$", text, re.I | re.M)
        if sm:
            for part in re.split(r"\s[|;]\s|\s*[|;]\s*(?=[A-Za-z _]{3,20}:)", sm.group(1)):
                pm = re.match(r"\s*([A-Za-z _]{3,20}?)\s*[:=]\s*(.+)$", part)
                if pm and _key(pm.group(1)) and pm.group(2).strip():
                    out.setdefault(_key(pm.group(1)), clean(pm.group(2)))
    return {k: v for k, v in out.items() if v}
