import { describe, it, expect } from "vitest";
import { isDirectorScope } from "./portfolio-routes.js";

describe("isDirectorScope", () => {
  const auth = { userId: "director-1", vertical: "rarestorm" as const };

  it("returns true for director-1 user id", () => {
    expect(isDirectorScope(auth, { headers: {} })).toBe(true);
  });

  it("returns true when x-user-role is director", () => {
    expect(
      isDirectorScope(
        { userId: "other", vertical: "rareangels" },
        { headers: { "x-user-role": "director" } },
      ),
    ).toBe(true);
  });

  it("returns false for non-director without role header", () => {
    expect(
      isDirectorScope(
        { userId: "analyst-1", vertical: "rareangels" },
        { headers: {} },
      ),
    ).toBe(false);
  });
});
