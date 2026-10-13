# Sources

One normalized item becomes one card, whether the server pulled it or a client posted it.

`POST /ingest/source` with `X-Live-Ingest` accepts `{source, events}` of at most 500 events. Unknown fields are refused, so a body cannot sneak in. Fields are `id`, `source`, `t`, `kind` (`opened`, `updated`, `closed`, `reopened`), `key`, and optional `title`, `url`, `state`, `status`, `project`, `actor`.

Jira pull starts only when `JIRA_SITE`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, and `JIRA_PROJECTS` are all set and `JIRA_SOURCE` is not `off`. The child receives those credentials and nothing else: not the ingest secret, not a seat key, not the page password. It writes `jira-events.json`. Descriptions and comments are not requested.

`JIRA_EXCLUDE` lists project keys that are never polled. Other sources use `SOURCE_ALLOWLIST`, JSON `{source: [project, ...]}`.

When two updates share a key, the later `updated` time wins. On a tie, a closed item wins over an open one.

A Jira status that matches `JIRA_HOLD_STATUS` (default `On Hold`) holds the card. Closed stays closed.
