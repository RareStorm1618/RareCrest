import { describe, expect, it } from "vitest";
import { evaluateMvis } from "./mvis.js";

describe("MVIS evaluation (WO-54)", () => {
  it("returns green when weighted score is high", () => {
    const result = evaluateMvis([
      { name: "runtime_stability", weight: 4, score: 8 },
      { name: "pipeline_fidelity", weight: 3, score: 8 },
      { name: "control_coverage", weight: 3, score: 7 },
    ]);
    expect(result.status).toBe("green");
    expect(result.gaps).toHaveLength(0);
  });
});
