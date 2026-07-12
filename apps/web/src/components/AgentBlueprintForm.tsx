import { useState } from "react";

interface AgentBlueprintFormProps {
  entityId: string;
  apiBase: string;
  headers: Record<string, string>;
}

const LAYERS = ["signals", "models", "workflows", "governance"] as const;

export function AgentBlueprintForm({ entityId, apiBase, headers }: AgentBlueprintFormProps) {
  const [selectedLayers, setSelectedLayers] = useState<string[]>(["signals", "models"]);
  const [humanReviewRequired, setHumanReviewRequired] = useState(true);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const res = await fetch(`${apiBase}/api/v1/agents/blueprint`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ entityId, selectedLayers, humanReviewRequired }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError((body as { message?: string }).message ?? "Blueprint request failed");
      return;
    }
    setResult(body);
  };

  return (
    <section className="agent-blueprint-form" data-testid="agent-blueprint-form">
      <h3>Agent Blueprint</h3>
      <div>
        {LAYERS.map((layer) => (
          <label key={layer}>
            <input
              type="checkbox"
              checked={selectedLayers.includes(layer)}
              onChange={() =>
                setSelectedLayers((current) =>
                  current.includes(layer)
                    ? current.filter((value) => value !== layer)
                    : [...current, layer],
                )
              }
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
        Build blueprint
      </button>
      {result && <pre>{JSON.stringify(result, null, 2)}</pre>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
