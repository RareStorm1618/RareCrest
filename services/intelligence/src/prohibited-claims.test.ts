import { describe, expect, it } from "vitest";
import { scanProhibitedClaims } from "./prohibited-claims.js";

describe("Prohibited claims scan (WO-60)", () => {
  it("blocks absolute claims and keeps compliant copy", () => {
    const result = scanProhibitedClaims({
      claims: [
        "This workflow is guaranteed to pass.",
        "Outcomes improve with monitored controls.",
        "Risk-free migration in 7 days.",
      ],
    });
    expect(result.blocked).toHaveLength(2);
    expect(result.allowed).toEqual(["Outcomes improve with monitored controls."]);
  });
});
