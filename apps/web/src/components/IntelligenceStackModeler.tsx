import { useState } from "react";
import { ResultCard, type ResultCardMetric } from "./ResultCard.js";

interface IntelligenceStackModelerProps {
  entityId: string;
  apiBase: string;
  headers: Record<string, string>;
}

const LAYERS = ["signals", "models", "workflows", "governance"] as const;

interface IntelligenceStackResult {
  selectedLayers?: string[];
  missingLayers?: string[];
  deployable?: boolean;
}

export function IntelligenceStackModeler({
  entityId,
  apiBase,
  headers,
}: IntelligenceStackModelerProps) {
  const [selectedLayers, setSelectedLayers] = useState<string[]>(["signals", "models"]);
  const [humanReviewRequired, setHumanReviewRequired] = useState(true);
  const [result, setResult] = useState<IntelligenceStackResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleLayer = (layer: string) => {
    setSelectedLayers((current) =>
      current.includes(layer) ? current.filter((value) => value !== layer) : [...current, layer],
    );
  };

  const submit = async () => {
    setError(null);
    const res = await fetch(`${apiBase}/api/v1/design-studio/${entityId}/intelligence-stack`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ selectedLayers, humanReviewRequired }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError((body as { message?: string }).message ?? "Intelligence stack request failed");
      return;
    }
    setResult(body as IntelligenceStackResult);
  };

  const metrics: ResultCardMetric[] | undefined = result
    ? [
        { label: "Deployable", value: result.deployable ? "Yes" : "No" },
        { label: "Selected layers", value: result.selectedLayers?.join(", ") || "None" },
        { label: "Missing layers", value: result.missingLayers?.join(", ") || "None" },
      ]
    : undefined;

  return (
    <section className="intelligence-stack-modeler" data-testid="intelligence-stack-modeler">
      <h3>Intelligence Stack Modeler</h3>
      <div>
        {LAYERS.map((layer) => (
          <label key={layer}>
            <input
              type="checkbox"
              checked={selectedLayers.includes(layer)}
              onChange={() => toggleLayer(layer)}
            />
            {layer}
          </label>
        ))}
      </div>
      <label>
        Human review required
        <input
          type="checkbox"
          checked={humanReviewRequired}
          onChange={(event) => setHumanReviewRequired(event.target.checked)}
        />
      </label>
      <button type="button" onClick={submit}>
        Model stack
      </button>
      {result && <ResultCard title="Intelligence Stack Plan" metrics={metrics} raw={result} />}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
