/** WO-21: Zero-authority dual-track rendering shell */
import type { ReactNode } from "react";

export interface DualTrackProps {
  narrative: string;
  schemaPayload: Record<string, unknown>;
  title?: string;
}

export function DualTrackView({ narrative, schemaPayload, title }: DualTrackProps) {
  return (
    <div className="dual-track" data-testid="dual-track-view">
      {title && <h2>{title}</h2>}
      <section data-track="narrative" aria-label="Human narrative">
        <h3>Human Narrative</h3>
        <p>{narrative}</p>
      </section>
      <section data-track="schema" aria-label="Machine-readable schema">
        <h3>Machine Schema</h3>
        <pre>{JSON.stringify(schemaPayload, null, 2)}</pre>
      </section>
    </div>
  );
}

export interface FieldErrorDisplayProps {
  errors: Array<{ field: string; code: string; message: string }>;
}

export function FieldErrorDisplay({ errors }: FieldErrorDisplayProps) {
  if (errors.length === 0) return null;
  return (
    <ul data-testid="field-errors" role="alert">
      {errors.map((e) => (
        <li key={`${e.field}-${e.code}`}>
          <strong>{e.field}</strong>: {e.message} ({e.code})
        </li>
      ))}
    </ul>
  );
}

export function ZeroAuthorityShell({ children }: { children: ReactNode }) {
  return (
    <div data-authority="none" data-testid="zero-authority-shell">
      <header>
        <h1>RareCrest</h1>
        <p>Director surface — server-owned state only</p>
      </header>
      <main>{children}</main>
    </div>
  );
}
