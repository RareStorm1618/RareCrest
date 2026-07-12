import { describe, expect, it } from "vitest";
import { AutoCaptureService } from "./auto-capture.js";

describe("AutoCaptureService (WO-67)", () => {
  it("accepts high-confidence high-severity signals", () => {
    const service = new AutoCaptureService({ now: () => 1000 });
    const result = service.evaluate({
      entityId: "e1",
      vertical: "rareangels",
      source: "runtime-monitor",
      signalType: "policy_violation",
      confidence: 0.85,
      payload: {},
    });
    expect(result.accepted).toBe(true);
    expect(result.captureKind).toBe("critical_alert");
  });

  it("suppresses duplicates within dedupe window", () => {
    let now = 1000;
    const service = new AutoCaptureService({ now: () => now, dedupeWindowMs: 60000 });
    const input = {
      entityId: "e1",
      vertical: "rareangels",
      source: "runtime-monitor",
      signalType: "override_spike" as const,
      confidence: 0.9,
      payload: {},
    };
    expect(service.evaluate(input).accepted).toBe(true);
    now = 1200;
    expect(service.evaluate(input)).toMatchObject({ accepted: false, reason: "duplicate_window" });
  });
});
