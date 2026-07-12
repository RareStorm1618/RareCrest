/** WO-57: LegalMatterService */

export const LEGAL_MATTER_STATUSES = ["open", "awaiting_counsel", "resolved", "closed"] as const;
export type LegalMatterStatus = (typeof LEGAL_MATTER_STATUSES)[number];

export const STANDARD_DISCLAIMER =
  "Not legal advice — escalate to qualified counsel for binding guidance.";

export interface LegalMatter {
  id: string;
  entityId: string;
  title: string;
  status: LegalMatterStatus;
  disclaimer: string;
  createdAt: string;
}

export function createLegalMatterPayload(title: string, entityId: string, status: LegalMatterStatus = "open") {
  return {
    title,
    entityId,
    status,
    disclaimer: STANDARD_DISCLAIMER,
    requiresCounselReview: status === "awaiting_counsel",
  };
}

export function validateLegalMatterStatus(status: string): status is LegalMatterStatus {
  return (LEGAL_MATTER_STATUSES as readonly string[]).includes(status);
}
