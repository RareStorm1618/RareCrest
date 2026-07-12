import { describe, expect, it } from "vitest";
import {
  buildInitialFormValues,
  validateSchemaFormValues,
  type SchemaField,
} from "./schema-form-renderer.js";

const schema: SchemaField[] = [
  { name: "title", label: "Title", type: "text", required: true },
  { name: "notes", label: "Notes", type: "textarea" },
  {
    name: "priority",
    label: "Priority",
    type: "select",
    options: [
      { label: "High", value: "high" },
      { label: "Medium", value: "medium" },
    ],
  },
];

describe("schema-form-renderer helpers (WO-30)", () => {
  it("builds stable initial values from schema", () => {
    expect(buildInitialFormValues(schema, { priority: "high" })).toEqual({
      title: "",
      notes: "",
      priority: "high",
    });
  });

  it("validates required fields with label-aware errors", () => {
    const errors = validateSchemaFormValues(schema, {
      title: " ",
      notes: "",
      priority: "medium",
    });
    expect(errors).toEqual({ title: "Title is required" });
  });

  it("passes validation when required fields are populated", () => {
    const errors = validateSchemaFormValues(schema, {
      title: "Policy design",
      notes: "Track review notes",
      priority: "high",
    });
    expect(errors).toEqual({});
  });
});
