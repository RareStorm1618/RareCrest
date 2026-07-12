import { useState } from "react";

const REQUEST_KINDS = [
  { value: "substantive", label: "Substantive" },
  { value: "architecture", label: "Architecture" },
  { value: "drive_only", label: "Drive only" },
  { value: "migration", label: "Migration" },
] as const;

interface SkillCompanionViewProps {
  entityId: string;
  apiBase: string;
  headers: Record<string, string>;
}

export function SkillCompanionView({ entityId, apiBase, headers }: SkillCompanionViewProps) {
  const [question, setQuestion] = useState("");
  const [requestKind, setRequestKind] = useState<string>("substantive");
  const [response, setResponse] = useState<Record<string, unknown> | null>(null);
  const [guardBlock, setGuardBlock] = useState<{ message: string; redirectTo?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const ask = async () => {
    if (!question.trim()) return;
    setLoading(true);
    setError(null);
    setGuardBlock(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/skill-companion`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ entityId, question, requestKind }),
      });
      const data = await res.json();
      if (res.status === 403 && data.guard) {
        setGuardBlock({ message: data.message, redirectTo: data.redirectTo });
        return;
      }
      if (!res.ok) throw new Error(data.message ?? "Companion request failed");
      setResponse(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="skill-companion-view" data-testid="skill-companion">
      <h3>Skill Companion</h3>
      <label>
        Request kind
        <select value={requestKind} onChange={(e) => setRequestKind(e.target.value)}>
          {REQUEST_KINDS.map((k) => (
            <option key={k.value} value={k.value}>{k.label}</option>
          ))}
        </select>
      </label>
      <textarea value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask a canon-grounded question…" />
      <button type="button" onClick={ask} disabled={loading}>{loading ? "Thinking…" : "Ask"}</button>
      {guardBlock && (
        <div role="alert" className="guard-block">
          <p>{guardBlock.message}</p>
          {guardBlock.redirectTo && <p>Redirect: {guardBlock.redirectTo}</p>}
        </div>
      )}
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
