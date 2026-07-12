import { useEffect, useMemo, useState } from "react";
import { suggestedPrompts } from "../lib/portfolio-brief.js";

const REQUEST_KINDS = [
  { value: "substantive", label: "Substantive" },
  { value: "architecture", label: "Architecture" },
  { value: "drive_only", label: "Drive only" },
  { value: "migration", label: "Migration" },
] as const;

interface SkillCompanionViewProps {
  entityId: string;
  entityName?: string;
  apiBase: string;
  headers: Record<string, string>;
  band?: string | null;
  governanceStatus?: string | null;
  attentionFlagCount?: number;
  clearForAgentDeployment?: boolean;
}

interface ThreadTurn {
  id: string;
  question: string;
  requestKind: string;
  streamed: string;
  summary?: string;
  recommendations?: string[];
  confidence?: number;
  sources?: string[];
  guardBlock?: { message: string; redirectTo?: string };
  error?: string;
}

export function SkillCompanionView({
  entityId,
  entityName = "this entity",
  apiBase,
  headers,
  band,
  governanceStatus,
  attentionFlagCount,
  clearForAgentDeployment,
}: SkillCompanionViewProps) {
  const [question, setQuestion] = useState("");
  const [requestKind, setRequestKind] = useState<string>("substantive");
  const [loading, setLoading] = useState(false);
  const [liveStream, setLiveStream] = useState("");
  const [thread, setThread] = useState<ThreadTurn[]>([]);

  const prompts = useMemo(
    () =>
      suggestedPrompts({
        entityName,
        band,
        governanceStatus,
        attentionFlagCount,
        clearForAgentDeployment,
      }),
    [entityName, band, governanceStatus, attentionFlagCount, clearForAgentDeployment],
  );

  useEffect(() => {
    setThread([]);
    setLiveStream("");
    setQuestion("");
  }, [entityId]);

  const ask = async (promptOverride?: string) => {
    const nextQuestion = (promptOverride ?? question).trim();
    if (!nextQuestion || loading) return;
    setLoading(true);
    setLiveStream("");
    const turnId = crypto.randomUUID();
    try {
      const res = await fetch(`${apiBase}/api/v1/skill-companion/stream`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ entityId, question: nextQuestion, requestKind }),
      });

      if (!res.ok || !res.body) {
        // Fallback to non-streaming complete endpoint
        const fallback = await fetch(`${apiBase}/api/v1/skill-companion`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ entityId, question: nextQuestion, requestKind }),
        });
        const data = await fallback.json();
        if (fallback.status === 403 && data.guard) {
          setThread((prev) => [
            {
              id: turnId,
              question: nextQuestion,
              requestKind,
              streamed: "",
              guardBlock: { message: data.message, redirectTo: data.redirectTo },
            },
            ...prev,
          ]);
          return;
        }
        if (!fallback.ok) throw new Error(data.message ?? "Companion request failed");
        setThread((prev) => [
          {
            id: turnId,
            question: nextQuestion,
            requestKind,
            streamed: String(data.summary ?? ""),
            summary: String(data.summary ?? ""),
            recommendations: Array.isArray(data.recommendations) ? data.recommendations : [],
            confidence: typeof data.confidence === "number" ? data.confidence : undefined,
            sources: Array.isArray(data.sources) ? data.sources : [],
          },
          ...prev,
        ]);
        setQuestion("");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamed = "";
      let guardBlock: ThreadTurn["guardBlock"];
      let complete: Record<string, unknown> | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const lines = part.split("\n");
          const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
          const dataRaw = lines.find((line) => line.startsWith("data:"))?.slice(5).trim();
          if (!event || !dataRaw) continue;
          const data = JSON.parse(dataRaw) as Record<string, unknown>;
          if (event === "token" && typeof data.text === "string") {
            streamed += data.text;
            setLiveStream(streamed);
          }
          if (event === "guard" && data.allowed === false) {
            guardBlock = {
              message: String(data.reason ?? "Request blocked by framing guard"),
              redirectTo: typeof data.redirectTo === "string" ? data.redirectTo : undefined,
            };
          }
          if (event === "complete") complete = data;
        }
      }

      setThread((prev) => [
        {
          id: turnId,
          question: nextQuestion,
          requestKind,
          streamed,
          summary: String(complete?.summary ?? streamed),
          recommendations: Array.isArray(complete?.recommendations)
            ? (complete?.recommendations as string[])
            : [],
          confidence: typeof complete?.confidence === "number" ? complete.confidence : undefined,
          sources: Array.isArray(complete?.sources) ? (complete?.sources as string[]) : [],
          guardBlock,
        },
        ...prev,
      ]);
      setQuestion("");
      setLiveStream("");
    } catch (e) {
      setThread((prev) => [
        {
          id: turnId,
          question: nextQuestion,
          requestKind,
          streamed: "",
          error: (e as Error).message,
        },
        ...prev,
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="skill-companion-view" data-testid="skill-companion">
      <div className="companion-header">
        <h3>Skill Companion</h3>
        <p>Streaming, framing-guarded, dual-track output. Client never owns the verdict.</p>
      </div>

      <div className="prompt-chips" aria-label="Suggested prompts">
        {prompts.map((prompt) => (
          <button key={prompt} type="button" className="chip" onClick={() => ask(prompt)} disabled={loading}>
            {prompt}
          </button>
        ))}
      </div>

      <label>
        Request kind
        <select value={requestKind} onChange={(e) => setRequestKind(e.target.value)}>
          {REQUEST_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Ask a canon-grounded question…"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void ask();
          }
        }}
      />
      <button type="button" onClick={() => ask()} disabled={loading}>
        {loading ? "Streaming…" : "Ask"}
      </button>

      {loading && liveStream && (
        <div className="stream-live" data-testid="companion-stream">
          <span className="stream-cursor" aria-hidden />
          <p>{liveStream}</p>
        </div>
      )}

      <div className="companion-thread">
        {thread.map((turn) => (
          <article key={turn.id} className="companion-turn">
            <p className="turn-question">
              <strong>{turn.requestKind}</strong> · {turn.question}
            </p>
            {turn.guardBlock && (
              <div role="alert" className="guard-block">
                <p>{turn.guardBlock.message}</p>
                {turn.guardBlock.redirectTo && <p>Redirect: {turn.guardBlock.redirectTo}</p>}
              </div>
            )}
            {turn.error && (
              <p role="alert">{turn.error}</p>
            )}
            {!turn.guardBlock && !turn.error && (
              <div className="dual-track-response">
                <div className="narrative-track">
                  <h4>Narrative</h4>
                  <p>{turn.summary ?? turn.streamed}</p>
                  {typeof turn.confidence === "number" && (
                    <div className="confidence-meter" aria-label={`Confidence ${turn.confidence}`}>
                      <span style={{ width: `${Math.round(turn.confidence * 100)}%` }} />
                    </div>
                  )}
                </div>
                <div className="schema-track">
                  <h4>Structured output</h4>
                  <pre>
                    {JSON.stringify(
                      {
                        recommendations: turn.recommendations ?? [],
                        confidence: turn.confidence,
                        sources: turn.sources ?? [],
                      },
                      null,
                      2,
                    )}
                  </pre>
                </div>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
