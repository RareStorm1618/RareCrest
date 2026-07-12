import { describe, expect, it } from "vitest";
import { parseHash, routeToHash } from "./routing.js";

describe("web routing", () => {
  it("defaults to portfolio", () => {
    expect(parseHash("")).toEqual({ name: "portfolio" });
    expect(parseHash("#/")).toEqual({ name: "portfolio" });
  });

  it("parses entity sections", () => {
    expect(parseHash("#/entities/abc/diagnostics")).toEqual({
      name: "diagnostics",
      entityId: "abc",
    });
    expect(parseHash("#/entities/abc/design")).toEqual({ name: "design", entityId: "abc" });
    expect(parseHash("#/entities/abc/migration")).toEqual({ name: "migration", entityId: "abc" });
    expect(parseHash("#/entities/abc/companion")).toEqual({ name: "companion", entityId: "abc" });
  });

  it("round-trips hashes", () => {
    expect(routeToHash({ name: "portfolio" })).toBe("#/");
    expect(routeToHash({ name: "design", entityId: "e1" })).toBe("#/entities/e1/design");
  });
});
