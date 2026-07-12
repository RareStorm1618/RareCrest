import { describe, expect, it } from "vitest";
import { buildFromZeroWorkshop } from "./from-zero.js";

describe("From-zero workshop plan (WO-56)", () => {
  it("builds week-by-week track schedule", () => {
    const plan = buildFromZeroWorkshop({
      weeks: 4,
      tracks: ["strategy", "platform"],
      teamSize: 6,
    });
    expect(plan).toHaveLength(4);
    expect(plan[0].objective).toContain("Define baseline");
    expect(plan[3].objective).toContain("Operationalize");
  });
});
