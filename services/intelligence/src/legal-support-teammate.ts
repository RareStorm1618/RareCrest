export interface LegalSupportRequest {
  issue: string;
  urgency: "low" | "medium" | "high" | "critical";
  jurisdiction?: string;
  containsRegulatedData: boolean;
}

export interface LegalSupportResponse {
  summary: string;
  actions: string[];
  disclaimer: string;
  escalateToCounsel: boolean;
  recommendedSlaHours: number;
}

export function draftLegalSupportResponse(input: LegalSupportRequest): LegalSupportResponse {
  const actions = [
    "Capture decision trace and supporting evidence",
    "Map issue to active legal matter or create one",
  ];
  if (input.containsRegulatedData) {
    actions.push("Verify encryption before any data transfer");
  }
  if (input.jurisdiction) {
    actions.push(`Check jurisdiction-specific obligations for ${input.jurisdiction}`);
  }
  const escalateToCounsel = input.urgency === "high" || input.urgency === "critical" || /litigation|subpoena|breach/i.test(input.issue);
  const recommendedSlaHours = input.urgency === "critical" ? 2 : input.urgency === "high" ? 8 : 24;
  return {
    summary: `Legal support triage for "${input.issue}"`,
    actions,
    disclaimer: "Not legal advice. Use licensed counsel for binding legal decisions.",
    escalateToCounsel,
    recommendedSlaHours,
  };
}
