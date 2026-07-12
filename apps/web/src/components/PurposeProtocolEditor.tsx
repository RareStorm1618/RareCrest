import { useState } from "react";
import { ResultCard, type ResultCardMetric } from "./ResultCard.js";

interface PurposeProtocolEditorProps {
  entityId: string;
  apiBase: string;
  headers: Record<string, string>;
}

interface PurposeProtocolResult {
  mission?: string;
  nonNegotiables?: string[];
  successSignals?: string[];
  checks?: { missionPresent?: boolean; hasNonNegotiables?: boolean; hasSuccessSignals?: boolean };
}

export function PurposeProtocolEditor({ entityId, apiBase, headers }: PurposeProtocolEditorProps) {
  const [mission, setMission] = useState("");
  const [nonNegotiables, setNonNegotiables] = useState("");
  const [successSignals, setSuccessSignals] = useState("");
  const [result, setResult] = useState<PurposeProtocolResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const res = await fetch(`${apiBase}/api/v1/design-studio/${entityId}/purpose-protocol`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        mission,
        nonNegotiables: nonNegotiables.split("\n").map((value) => value.trim()).filter(Boolean),
        successSignals: successSignals.split("\n").map((value) => value.trim()).filter(Boolean),
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError((body as { message?: string }).message ?? "Purpose protocol request failed");
      return;
    }
    setResult(body as PurposeProtocolResult);
  };

  const metrics: ResultCardMetric[] | undefined = result
    ? [
        { label: "Mission set", value: result.checks?.missionPresent ? "Yes" : "No" },
        { label: "Non-negotiables", value: result.nonNegotiables?.length ?? 0 },
        { label: "Success signals", value: result.successSignals?.length ?? 0 },
      ]
    : undefined;

  return (
    <section className="purpose-protocol-editor" data-testid="purpose-protocol-editor">
      <h3>Purpose Protocol</h3>
      <label>
        Mission
        <input value={mission} onChange={(event) => setMission(event.target.value)} />
      </label>
      <label>
        Non-negotiables (one per line)
        <textarea value={nonNegotiables} onChange={(event) => setNonNegotiables(event.target.value)} />
      </label>
      <label>
        Success signals (one per line)
        <textarea value={successSignals} onChange={(event) => setSuccessSignals(event.target.value)} />
      </label>
      <button type="button" onClick={submit}>
        Build purpose protocol
      </button>
      {result && (
        <ResultCard
          title="Purpose Protocol"
          summary={result.mission ? `Mission: ${result.mission}` : undefined}
          metrics={metrics}
          raw={result}
        />
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
