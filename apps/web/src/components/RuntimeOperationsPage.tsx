import { useCallback, useEffect, useState } from "react";

interface RuntimeOperationsPageProps {
  entityId: string;
  entityName: string;
  apiBase: string;
  headers: Record<string, string>;
}

interface AgentRosterEntry {
  id: string;
  agentId: string;
  entityId: string;
  owner: string;
  currentActivity: string | null;
  status: "running" | "inactive" | "halted";
  health: "healthy" | "degraded" | "critical";
  version: string | null;
}

interface KillSwitchRow {
  entityId: string;
  state: "idle" | "armed" | "triggered";
  armedBy: string | null;
  armedAt: string | null;
  armedReason: string | null;
  triggeredBy: string | null;
  triggeredAt: string | null;
  triggeredReason: string | null;
}

interface HumanReviewItem {
  id: string;
  entityId: string;
  agentId: string;
  category: string;
  decisionNeeded: string;
  status: string;
  slaTargetAt: string;
  createdAt: string;
}

interface EncryptionLayerStatus {
  entityId: string;
  encryptionLayerPresent: boolean;
}

type KillSwitchAction = "arm" | "trigger" | "disarm";

export function RuntimeOperationsPage({ entityId, entityName, apiBase, headers }: RuntimeOperationsPageProps) {
  const [agents, setAgents] = useState<AgentRosterEntry[]>([]);
  const [killSwitch, setKillSwitch] = useState<KillSwitchRow | null>(null);
  const [encryption, setEncryption] = useState<EncryptionLayerStatus | null>(null);
  const [reviews, setReviews] = useState<HumanReviewItem[]>([]);
  const [breachedIds, setBreachedIds] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const jsonHeaders = { ...headers, "Content-Type": "application/json" };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [agentsRes, killRes, encRes, reviewRes] = await Promise.all([
        fetch(`${apiBase}/api/v1/runtime/agents?entityId=${encodeURIComponent(entityId)}`, { headers }),
        fetch(`${apiBase}/api/v1/runtime/kill-switch/${entityId}`, { headers }),
        fetch(`${apiBase}/api/v1/phi/encryption-layer/${entityId}`, { headers }),
        fetch(`${apiBase}/api/v1/runtime/human-review`, { headers }),
      ]);
      if (agentsRes.ok) {
        const data = (await agentsRes.json()) as { agents: AgentRosterEntry[] };
        setAgents(data.agents ?? []);
      }
      if (killRes.ok) {
        setKillSwitch((await killRes.json()) as KillSwitchRow);
      }
      if (encRes.ok) {
        setEncryption((await encRes.json()) as EncryptionLayerStatus);
      }
      if (reviewRes.ok) {
        const data = (await reviewRes.json()) as { items: HumanReviewItem[]; breached: HumanReviewItem[] };
        setReviews((data.items ?? []).filter((item) => item.entityId === entityId));
        setBreachedIds(new Set((data.breached ?? []).map((item) => item.id)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load runtime operations");
    } finally {
      setLoading(false);
    }
  }, [apiBase, entityId, headers]);

  useEffect(() => {
    load();
  }, [load]);

  const runKillSwitchAction = async (action: KillSwitchAction) => {
    if (!reason.trim()) {
      setError("Provide a reason before arming, triggering, or disarming the kill switch");
      return;
    }
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/runtime/kill-switch/${entityId}/${action}`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? `Kill switch ${action} failed`);
      }
      const data = (await res.json()) as KillSwitchRow & { row?: KillSwitchRow };
      setKillSwitch(data.row ?? data);
      setStatus(`Kill switch ${action} succeeded`);
      setReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : `Kill switch ${action} failed`);
    } finally {
      setBusy(false);
    }
  };

  const registerEncryptionLayer = async () => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/phi/encryption-layer/${entityId}`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? "Register encryption layer failed");
      }
      setStatus("Encryption layer registered");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Register encryption layer failed");
    } finally {
      setBusy(false);
    }
  };

  const resolveReview = async (id: string, approved: boolean) => {
    const resolutionNote = window.prompt(approved ? "Approval note (required)" : "Denial note (required)");
    if (!resolutionNote || !resolutionNote.trim()) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/runtime/human-review/${id}/resolve`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ approved, resolutionNote: resolutionNote.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? "Resolve review failed");
      }
      setStatus(`Held action ${approved ? "approved" : "denied"}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Resolve review failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="runtime-operations-page" data-testid="runtime-operations-page">
      <header className="page-header">
        <h2>Runtime Operations — {entityName}</h2>
        <p>
          Agent roster, kill switch ceremony, PHI encryption posture, and held-action review — human
          custody only, zero client authority.
        </p>
      </header>

      {error && (
        <p className="wiki-error" role="alert">
          {error}
        </p>
      )}
      {status && <p className="wiki-status">{status}</p>}
      {loading && !agents.length && !killSwitch && <p>Loading runtime operations…</p>}

      <div className="runtime-section">
        <h3>Agent roster</h3>
        {agents.length === 0 ? (
          <p className="wiki-empty">No agents registered for this entity.</p>
        ) : (
          <div className="runtime-card-grid">
            {agents.map((agent) => (
              <div key={agent.id} className={`runtime-card agent-card health-${agent.health}`}>
                <strong>{agent.agentId}</strong>
                <span>{agent.owner}</span>
                <span className={`status-pill status-${agent.status}`}>{agent.status}</span>
                <span className={`status-pill health-${agent.health}`}>{agent.health}</span>
                {agent.currentActivity && <small>{agent.currentActivity}</small>}
                {agent.version && <small>v{agent.version}</small>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="runtime-section kill-switch-panel">
        <h3>Kill switch</h3>
        {killSwitch && (
          <div className={`kill-switch-status state-${killSwitch.state}`} data-testid="kill-switch-status">
            <strong>{killSwitch.state.toUpperCase()}</strong>
            {killSwitch.state === "armed" && (
              <span>
                {" "}
                — armed by {killSwitch.armedBy} ({killSwitch.armedReason})
              </span>
            )}
            {killSwitch.state === "triggered" && (
              <span>
                {" "}
                — triggered by {killSwitch.triggeredBy} ({killSwitch.triggeredReason})
              </span>
            )}
          </div>
        )}
        <label>
          Reason
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Required for arm / trigger / disarm"
            disabled={busy}
          />
        </label>
        <div className="actions">
          <button
            type="button"
            onClick={() => runKillSwitchAction("arm")}
            disabled={busy || killSwitch?.state === "armed"}
          >
            Arm
          </button>
          <button
            type="button"
            onClick={() => runKillSwitchAction("trigger")}
            disabled={busy || killSwitch?.state !== "armed"}
          >
            Trigger
          </button>
          <button
            type="button"
            onClick={() => runKillSwitchAction("disarm")}
            disabled={busy || killSwitch?.state === "idle"}
          >
            Disarm
          </button>
        </div>
      </div>

      <div className="runtime-section">
        <h3>PHI encryption posture</h3>
        {encryption && (
          <div className={`encryption-status ${encryption.encryptionLayerPresent ? "present" : "missing"}`}>
            {encryption.encryptionLayerPresent
              ? "Encryption layer active"
              : "No encryption layer registered — PHI ingestion is blocked"}
          </div>
        )}
        {!encryption?.encryptionLayerPresent && (
          <button type="button" onClick={registerEncryptionLayer} disabled={busy}>
            Register encryption layer
          </button>
        )}
        <p className="phi-note">
          Plaintext PHI is never rendered here — human-custody decrypt is a separate audited action.
        </p>
      </div>

      <div className="runtime-section">
        <h3>Held-action / human review queue</h3>
        {reviews.length === 0 ? (
          <p className="wiki-empty">No pending held actions for this entity.</p>
        ) : (
          <div className="runtime-card-grid">
            {reviews.map((review) => (
              <div
                key={review.id}
                className={`runtime-card review-card ${breachedIds.has(review.id) ? "breached" : ""}`}
              >
                <strong>{review.category.replace(/_/g, " ")}</strong>
                <span>{review.decisionNeeded}</span>
                <small>
                  SLA: {new Date(review.slaTargetAt).toLocaleString()}
                  {breachedIds.has(review.id) && " — BREACHED"}
                </small>
                <div className="actions">
                  <button type="button" onClick={() => resolveReview(review.id, true)} disabled={busy}>
                    Approve
                  </button>
                  <button type="button" onClick={() => resolveReview(review.id, false)} disabled={busy}>
                    Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
