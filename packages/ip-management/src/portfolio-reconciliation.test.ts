import { describe, expect, it } from "vitest";
import { reconcilePortfolio } from "./portfolio-reconciliation.js";

describe("portfolio-reconciliation (WO-63)", () => {
  it("produces mismatches and missing asset ids", () => {
    const report = reconcilePortfolio(
      [
        { id: "ip-1", expectedStatus: "active" },
        { id: "ip-2", expectedStatus: "active" },
      ],
      [
        { id: "ip-1", title: "Asset 1", status: "pending_verification" },
        { id: "ip-3", title: "Asset 3", status: "active" },
      ],
    );
    expect(report.missingInRegistry).toEqual(["ip-2"]);
    expect(report.orphanedInRegistry).toEqual(["ip-3"]);
    expect(report.statusMismatches).toHaveLength(1);
    expect(report.healthy).toBe(false);
  });
});
