import { describe, expect, it } from "vitest";
import { buildRegulatoryCalendar } from "./regulatory-calendar.js";

describe("RegulatoryCalendarService (WO-61)", () => {
  it("builds deterministic deadlines by regime", () => {
    const events = buildRegulatoryCalendar(
      "entity-1",
      ["HIPAA", "Form-990"],
      "2026-01-01T00:00:00.000Z",
    );
    expect(events).toHaveLength(3);
    expect(events.some((e) => e.eventType === "form_990_filing_window")).toBe(true);
    expect(events.some((e) => e.priority === "critical")).toBe(true);
  });

  it("adds safe default schedule for unknown regimes", () => {
    const events = buildRegulatoryCalendar("entity-1", ["Custom-Regime"], "2026-01-01T00:00:00.000Z");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      regime: "Custom-Regime",
      eventType: "compliance_review",
      cadence: "annual",
    });
  });
});
