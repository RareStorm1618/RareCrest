import { useState } from "react";
import { ResultCard, type ResultCardMetric } from "./ResultCard.js";

interface DriveShapeScorecardsProps {
  entityId: string;
  apiBase: string;
  headers: Record<string, string>;
}

interface DriveShapeResult {
  score?: number;
  profile?: string;
  notes?: string[];
}

export function DriveShapeScorecards({ entityId, apiBase, headers }: DriveShapeScorecardsProps) {
  const [clarity, setClarity] = useState(6);
  const [speed, setSpeed] = useState(6);
  const [resilience, setResilience] = useState(6);
  const [leverage, setLeverage] = useState(6);
  const [result, setResult] = useState<DriveShapeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const score = async () => {
    setError(null);
    const res = await fetch(`${apiBase}/api/v1/design-studio/${entityId}/drive-shape`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ clarity, speed, resilience, leverage }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError((body as { message?: string }).message ?? "Drive-shape scoring failed");
      return;
    }
    setResult(body as DriveShapeResult);
  };

  const metrics: ResultCardMetric[] | undefined = result
    ? [
        { label: "Score", value: result.score ?? "—" },
        { label: "Profile", value: result.profile ?? "—" },
      ]
    : undefined;

  return (
    <section className="drive-shape-scorecards" data-testid="drive-shape-scorecards">
      <h3>Drive Shape Scorecards</h3>
      <label>
        Clarity
        <input type="number" min={1} max={10} value={clarity} onChange={(e) => setClarity(Number(e.target.value))} />
      </label>
      <label>
        Speed
        <input type="number" min={1} max={10} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
      </label>
      <label>
        Resilience
        <input type="number" min={1} max={10} value={resilience} onChange={(e) => setResilience(Number(e.target.value))} />
      </label>
      <label>
        Leverage
        <input type="number" min={1} max={10} value={leverage} onChange={(e) => setLeverage(Number(e.target.value))} />
      </label>
      <button type="button" onClick={score}>
        Score drive shape
      </button>
      {result && (
        <ResultCard
          title="Drive Shape Scorecard"
          summary={result.notes?.length ? result.notes.join(" • ") : undefined}
          metrics={metrics}
          raw={result}
        />
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
