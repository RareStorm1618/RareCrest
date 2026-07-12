import { useMemo, useState } from "react";
import type { FormEvent } from "react";

export type SchemaFieldType = "text" | "number" | "textarea" | "select";

export interface SchemaField {
  name: string;
  label: string;
  type: SchemaFieldType;
  required?: boolean;
  options?: Array<{ label: string; value: string }>;
}

export interface SchemaFormRendererProps {
  fields: SchemaField[];
  initialValues?: Record<string, string>;
  submitLabel?: string;
  onSubmit: (values: Record<string, string>) => void;
}

export function buildInitialFormValues(
  fields: SchemaField[],
  initialValues?: Record<string, string>,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of fields) {
    values[field.name] = initialValues?.[field.name] ?? "";
  }
  return values;
}

export function validateSchemaFormValues(
  fields: SchemaField[],
  values: Record<string, string>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    if (field.required && !values[field.name]?.trim()) {
      errors[field.name] = `${field.label} is required`;
    }
  }
  return errors;
}

export function SchemaFormRenderer({
  fields,
  initialValues,
  submitLabel = "Save",
  onSubmit,
}: SchemaFormRendererProps) {
  const [values, setValues] = useState<Record<string, string>>(
    buildInitialFormValues(fields, initialValues),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fieldIndex = useMemo(() => new Set(fields.map((f) => f.name)), [fields]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validateSchemaFormValues(fields, values);
    setErrors(validation);
    if (Object.keys(validation).length === 0) {
      onSubmit(values);
    }
  };

  return (
    <form onSubmit={handleSubmit} data-testid="schema-form-renderer">
      {fields.map((field) => (
        <label key={field.name}>
          {field.label}
          {field.type === "textarea" ? (
            <textarea
              value={values[field.name] ?? ""}
              onChange={(event) =>
                setValues((current) => ({ ...current, [field.name]: event.target.value }))
              }
            />
          ) : field.type === "select" ? (
            <select
              value={values[field.name] ?? ""}
              onChange={(event) =>
                setValues((current) => ({ ...current, [field.name]: event.target.value }))
              }
            >
              <option value="">Select…</option>
              {(field.options ?? []).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={field.type}
              value={values[field.name] ?? ""}
              onChange={(event) =>
                setValues((current) => ({ ...current, [field.name]: event.target.value }))
              }
            />
          )}
          {errors[field.name] && (
            <small role="alert" data-field={field.name}>
              {errors[field.name]}
            </small>
          )}
        </label>
      ))}
      <button type="submit" disabled={fields.some((f) => !fieldIndex.has(f.name))}>
        {submitLabel}
      </button>
    </form>
  );
}
