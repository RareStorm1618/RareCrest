import { z } from "zod";
import type { FieldError, ValidationErrorResponse } from "@rarecrest/contracts";

export const verticalSchema = z.enum([
  "rarestorm",
  "rareangels",
  "rareedge",
  "hopecoin",
  "healkids",
]);

export const createEntitySchema = z.object({
  name: z.string().min(1).max(255),
  vertical: verticalSchema,
  tenancyKey: z.string().min(1).max(255),
  mode: z.string().min(1).max(50).default("assessment"),
  band: z.string().min(1).max(50).default("unknown"),
});

export const hardRuleCheckSchema = z.object({
  agentId: z.string().min(1),
  entityId: z.string().uuid(),
  vertical: verticalSchema,
  requestedRights: z.array(
    z.enum(["sensitive_data", "code_execution", "external_comms"]),
  ),
  touchesPhi: z.boolean(),
  touchesFinancial: z.boolean(),
  encryptionLayerPresent: z.boolean(),
  humanInstructionId: z.string().optional(),
});

export function formatZodErrors(error: z.ZodError): ValidationErrorResponse {
  const errors: FieldError[] = error.issues.map((issue) => ({
    field: issue.path.join(".") || "root",
    code: issue.code,
    message: issue.message,
  }));
  return { errors, message: "Validation failed" };
}

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}
