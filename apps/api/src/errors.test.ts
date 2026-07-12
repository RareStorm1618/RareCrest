import { describe, expect, it } from "vitest";
import { mapRouteError } from "./errors.js";
import { EntityAccessError } from "./tenancy.js";
import { StepLockedError } from "./services/diagnostics.js";

describe("mapRouteError", () => {
  it("maps known route errors", () => {
    expect(mapRouteError(new EntityAccessError("missing", 404))?.status).toBe(404);
    expect(mapRouteError(new StepLockedError("dabbling_test"))?.body.code).toBe("STEP_LOCKED");
    expect(mapRouteError(new Error("other"))).toBeNull();
  });
});
