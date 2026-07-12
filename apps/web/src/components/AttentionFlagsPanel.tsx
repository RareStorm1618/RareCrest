import { useCallback, useEffect, useState } from "react";
import type { AttentionItem } from "@rarecrest/portfolio";

interface EntityAttentionState {
  entityId: string;
  items: AttentionItem[];
  clearForAgentDeployment: boolean;
  openDecisions: Array<{ id: string; title: string }>;
  conflicts: Array<{ id: string; summary: string }>;
  unverifiedClaims: Array<{ id: string; claimType: string; claimText: string }>;
  relationships: Array<{ relationshipType: string; constraintNote?: string | null }>;
}

interface AttentionFlagsPanelProps {
  entityId: string;
  apiBase: string;
  headers: Record<string, string>;
}

export function AttentionFlagsPanel({ entityId, apiBase, headers }: AttentionFlagsPanelProps) {
  const [state, setState] = useState<EntityAttentionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [selectedDecision, setSelectedDecision] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`${apiBase}/api/v1/entities/${entityId}/attention-flags`, { headers });
    if (!res.ok) throw new Error("Failed to load attention flags");
    setState(await res.json());
  }, [apiBase, entityId, headers]);

  useEffect(() => {
    load().catch((e) => setError((e as Error).message));
  }, [load]);

  const resolveDecision = async () => {
    if (!selectedDecision || !resolutionNote.trim()) return;
    const res = await fetch(
      `${apiBase}/api/v1/entities/${entityId}/open-decisions/${selectedDecision}/resolve`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ resolutionNote }),
      },
    );
    if (!res.ok) throw new Error("Resolve failed");
    setResolutionNote("");
    setSelectedDecision(null);
    await load();
  };

  if (!state && !error) return <p>Loading attention flags…</p>;

  return (
    <section className="attention-flags-panel" data-testid="attention-flags">
      <h3>Attention flags</h3>
      {!state?.clearForAgentDeployment && (
        <p className="deployment-blocked" role="alert">
          Not clear for agent deployment — resolve governance gates or hard-rule exceptions.
        </p>
      )}
      <ul className="attention-list">
        {state?.items.map((item) => (
          <li key={item.id} data-severity={item.severity}>
            <strong>{item.signalType.replace(/_/g, " ")}</strong> — {item.message}
          </li>
        ))}
        {state?.items.length === 0 && <li>No open attention flags</li>}
      </ul>
      {state && state.openDecisions.length > 0 && (
        <div className="open-decisions">
          <h4>Open decisions</h4>
          {state.openDecisions.map((d) => (
            <div key={d.id}>
              <label>
                <input
                  type="radio"
                  name="decision"
                  checked={selectedDecision === d.id}
                  onChange={() => setSelectedDecision(d.id)}
                />
                {d.title}
              </label>
            </div>
          ))}
          {selectedDecision && (
            <div className="resolve-decision">
              <input
                placeholder="Resolution note"
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
              />
              <button type="button" onClick={resolveDecision}>Resolve decision</button>
            </div>
          )}
        </div>
      )}
      {state && state.unverifiedClaims.length > 0 && (
        <div className="unverified-claims">
          <h4>Unverified claims</h4>
          <ul>
            {state.unverifiedClaims.map((c) => (
              <li key={c.id}>{c.claimType}: {c.claimText}</li>
            ))}
          </ul>
        </div>
      )}
      {state && state.relationships.length > 0 && (
        <div className="relationships">
          <h4>Entity relationships</h4>
          <ul>
            {state.relationships.map((r, i) => (
              <li key={i}>
                {r.relationshipType.replace(/_/g, " ")}
                {r.constraintNote && <small> — {r.constraintNote}</small>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
