/** WO-53: OverrideTrendTracker + DeprecationGate */

export interface OverrideEvent {
  id: string;
  entityId: string;
  agentId: string;
  reason: string;
  createdAt: string;
}

export const DEPRECATION_OVERRIDE_THRESHOLD = 5;
export const DEPRECATION_WINDOW_DAYS = 30;

export function evaluateDeprecationGate(overrides: OverrideEvent[], windowDays = DEPRECATION_WINDOW_DAYS): {
  deprecationBlocked: boolean;
  overrideCount: number;
  reason: string | null;
} {
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const recent = overrides.filter((o) => new Date(o.createdAt).getTime() >= cutoff);
  const blocked = recent.length >= DEPRECATION_OVERRIDE_THRESHOLD;
  return {
    deprecationBlocked: blocked,
    overrideCount: recent.length,
    reason: blocked ? `${recent.length} overrides in ${windowDays} days exceeds threshold` : null,
  };
}
