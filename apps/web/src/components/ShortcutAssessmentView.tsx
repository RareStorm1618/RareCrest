import { useState } from "react";

interface ShortcutAssessmentViewProps {
  entityId: string;
  apiBase: string;
  headers: Record<string, string>;
}

export function ShortcutAssessmentView({ entityId, apiBase, headers }: ShortcutAssessmentViewProps) {
  const [inventoryJson, setInventoryJson] = useState(
    JSON.stringify(
      [
        {
          systemId: "crm-primary",
          systemType: "crm",
          recordCount: 12000,
          exportable: true,
          dataFreshnessHours: 4,
          dailyChangeRatePct: 6,
        },
      ],
      null,
      2,
    ),
  );
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const assess = async () => {
    setLoading(true);
    setError(null);
    try {
      const inventory = JSON.parse(inventoryJson);
      const res = await fetch(`${apiBase}/api/v1/vendor-shortcut/inventory`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ entityId, inventory }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Shortcut assessment failed");
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="shortcut-assessment-view" data-testid="shortcut-assessment">
      <h3>Vendor Shortcut Assessment</h3>
      <p>Paste inventory JSON to evaluate shortcut readiness and blockers.</p>
      <textarea
        value={inventoryJson}
        onChange={(e) => setInventoryJson(e.target.value)}
        rows={12}
      />
      <button type="button" onClick={assess} disabled={loading}>
        {loading ? "Assessing..." : "Assess inventory"}
      </button>
      {result && <pre>{JSON.stringify(result, null, 2)}</pre>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
