import { useCallback, useEffect, useState } from "react";
import type { ReadinessDimension } from "@rarecrest/diagnostics";

interface DiagnosticsWorkspaceProps {
  entityId: string;
  entityName: string;
  apiBase: string;
  headers: Record<string, string>;
  onBack?: () => void;
}

interface WorkspaceState {
  assessment: { id: string; currentStep: string; status: string };
  latestComplete: { completedAt: string; readinessTotal: number } | null;
  retakeDue: boolean;
  runOrder: Array<{ id: string; unlocked: boolean; complete: boolean }>;
  dimensions: ReadinessDimension[];
  readiness: {
    scores: Record<string, number>;
    band: { label: string; recommendation: string; total: number } | null;
    incomplete: boolean;
  };
  deploymentLock: boolean;
  governance: { belowThreshold: string[]; maturity: number } | null;
  migrationHalt: { halted: boolean; haltReasons: string[] } | null;
}

export function DiagnosticsWorkspace({
  entityId,
  entityName,
  apiBase,
  headers,
  onBack,
}: DiagnosticsWorkspaceProps) {
  const [state, setState] = useState<WorkspaceState | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`${apiBase}/api/v1/diagnostics/${entityId}`, { headers });
    if (!res.ok) throw new Error("Failed to load diagnostics");
    const data = (await res.json()) as WorkspaceState;
    setState(data);
    setScores(data.readiness.scores ?? {});
  }, [apiBase, entityId, headers]);

  useEffect(() => {
    load().catch((e) => setError((e as Error).message));
  }, [load]);

  const savePartial = async () => {
    if (!state) return;
    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/diagnostics/${entityId}/responses`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          assessmentId: state.assessment.id,
          patch: { readinessScores: scores },
          currentStep: "readiness_score",
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      setState(await res.json());
    } finally {
      setSaving(false);
    }
  };

  const completeReadiness = async () => {
    if (!state) return;
    for (const dim of state.dimensions) {
      const v = scores[dim.id];
      if (v === undefined || v < 1 || v > 10) {
        setError(`Invalid score for ${dim.name}: enter 1-10`);
        return;
      }
    }
    setError(null);
    const res = await fetch(
      `${apiBase}/api/v1/diagnostics/${entityId}/steps/readiness_score/complete`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          assessmentId: state.assessment.id,
          data: { scores },
        }),
      },
    );
    if (!res.ok) throw new Error("Complete step failed");
    setState(await res.json());
  };

  if (error && !state) return <p role="alert">{error}</p>;
  if (!state) return <p>Loading diagnostics…</p>;

  return (
    <section data-testid="diagnostics-workspace" className="diagnostics-workspace">
      <header>
        {onBack && (
          <button type="button" onClick={onBack}>
            ← Portfolio
          </button>
        )}
        <h2>Diagnostics — {entityName}</h2>
        {state.latestComplete && (
          <p className="prior-assessment">
            Last completed: {new Date(state.latestComplete.completedAt).toLocaleDateString()}
            {state.retakeDue && <span className="retake-due"> — Retake due</span>}
          </p>
        )}
      </header>

      <ol className="run-order">
        {state.runOrder.map((step) => (
          <li
            key={step.id}
            className={[
              step.complete ? "complete" : "",
              !step.unlocked ? "locked" : "",
            ].filter(Boolean).join(" ")}
          >
            {step.id.replace(/_/g, " ")}
            {!step.unlocked && !step.complete && <span> (depends on prior steps)</span>}
          </li>
        ))}
      </ol>

      <div className="readiness-panel">
        <h3>Readiness Score (8 dimensions)</h3>
        {state.readiness.incomplete && <p className="incomplete-hint">Score all dimensions to compute band.</p>}
        {state.dimensions.map((dim) => (
          <div key={dim.id} className="dimension-row">
            <label htmlFor={dim.id}>
              <strong>{dim.name}</strong>
              <small>1: {dim.anchor1}</small>
              <small>10: {dim.anchor10}</small>
            </label>
            <input
              id={dim.id}
              type="number"
              min={1}
              max={10}
              value={scores[dim.id] ?? ""}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (e.target.value === "" || (v >= 1 && v <= 10)) {
                  setScores((s) => ({ ...s, [dim.id]: v }));
                }
              }}
            />
          </div>
        ))}
        <div className="actions">
          <button type="button" onClick={savePartial} disabled={saving}>
            Save progress
          </button>
          <button type="button" onClick={completeReadiness}>
            Complete readiness step
          </button>
        </div>
        {state.readiness.band && (
          <div className="band-result" data-testid="readiness-band">
            <strong>{state.readiness.band.label}</strong> ({state.readiness.band.total}/80)
            <p>{state.readiness.band.recommendation}</p>
          </div>
        )}
      </div>

      {state.deploymentLock && state.governance && (
        <div className="deployment-lock" role="alert">
          Deployment locked — pillars below threshold: {state.governance.belowThreshold.join(", ")}
        </div>
      )}

      {state.migrationHalt?.halted && (
        <div className="migration-halt" role="alert">
          Migration halted — red gates: {state.migrationHalt.haltReasons.join(", ")}
        </div>
      )}

      {error && <p role="alert" className="error">{error}</p>}
    </section>
  );
}
