import { describe, expect, it } from "vitest";
import { evaluateDataPlaneInversion } from "./data-plane-inversion.js";

describe("Data plane inversion (WO-55)", () => {
  it("returns blockers when lineage or reversibility is missing", () => {
    const result = evaluateDataPlaneInversion([
      { streamId: "events", piiClass: "limited", lineageComplete: true, reversible: true },
      { streamId: "claims", piiClass: "high", lineageComplete: false, reversible: false },
    ]);
    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("all_streams_have_lineage");
    expect(result.blockers).toContain("all_streams_reversible");
  });
});
