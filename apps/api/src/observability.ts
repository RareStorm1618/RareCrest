/**
 * Wave 4: lightweight in-process observability counters + a Prometheus-ish text
 * exposition endpoint. Not a replacement for a real metrics backend — this exists so
 * a private VPS deployment has *something* to scrape/alert on for the fail-closed
 * events that matter most (RPC auth, PHI decrypt, kill switches, auth failures).
 */

interface Counters {
  rpcUnauthorizedTotal: number;
  phiDecryptTotal: Record<"allowed" | "denied", number>;
  killSwitchEventsTotal: Record<"arm" | "trigger" | "disarm", number>;
  authFailuresTotal: number;
  rbacDenialsTotal: Record<string, number>;
}

function freshCounters(): Counters {
  return {
    rpcUnauthorizedTotal: 0,
    phiDecryptTotal: { allowed: 0, denied: 0 },
    killSwitchEventsTotal: { arm: 0, trigger: 0, disarm: 0 },
    authFailuresTotal: 0,
    rbacDenialsTotal: {},
  };
}

let counters = freshCounters();

export function recordRpcUnauthorized(): void {
  counters.rpcUnauthorizedTotal += 1;
}

export function recordPhiDecrypt(outcome: "allowed" | "denied"): void {
  counters.phiDecryptTotal[outcome] += 1;
}

export function recordKillSwitchEvent(action: "arm" | "trigger" | "disarm"): void {
  counters.killSwitchEventsTotal[action] += 1;
}

export function recordAuthFailure(): void {
  counters.authFailuresTotal += 1;
}

export function recordRbacDenial(action: string): void {
  counters.rbacDenialsTotal[action] = (counters.rbacDenialsTotal[action] ?? 0) + 1;
}

export function getObservabilityCounters(): Counters {
  return {
    rpcUnauthorizedTotal: counters.rpcUnauthorizedTotal,
    phiDecryptTotal: { ...counters.phiDecryptTotal },
    killSwitchEventsTotal: { ...counters.killSwitchEventsTotal },
    authFailuresTotal: counters.authFailuresTotal,
    rbacDenialsTotal: { ...counters.rbacDenialsTotal },
  };
}

/** Test-only: reset all counters to zero between test cases. */
export function resetObservabilityCounters(): void {
  counters = freshCounters();
}

/** Renders a Prometheus-ish text exposition body for GET /metrics. */
export function renderMetricsText(): string {
  const lines: string[] = [];
  lines.push("# HELP rarecrest_rpc_unauthorized_total Internal RPC requests rejected for missing/invalid service token");
  lines.push("# TYPE rarecrest_rpc_unauthorized_total counter");
  lines.push(`rarecrest_rpc_unauthorized_total ${counters.rpcUnauthorizedTotal}`);

  lines.push("# HELP rarecrest_phi_decrypt_total PHI envelope decrypt attempts by outcome");
  lines.push("# TYPE rarecrest_phi_decrypt_total counter");
  for (const [outcome, value] of Object.entries(counters.phiDecryptTotal)) {
    lines.push(`rarecrest_phi_decrypt_total{outcome="${outcome}"} ${value}`);
  }

  lines.push("# HELP rarecrest_kill_switch_events_total Kill switch lifecycle events by action");
  lines.push("# TYPE rarecrest_kill_switch_events_total counter");
  for (const [action, value] of Object.entries(counters.killSwitchEventsTotal)) {
    lines.push(`rarecrest_kill_switch_events_total{action="${action}"} ${value}`);
  }

  lines.push("# HELP rarecrest_auth_failures_total Requests rejected during auth resolution");
  lines.push("# TYPE rarecrest_auth_failures_total counter");
  lines.push(`rarecrest_auth_failures_total ${counters.authFailuresTotal}`);

  lines.push("# HELP rarecrest_rbac_denials_total RBAC action gate denials by action");
  lines.push("# TYPE rarecrest_rbac_denials_total counter");
  for (const [action, value] of Object.entries(counters.rbacDenialsTotal)) {
    lines.push(`rarecrest_rbac_denials_total{action="${action}"} ${value}`);
  }

  return `${lines.join("\n")}\n`;
}
