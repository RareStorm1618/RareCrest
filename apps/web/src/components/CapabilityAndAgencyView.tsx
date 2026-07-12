import { useState } from "react";
import { ResultCard, type ResultCardMetric } from "./ResultCard.js";

interface CapabilityAndAgencyViewProps {
  entityId: string;
  apiBase: string;
  headers: Record<string, string>;
}

interface CapabilityAndAgencyResult {
  coverage?: {
    coveragePct?: number;
    covered?: string[];
    gaps?: Array<{ capabilityId: string; reason: string }>;
  };
  agencyMap?: {
    agencyMap?: Array<{ agency: string; riskLevel: string; staffedCapabilities?: number; totalCapabilities?: number }>;
  };
}

export function CapabilityAndAgencyView({ entityId, apiBase, headers }: CapabilityAndAgencyViewProps) {
  const [statusesJson, setStatusesJson] = useState(
    JSON.stringify(
      [
        { capabilityId: "identity-resolution", maturity: 3, staffed: true },
        { capabilityId: "workflow-automation", maturity: 3, staffed: true },
      ],
      null,
      2,
    ),
  );
  const [result, setResult] = useState<CapabilityAndAgencyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const evaluate = async () => {
    setLoading(true);
    setError(null);
    try {
      const statuses = JSON.parse(statusesJson);
      const [coverageRes, agencyRes] = await Promise.all([
        fetch(`${apiBase}/api/v1/capabilities/evaluate`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ entityId, statuses }),
        }),
        fetch(`${apiBase}/api/v1/capabilities/agency-map`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ entityId, statuses }),
        }),
      ]);
      const coverage = await coverageRes.json();
      const agencyMap = await agencyRes.json();
      if (!coverageRes.ok) throw new Error(coverage.message ?? "Coverage evaluation failed");
      if (!agencyRes.ok) throw new Error(agencyMap.message ?? "Agency map evaluation failed");
      setResult({ coverage, agencyMap });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="capability-agency-view" data-testid="capability-agency">
      <h3>Capability Registry and Agency Map</h3>
      <textarea value={statusesJson} onChange={(e) => setStatusesJson(e.target.value)} rows={12} />
      <button type="button" onClick={evaluate} disabled={loading}>
        {loading ? "Evaluating..." : "Run capability checks"}
      </button>
      {result && (
        <ResultCard
          title="Capability Coverage and Agency Map"
          metrics={
            [
              { label: "Coverage", value: `${result.coverage?.coveragePct ?? 0}%` },
              { label: "Covered", value: result.coverage?.covered?.length ?? 0 },
              { label: "Gaps", value: result.coverage?.gaps?.length ?? 0 },
              {
                label: "High-risk agencies",
                value: result.agencyMap?.agencyMap?.filter((a) => a.riskLevel === "high").length ?? 0,
              },
            ] satisfies ResultCardMetric[]
          }
          raw={result}
        />
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
