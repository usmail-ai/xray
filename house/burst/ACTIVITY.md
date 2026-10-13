# Activity

`validActivity` checks one JSON object before it is appended. Required fields are `t_ct`, `kind`, and `action`. `seat` is allowed and optional. Optional fields are `to`, `agent`, and `tag` (`tag` at most 80 characters). On `POST /activity`, a present `seat` must match the installation token case-insensitively or the response is 403 `seat mismatch`. The stored `seat` is the token's seat. There is no static key. The schema is [activity.schema.json](activity.schema.json). Prompt lines and cloud-agent lines have their own schemas. The checker refuses unknown fields and values that carry free text.

`acceptLine` appends a passing object with `by` and `seq`.

`verifyInstallationToken` checks a seat's GitHub App installation token before that line is stored. The shape is `^ghs_[A-Za-z0-9._-]{20,1024}$`. The cache key is sha256 of the token. There is no static activity key.
