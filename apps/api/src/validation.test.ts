import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createEntitySchema,
  formatZodErrors,
  hardRuleCheckSchema,
  validate,
  verticalSchema,
} from "./validation.js";

describe("validation contract (WO-9)", () => {
  it("accepts supported verticals", () => {
    expect(verticalSchema.parse("rareangels")).toBe("rareangels");
  });

  it("formats zod field errors", () => {
    try {
      createEntitySchema.parse({ name: "", vertical: "nope", tenancyKey: "" });
    } catch (err) {
      if (err instanceof z.ZodError) {
        const formatted = formatZodErrors(err);
        expect(formatted.message).toBe("Validation failed");
        expect(formatted.errors.length).toBeGreaterThan(0);
        expect(formatted.errors[0].field).toBeTruthy();
      }
    }
  });

  it("validates hard rule check payloads", () => {
    const parsed = hardRuleCheckSchema.parse({
      agentId: "agent-1",
      entityId: "00000000-0000-4000-8000-000000000001",
      vertical: "rareangels",
      requestedRights: ["sensitive_data"],
      touchesPhi: true,
      touchesFinancial: false,
      encryptionLayerPresent: false,
    });
    expect(parsed.touchesPhi).toBe(true);
  });

  it("throws from validate helper on invalid data", () => {
    expect(() => validate(createEntitySchema, { name: "", vertical: "rareangels", tenancyKey: "t" })).toThrow();
  });
});
