import { useState } from "react";

interface SkillCompanionViewProps {
  entityId: string;
  apiBase: string;
  headers: Record<string, string>;
}

export function SkillCompanionView({ entityId, apiBase, headers }: SkillCompanionViewProps) {
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const ask = async () => {
    if (!question.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/skill-companion`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ entityId, question, requestKind: "substantive" }),
      });
      if (!res.ok) throw new Error("Companion request failed");
      setResponse(await res.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="skill-companion-view" data-testid="skill-companion">
      <h3>Skill Companion</h3>
      <textarea value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask a canon-grounded question…" />
      <button type="button" onClick={ask} disabled={loading}>{loading ? "Thinking…" : "Ask"}</button>
      {response && (
        <div className="dual-track-response">
          <div className="narrative-track">
            <h4>Narrative</h4>
            <p>{String(response.summary ?? "")}</p>
          </div>
          <div className="schema-track">
            <h4>Structured output</h4>
            <pre>{JSON.stringify({ recommendations: response.recommendations, confidence: response.confidence }, null, 2)}</pre>
          </div>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
