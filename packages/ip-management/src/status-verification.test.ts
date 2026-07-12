import { describe, expect, it } from "vitest";
import { verifyIpStatus } from "./status-verification.js";

describe("status-verification (WO-62)", () => {
  it("flags dispute ahead of all other states", () => {
    expect(
      verifyIpStatus({
        hasCurrentRegistration: true,
        renewalDueAt: null,
        hasOpenDispute: true,
        evidenceCount: 4,
      }),
    ).toBe("disputed");
  });

  it("requires evidence depth before active status", () => {
    expect(
      verifyIpStatus({
        hasCurrentRegistration: true,
        renewalDueAt: null,
        hasOpenDispute: false,
        evidenceCount: 1,
      }),
    ).toBe("pending_verification");
  });
});
