// Per-seat GitHub App mint plan. The key stays with the caller.
// A returned permission that was not requested, or that is broader than requested, is refused.

export function mintPlan(seat) {
  if (!seat || !seat.id || !seat.appId || !seat.installationId) return { ok: false, error: 'seat needs id, appId, installationId' };
  const permissions = seat.permissions || {};
  const names = Object.keys(permissions);
  if (!names.length) return { ok: false, error: 'seat needs permissions' };
  for (const [name, level] of Object.entries(permissions)) {
    if (level !== 'read' && level !== 'write') return { ok: false, error: 'bad permission level' };
    if (!/^[a-z_]+$/.test(name)) return { ok: false, error: 'bad permission name' };
  }
  return {
    ok: true,
    url: `https://api.github.com/app/installations/${seat.installationId}/access_tokens`,
    iss: String(seat.appId),
    body: {
      permissions,
      repositories: seat.repositories || [],
    },
  };
}

export function readOnlyPlan(seat) {
  const plan = mintPlan(seat);
  if (!plan.ok) return plan;
  for (const level of Object.values(plan.body.permissions)) {
    if (level !== 'read') return { ok: false, error: 'read-only app refuses a non-read permission' };
  }
  return plan;
}

export function permissionDrift(returned, requested) {
  const bad = [];
  for (const [name, level] of Object.entries(returned || {})) {
    if (requested[name] !== level) bad.push([name, level]);
  }
  if (!Object.keys(returned || {}).length) bad.push(['permissions', 'empty']);
  return bad;
}
