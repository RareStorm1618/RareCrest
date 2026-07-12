/** WO-62/63: IP status verification logic */

export type IpLifecycleStatus = "active" | "pending_verification" | "disputed" | "expired";

export interface StatusVerificationInput {
  hasCurrentRegistration: boolean;
  renewalDueAt?: string | null;
  hasOpenDispute: boolean;
  evidenceCount: number;
}

export function verifyIpStatus(input: StatusVerificationInput): IpLifecycleStatus {
  if (input.hasOpenDispute) return "disputed";
  if (input.renewalDueAt && new Date(input.renewalDueAt).getTime() < Date.now()) return "expired";
  if (!input.hasCurrentRegistration || input.evidenceCount < 2) return "pending_verification";
  return "active";
}
