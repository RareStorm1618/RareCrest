import { useState } from "react";
import { ResultCard, type ResultCardMetric } from "./ResultCard.js";

interface DecisionTraceTemplateEditorProps {
  entityId: string;
  apiBase: string;
  headers: Record<string, string>;
}

interface DecisionTraceTemplateResult {
  decisionType?: string;
  sections?: unknown[];
  requiredEvidence?: string[];
}

export function DecisionTraceTemplateEditor({
  entityId,
  apiBase,
  headers,
}: DecisionTraceTemplateEditorProps) {
  const [decisionType, setDecisionType] = useState("");
  const [requiredEvidence, setRequiredEvidence] = useState("");
  const [result, setResult] = useState<DecisionTraceTemplateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const res = await fetch(`${apiBase}/api/v1/design-studio/${entityId}/decision-trace-template`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        decisionType,
        requiredEvidence: requiredEvidence
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean),
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError((body as { message?: string }).message ?? "Decision trace template failed");
      return;
    }
    setResult(body as DecisionTraceTemplateResult);
  };

  const metrics: ResultCardMetric[] | undefined = result
    ? [
        { label: "Decision type", value: result.decisionType ?? "—" },
        { label: "Sections", value: result.sections?.length ?? 0 },
        { label: "Required evidence", value: result.requiredEvidence?.length ?? 0 },
      ]
    : undefined;

  return (
    <section className="decision-trace-template-editor" data-testid="decision-trace-template-editor">
      <h3>Decision Trace Template Editor</h3>
      <label>
        Decision type
        <input value={decisionType} onChange={(event) => setDecisionType(event.target.value)} />
      </label>
      <label>
        Required evidence (one per line)
        <textarea
          value={requiredEvidence}
          onChange={(event) => setRequiredEvidence(event.target.value)}
        />
      </label>
      <button type="button" onClick={submit}>
        Build template
      </button>
      {result && <ResultCard title="Decision Trace Template" metrics={metrics} raw={result} />}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
