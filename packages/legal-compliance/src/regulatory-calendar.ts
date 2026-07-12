/** WO-61: Regulatory calendar domain logic */

export type RegulatoryRegime =
  | "HIPAA"
  | "HITECH"
  | "GDPR"
  | "SEC"
  | "AML"
  | "IRS-501c3"
  | "Form-990"
  | "COPPA"
  | "NIST-AI-RMF";

export interface RegulatoryCalendarEvent {
  entityId: string;
  regime: string;
  eventType: string;
  dueAt: string;
  cadence: "monthly" | "quarterly" | "annual";
  priority: "normal" | "high" | "critical";
}

const REGIME_TEMPLATES: Record<string, Array<{ eventType: string; cadence: RegulatoryCalendarEvent["cadence"]; monthOffset: number; day: number; priority: RegulatoryCalendarEvent["priority"] }>> = {
  HIPAA: [
    { eventType: "risk_assessment_review", cadence: "annual", monthOffset: 11, day: 30, priority: "critical" },
    { eventType: "incident_response_drill", cadence: "quarterly", monthOffset: 2, day: 15, priority: "high" },
  ],
  HITECH: [
    { eventType: "breach_notification_readiness", cadence: "quarterly", monthOffset: 2, day: 10, priority: "high" },
  ],
  GDPR: [
    { eventType: "data_protection_impact_review", cadence: "annual", monthOffset: 11, day: 15, priority: "high" },
    { eventType: "records_of_processing_audit", cadence: "quarterly", monthOffset: 2, day: 25, priority: "normal" },
  ],
  SEC: [
    { eventType: "compliance_attestation", cadence: "annual", monthOffset: 11, day: 20, priority: "critical" },
    { eventType: "books_and_records_review", cadence: "quarterly", monthOffset: 2, day: 20, priority: "high" },
  ],
  AML: [
    { eventType: "suspicious_activity_controls_test", cadence: "quarterly", monthOffset: 2, day: 12, priority: "high" },
  ],
  "IRS-501c3": [
    { eventType: "governance_disclosure_review", cadence: "annual", monthOffset: 11, day: 20, priority: "normal" },
  ],
  "Form-990": [
    { eventType: "form_990_filing_window", cadence: "annual", monthOffset: 4, day: 15, priority: "critical" },
  ],
  COPPA: [
    { eventType: "child_data_safeguard_audit", cadence: "annual", monthOffset: 11, day: 10, priority: "critical" },
  ],
  "NIST-AI-RMF": [
    { eventType: "model_governance_review", cadence: "quarterly", monthOffset: 2, day: 8, priority: "high" },
  ],
};

function buildDueDate(periodStart: Date, monthOffset: number, day: number): string {
  const due = new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + monthOffset, day));
  return due.toISOString();
}

export function buildRegulatoryCalendar(
  entityId: string,
  regimes: string[],
  periodStartIso: string,
): RegulatoryCalendarEvent[] {
  const periodStart = new Date(periodStartIso);
  const dedupedRegimes = [...new Set(regimes)];
  const events: RegulatoryCalendarEvent[] = [];

  for (const regime of dedupedRegimes) {
    const templates = REGIME_TEMPLATES[regime] ?? [
      { eventType: "compliance_review", cadence: "annual", monthOffset: 11, day: 30, priority: "normal" as const },
    ];

    for (const template of templates) {
      events.push({
        entityId,
        regime,
        eventType: template.eventType,
        dueAt: buildDueDate(periodStart, template.monthOffset, template.day),
        cadence: template.cadence,
        priority: template.priority,
      });
    }
  }

  return events.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}
