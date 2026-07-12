import { useState } from "react";
import { ResultCard, type ResultCardMetric } from "./ResultCard.js";

interface InversionChecklistViewProps {
  apiBase: string;
  headers: Record<string, string>;
}

interface InversionChecklistResult {
  ready?: boolean;
  checklist?: Array<{ item: string; passed: boolean }>;
  blockers?: string[];
}

export function InversionChecklistView({ apiBase, headers }: InversionChecklistViewProps) {
  const [sourcesJson, setSourcesJson] = useState(
    JSON.stringify(
      [
        { streamId: "events", piiClass: "limited", lineageComplete: true, reversible: true },
        { streamId: "claims", piiClass: "high", lineageComplete: false, reversible: false },
      ],
      null,
      2,
    ),
  );
  const [result, setResult] = useState<InversionChecklistResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const runCheck = async () => {
    setLoading(true);
    setError(null);
    try {
      const sources = JSON.parse(sourcesJson);
      const res = await fetch(`${apiBase}/api/v1/migration/data-plane-inversion`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ sources }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Inversion check failed");
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="inversion-checklist-view" data-testid="inversion-checklist">
      <h3>Data Plane Inversion Checklist</h3>
      <textarea value={sourcesJson} onChange={(e) => setSourcesJson(e.target.value)} rows={10} />
      <button type="button" onClick={runCheck} disabled={loading}>
        {loading ? "Checking..." : "Evaluate inversion readiness"}
      </button>
      {result && (
        <ResultCard
          title="Data Plane Inversion Checklist"
          summary={result.ready ? "Ready for inversion" : "Not ready — blockers remain"}
          metrics={
            [
              { label: "Ready", value: result.ready ? "Yes" : "No" },
              { label: "Checks passed", value: `${result.checklist?.filter((c) => c.passed).length ?? 0}/${result.checklist?.length ?? 0}` },
              { label: "Blockers", value: result.blockers?.length ?? 0 },
            ] satisfies ResultCardMetric[]
          }
          raw={result}
        />
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
