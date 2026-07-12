import { useCallback, useEffect, useState } from "react";
import type { AgentRight, OfficerRole, OfficerRoleTemplate } from "@rarecrest/contracts";
import { ParliamentPanel } from "./ParliamentPanel";

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

interface HumanInstructionRow {
  id: string;
  entityId: string;
  vertical: string;
  actorId: string;
  actionScope: string;
  instruction: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

interface OfficerAssignmentRow {
  id: string;
  entityId: string;
  officerRole: OfficerRole;
  agentId: string;
  active: boolean;
  issuedPassportId: string | null;
  assignedBy: string;
  createdAt: string;
}

type KillSwitchAction = "arm" | "trigger" | "disarm";

const ALL_AGENT_RIGHTS: AgentRight[] = ["sensitive_data", "code_execution", "external_comms"];

function formatRelativeToNow(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60_000);
  const abs = Math.abs(diffMinutes);
  if (abs < 60) return diffMinutes >= 0 ? `in ${abs}m` : `${abs}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  const absHours = Math.abs(diffHours);
  if (absHours < 48) return diffHours >= 0 ? `in ${absHours}h` : `${absHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return diffDays >= 0 ? `in ${Math.abs(diffDays)}d` : `${Math.abs(diffDays)}d ago`;
}

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

  const [actionScope, setActionScope] = useState("");
  const [instruction, setInstruction] = useState("");
  const [expiresInHours, setExpiresInHours] = useState(24);
  const [humanInstructions, setHumanInstructions] = useState<HumanInstructionRow[]>([]);
  const [humanInstructionsUnavailable, setHumanInstructionsUnavailable] = useState(false);
  const [instructionBusy, setInstructionBusy] = useState(false);
  const [instructionError, setInstructionError] = useState<string | null>(null);
  const [instructionStatus, setInstructionStatus] = useState<string | null>(null);

  const [officerTemplates, setOfficerTemplates] = useState<Partial<Record<OfficerRole, OfficerRoleTemplate>>>({});
  const [officerAssignments, setOfficerAssignments] = useState<OfficerAssignmentRow[]>([]);
  const [officerAssignmentsUnavailable, setOfficerAssignmentsUnavailable] = useState(false);
  const [officerRole, setOfficerRole] = useState<OfficerRole | "">("");
  const [officerAgentId, setOfficerAgentId] = useState("");
  const [officerRights, setOfficerRights] = useState<AgentRight[]>([]);
  const [officerBusy, setOfficerBusy] = useState(false);
  const [officerError, setOfficerError] = useState<string | null>(null);
  const [officerStatus, setOfficerStatus] = useState<string | null>(null);

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

  const loadHumanInstructions = useCallback(async () => {
    try {
      const res = await fetch(
        `${apiBase}/api/v1/human-instructions?entityId=${encodeURIComponent(entityId)}`,
        { headers },
      );
      if (res.status === 404) {
        setHumanInstructionsUnavailable(true);
        setHumanInstructions([]);
        return;
      }
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { instructions?: HumanInstructionRow[] };
      setHumanInstructions(data.instructions ?? []);
      setHumanInstructionsUnavailable(false);
    } catch {
      setHumanInstructionsUnavailable(true);
      setHumanInstructions([]);
    }
  }, [apiBase, entityId, headers]);

  useEffect(() => {
    loadHumanInstructions();
  }, [loadHumanInstructions]);

  const loadOfficers = useCallback(async () => {
    try {
      const [templatesRes, assignmentsRes] = await Promise.all([
        fetch(`${apiBase}/api/v1/runtime/officers/templates`, { headers }),
        fetch(`${apiBase}/api/v1/runtime/entities/${entityId}/officers`, { headers }),
      ]);
      if (templatesRes.status === 404 || assignmentsRes.status === 404) {
        setOfficerAssignmentsUnavailable(true);
        return;
      }
      if (templatesRes.ok) {
        const data = (await templatesRes.json()) as { templates: Record<OfficerRole, OfficerRoleTemplate> };
        setOfficerTemplates(data.templates ?? {});
      }
      if (assignmentsRes.ok) {
        const data = (await assignmentsRes.json()) as { assignments: OfficerAssignmentRow[] };
        setOfficerAssignments(data.assignments ?? []);
      }
      setOfficerAssignmentsUnavailable(false);
    } catch {
      setOfficerAssignmentsUnavailable(true);
    }
  }, [apiBase, entityId, headers]);

  useEffect(() => {
    loadOfficers();
  }, [loadOfficers]);

  const selectedOfficerTemplate = officerRole ? officerTemplates[officerRole] : undefined;

  const chooseOfficerRole = (role: OfficerRole | "") => {
    setOfficerRole(role);
    const template = role ? officerTemplates[role] : undefined;
    setOfficerRights(template ? [...template.maxRights] : []);
  };

  const toggleOfficerRight = (right: AgentRight) => {
    setOfficerRights((prev) => (prev.includes(right) ? prev.filter((r) => r !== right) : [...prev, right]));
  };

  const assignOfficer = async () => {
    if (!officerRole || !officerAgentId.trim()) return;
    setOfficerBusy(true);
    setOfficerError(null);
    setOfficerStatus(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/runtime/officers/assign`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          entityId,
          officerRole,
          agentId: officerAgentId.trim(),
          requestedRights: officerRights,
        }),
      });
      if (res.status === 404) {
        setOfficerAssignmentsUnavailable(true);
        setOfficerError("Officer assignment API is not deployed yet");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? "Officer assignment failed");
      }
      setOfficerStatus(`Officer role ${officerRole} assigned to ${officerAgentId.trim()}`);
      setOfficerAgentId("");
      chooseOfficerRole("");
      await loadOfficers();
    } catch (err) {
      setOfficerError(err instanceof Error ? err.message : "Officer assignment failed");
    } finally {
      setOfficerBusy(false);
    }
  };

  const deactivateOfficer = async (assignmentId: string) => {
    setOfficerBusy(true);
    setOfficerError(null);
    setOfficerStatus(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/runtime/officers/${assignmentId}/deactivate`, {
        method: "POST",
        headers: jsonHeaders,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? "Officer deactivation failed");
      }
      setOfficerStatus("Officer assignment deactivated");
      await loadOfficers();
    } catch (err) {
      setOfficerError(err instanceof Error ? err.message : "Officer deactivation failed");
    } finally {
      setOfficerBusy(false);
    }
  };

  const createHumanInstruction = async () => {
    if (!actionScope.trim() || !instruction.trim()) return;
    setInstructionBusy(true);
    setInstructionError(null);
    setInstructionStatus(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/human-instructions`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          entityId,
          actionScope: actionScope.trim(),
          instruction: instruction.trim(),
          expiresInHours,
        }),
      });
      if (res.status === 404) {
        setHumanInstructionsUnavailable(true);
        setInstructionError("Human instructions API is not deployed yet");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? "Create human instruction failed");
      }
      setInstructionStatus("Human instruction recorded");
      setActionScope("");
      setInstruction("");
      setExpiresInHours(24);
      await loadHumanInstructions();
    } catch (err) {
      setInstructionError(err instanceof Error ? err.message : "Create human instruction failed");
    } finally {
      setInstructionBusy(false);
    }
  };

  const revokeHumanInstruction = async (id: string) => {
    setInstructionBusy(true);
    setInstructionError(null);
    setInstructionStatus(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/human-instructions/${id}/revoke`, {
        method: "POST",
        headers: jsonHeaders,
      });
      if (res.status === 404) {
        setHumanInstructionsUnavailable(true);
        setInstructionError("Human instructions API is not deployed yet");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? "Revoke human instruction failed");
      }
      setInstructionStatus("Human instruction revoked");
      await loadHumanInstructions();
    } catch (err) {
      setInstructionError(err instanceof Error ? err.message : "Revoke human instruction failed");
    } finally {
      setInstructionBusy(false);
    }
  };

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

      <div className="runtime-section" data-testid="human-instructions-panel">
        <h3>Human instructions</h3>
        <p className="phi-note">
          The durable authorization record behind every financial/held-action release —
          resolving a held action never accepts a bare client-supplied id.
        </p>
        <label>
          Action scope
          <input
            value={actionScope}
            onChange={(e) => setActionScope(e.target.value)}
            placeholder="e.g. treasury_transfer"
            disabled={instructionBusy}
          />
        </label>
        <label>
          Instruction
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="What the human is authorizing, and for what scope"
            rows={3}
            disabled={instructionBusy}
          />
        </label>
        <label>
          Expires in (hours)
          <input
            type="number"
            min={1}
            max={168}
            value={expiresInHours}
            onChange={(e) => setExpiresInHours(Number(e.target.value))}
            disabled={instructionBusy}
          />
        </label>
        <div className="actions">
          <button
            type="button"
            onClick={createHumanInstruction}
            disabled={instructionBusy || !actionScope.trim() || !instruction.trim()}
          >
            Record instruction
          </button>
        </div>
        {instructionStatus && <p className="wiki-status">{instructionStatus}</p>}
        {instructionError && (
          <p className="wiki-error" role="alert">
            {instructionError}
          </p>
        )}

        {humanInstructionsUnavailable ? (
          <p className="wiki-empty">Human instructions API is not deployed yet.</p>
        ) : humanInstructions.length === 0 ? (
          <p className="wiki-empty">No human instructions recorded for this entity.</p>
        ) : (
          <ul className="human-instructions-list">
            {humanInstructions.map((row) => {
              const revoked = Boolean(row.revokedAt);
              const expired = !revoked && new Date(row.expiresAt).getTime() <= Date.now();
              return (
                <li key={row.id} className={revoked ? "revoked" : expired ? "expired" : undefined}>
                  <span>
                    <strong>{row.actionScope}</strong> — {row.instruction}
                    <small>
                      Expires {new Date(row.expiresAt).toLocaleString()} ({formatRelativeToNow(row.expiresAt)})
                      {revoked && " — REVOKED"}
                    </small>
                  </span>
                  {revoked ? null : expired ? (
                    <span className="status-pill status-expired" data-testid="human-instruction-expired">
                      EXPIRED
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => revokeHumanInstruction(row.id)}
                      disabled={instructionBusy}
                    >
                      Revoke
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="runtime-section" data-testid="officers-panel">
        <h3>Officer passports</h3>
        <p className="phi-note">
          Director-assigned officer roles — each role caps requestable rights at a pre-shaped
          template ceiling, always within the two-of-three rights rule.
        </p>

        {officerAssignmentsUnavailable ? (
          <p className="wiki-empty">Officer assignment API is not deployed yet.</p>
        ) : (
          <>
            {officerAssignments.length === 0 ? (
              <p className="wiki-empty">No officer roles assigned for this entity.</p>
            ) : (
              <div className="runtime-card-grid">
                {officerAssignments.map((assignment) => (
                  <div key={assignment.id} className="runtime-card officer-card">
                    <strong className="officer-role-badge">{assignment.officerRole.replace(/_/g, " ")}</strong>
                    <span>{assignment.agentId}</span>
                    <span className={`status-pill ${assignment.active ? "status-running" : "status-halted"}`}>
                      {assignment.active ? "active" : "inactive"}
                    </span>
                    <small>assigned by {assignment.assignedBy}</small>
                    {assignment.active && (
                      <button type="button" onClick={() => deactivateOfficer(assignment.id)} disabled={officerBusy}>
                        Deactivate
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <label>
              Officer role
              <select
                value={officerRole}
                onChange={(e) => chooseOfficerRole(e.target.value as OfficerRole | "")}
                disabled={officerBusy}
              >
                <option value="">Select a role…</option>
                {(Object.keys(officerTemplates) as OfficerRole[]).map((role) => (
                  <option key={role} value={role}>
                    {role.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Agent ID
              <input
                value={officerAgentId}
                onChange={(e) => setOfficerAgentId(e.target.value)}
                placeholder="agent identifier"
                disabled={officerBusy}
              />
            </label>
            {selectedOfficerTemplate && (
              <fieldset className="officer-rights-fieldset">
                <legend>Rights (max 2, capped by template)</legend>
                {ALL_AGENT_RIGHTS.filter((right) => selectedOfficerTemplate.maxRights.includes(right)).map(
                  (right) => (
                    <label key={right} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={officerRights.includes(right)}
                        onChange={() => toggleOfficerRight(right)}
                        disabled={officerBusy}
                      />
                      {right.replace(/_/g, " ")}
                    </label>
                  ),
                )}
                {selectedOfficerTemplate.maxRights.length === 0 && <small>This role has no assignable rights.</small>}
                <small>
                  phiBlind: {String(selectedOfficerTemplate.phiBlind)} · financialPrepOnly:{" "}
                  {String(selectedOfficerTemplate.financialPrepOnly)} · mayExecuteProduction:{" "}
                  {String(selectedOfficerTemplate.mayExecuteProduction)}
                </small>
              </fieldset>
            )}
            <div className="actions">
              <button type="button" onClick={assignOfficer} disabled={officerBusy || !officerRole || !officerAgentId.trim()}>
                Assign officer
              </button>
            </div>
            {officerStatus && <p className="wiki-status">{officerStatus}</p>}
            {officerError && (
              <p className="wiki-error" role="alert">
                {officerError}
              </p>
            )}
          </>
        )}
      </div>

      <ParliamentPanel entityId={entityId} apiBase={apiBase} headers={headers} />
    </section>
  );
}
