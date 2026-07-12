import { useCallback, useEffect, useState } from "react";
import type { PortfolioRollup } from "@rarecrest/contracts";
import { navigate, parseHash } from "../lib/routing.js";
import { rememberEntity } from "../lib/entity-memory.js";

interface CommandCenterPageProps {
  apiBase: string;
  headers: Record<string, string>;
  rollup: PortfolioRollup | null;
}

interface BriefItem {
  id: string;
  label: string;
  linkPath: string;
  sourceFeature: string;
}

interface BriefSection {
  type: string;
  items: BriefItem[];
}

interface MorningBrief {
  date: string;
  unchanged: boolean;
  sections: BriefSection[];
  generatedAt: string;
}

interface PriorityItem {
  rank: number;
  itemId: string;
  label: string;
  sourceFeature: string;
  entityId: string;
  score: number;
}

interface AttentionQueueItem {
  id: string;
  entityId: string;
  entityName?: string;
  signalType: string;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  linkPath: string | null;
  sourceRef: string | null;
  createdAt: string;
  sourceFeature: string;
  kind: "decision" | "awareness";
  deferredToBrief?: boolean;
  agentId?: string | null;
  interruptPaid?: boolean;
}

interface AgentAttentionBudget {
  id: string;
  agentId: string;
  entityId: string;
  day: string;
  criticalTokens: number;
  awarenessTokens: number;
  criticalSpent: number;
  awarenessSpent: number;
}

interface AttentionAuction {
  interruptItems: AttentionQueueItem[];
  deferredCount: number;
  budgets: AgentAttentionBudget[];
}

interface CommandDashboardResponse {
  brief: MorningBrief;
  ranked: PriorityItem[];
  queue: AttentionQueueItem[];
  portfolioClear: boolean;
  attentionAuction?: AttentionAuction;
}

interface BackupStatus {
  walArchiving: boolean;
  databaseHealthy: boolean;
  lastChecklist: string;
  generatedAt: string;
}

const SECTION_LABELS: Record<string, string> = {
  new_decisions: "New decisions",
  resolved: "Resolved",
  alerts: "Alerts",
  agent_activity: "Agent activity",
  unchanged: "Nothing changed",
  wiki_health: "Wiki health",
};

function entityIdFromLinkPath(linkPath: string | null | undefined): string | null {
  const match = linkPath?.match(/\/entities\/([^/]+)/);
  return match ? match[1] : null;
}

export function CommandCenterPage({ apiBase, headers, rollup }: CommandCenterPageProps) {
  const [brief, setBrief] = useState<MorningBrief | null>(null);
  const [priorities, setPriorities] = useState<PriorityItem[]>([]);
  const [queue, setQueue] = useState<AttentionQueueItem[]>([]);
  const [portfolioClear, setPortfolioClear] = useState(true);
  const [attentionAuction, setAttentionAuction] = useState<AttentionAuction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const dashboardRes = await fetch(`${apiBase}/api/v1/command/dashboard`, { headers });
      if (dashboardRes.ok) {
        const data = (await dashboardRes.json()) as CommandDashboardResponse;
        setBrief(data.brief);
        setPriorities(data.ranked ?? []);
        setQueue(data.queue ?? []);
        setPortfolioClear(data.portfolioClear ?? true);
        setAttentionAuction(data.attentionAuction ?? null);
        return;
      }
      if (dashboardRes.status !== 404) {
        throw new Error(await dashboardRes.text());
      }
      // Fallback for older API deployments without /command/dashboard.
      const [briefRes, prioritiesRes, queueRes] = await Promise.all([
        fetch(`${apiBase}/api/v1/command/morning-brief`, { headers }),
        fetch(`${apiBase}/api/v1/command/priorities`, { headers }),
        fetch(`${apiBase}/api/v1/command/attention-queue`, { headers }),
      ]);
      if (!briefRes.ok) throw new Error(await briefRes.text());
      if (!prioritiesRes.ok) throw new Error(await prioritiesRes.text());
      if (!queueRes.ok) throw new Error(await queueRes.text());
      const briefData = (await briefRes.json()) as MorningBrief & { portfolioClear?: boolean };
      const prioritiesData = (await prioritiesRes.json()) as { ranked: PriorityItem[] };
      const queueData = (await queueRes.json()) as { items: AttentionQueueItem[]; portfolioClear: boolean };
      setBrief(briefData);
      setPriorities(prioritiesData.ranked ?? []);
      setQueue(queueData.items ?? []);
      setPortfolioClear(briefData.portfolioClear ?? queueData.portfolioClear);
      setAttentionAuction(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load command center");
    } finally {
      setLoading(false);
    }
  }, [apiBase, headers]);

  const loadOpsStatus = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/v1/ops/backup-status`, { headers });
      if (res.status === 403) {
        setBackupStatus(null);
        return;
      }
      if (!res.ok) return;
      setBackupStatus((await res.json()) as BackupStatus);
    } catch {
      setBackupStatus(null);
    }
  }, [apiBase, headers]);

  useEffect(() => {
    load();
    loadOpsStatus();
  }, [load, loadOpsStatus]);

  const rememberIfKnown = useCallback(
    (entityId: string | null) => {
      if (!entityId) return;
      const entity = rollup?.entities.find((e) => e.id === entityId);
      if (entity) rememberEntity({ id: entity.id, name: entity.name });
    },
    [rollup],
  );

  /** Navigate using a server-provided linkPath (e.g. `#/entities/{id}/wiki` or `#/command`). */
  const goToLink = useCallback(
    (linkPath: string | null | undefined, entityId?: string | null) => {
      if (linkPath) {
        const hash = linkPath.startsWith("#") ? linkPath : `#${linkPath}`;
        navigate(parseHash(hash));
        rememberIfKnown(entityIdFromLinkPath(linkPath) ?? entityId ?? null);
        return;
      }
      if (entityId) {
        rememberIfKnown(entityId);
        navigate({ name: "diagnostics", entityId });
      }
    },
    [rememberIfKnown],
  );

  const resolveFlag = async (item: AttentionQueueItem) => {
    setResolvingId(item.id);
    try {
      const res = await fetch(`${apiBase}/api/v1/entities/${item.entityId}/attention-flags/${item.id}/resolve`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ resolutionNote: "Resolved from Command Center" }),
      });
      if (!res.ok) throw new Error(await res.text());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resolve attention flag");
    } finally {
      setResolvingId(null);
    }
  };

  const severityCounts = queue.reduce<Record<string, number>>((acc, item) => {
    acc[item.severity] = (acc[item.severity] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <section className="command-center-page" data-testid="command-center-page">
      <header className="page-header command-center-header">
        <div>
          <h2>Command Center</h2>
          <p>
            Director morning brief, ranked priorities, and portfolio-wide attention signals —
            server-owned state, zero client authority.
          </p>
        </div>
        <div className="command-center-actions">
          <span className={`portfolio-badge ${portfolioClear ? "clear" : "attention"}`}>
            {portfolioClear ? "Portfolio clear" : `${queue.length} open signals`}
          </span>
          <button type="button" onClick={load} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      {backupStatus && (
        <div className="ops-strip" data-testid="ops-strip">
          <span className={`ops-badge ${backupStatus.databaseHealthy ? "ok" : "down"}`}>
            DB {backupStatus.databaseHealthy ? "healthy" : "unhealthy"}
          </span>
          <span className={`ops-badge ${backupStatus.walArchiving ? "ok" : "down"}`}>
            WAL {backupStatus.walArchiving ? "archiving" : "off"}
          </span>
        </div>
      )}

      {error && (
        <p className="wiki-error" role="alert">
          {error}
        </p>
      )}
      {loading && !brief && <p>Loading command center…</p>}

      {brief && (
        <div className="command-sections">
          {brief.unchanged ? (
            <div className="command-card command-card-unchanged">
              <strong>Nothing changed since your last session.</strong>
            </div>
          ) : (
            brief.sections
              .filter((section) => section.type !== "unchanged")
              .map((section) => (
                <div key={section.type} className={`command-section-block section-${section.type}`}>
                  <h3>{SECTION_LABELS[section.type] ?? section.type}</h3>
                  <div className="command-card-grid">
                    {section.items.map((item) => {
                      const entityId = entityIdFromLinkPath(item.linkPath);
                      const clickable = Boolean(entityId) || item.linkPath === "#/command";
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className="command-card"
                          disabled={!clickable}
                          onClick={() => goToLink(item.linkPath, entityId)}
                        >
                          <span className="command-card-label">{item.label}</span>
                          <small>{item.sourceFeature}</small>
                        </button>
                      );
                    })}
                    {section.items.length === 0 && <p className="wiki-empty">No items</p>}
                  </div>
                </div>
              ))
          )}
        </div>
      )}

      <div className="command-section-block">
        <h3>Ranked priorities</h3>
        {priorities.length === 0 ? (
          <p className="wiki-empty">No open priorities — portfolio is quiet.</p>
        ) : (
          <div className="command-card-grid priorities-grid">
            {priorities.map((item) => (
              <button
                key={item.itemId}
                type="button"
                className="command-card priority-card"
                onClick={() => goToLink(null, item.entityId)}
              >
                <span className="priority-rank">#{item.rank}</span>
                <span className="command-card-label">{item.label}</span>
                <small>
                  {item.sourceFeature} · score {item.score}
                </small>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="command-section-block">
        <h3>Attention queue</h3>
        <div className="portfolio-summary">
          <div className="stat">
            <strong>{queue.length}</strong>
            <span>Open signals</span>
          </div>
          {Object.entries(severityCounts).map(([severity, count]) => (
            <div key={severity} className="stat">
              <strong>{count}</strong>
              <span>{severity}</span>
            </div>
          ))}
          {attentionAuction && (
            <div className="stat" data-testid="deferred-count-stat">
              <strong>{attentionAuction.deferredCount}</strong>
              <span>Deferred to brief</span>
            </div>
          )}
        </div>

        {attentionAuction && attentionAuction.budgets.length > 0 && (
          <div className="attention-budget-badges" data-testid="attention-budget-badges">
            {attentionAuction.budgets.map((budget) => {
              const criticalRemaining = Math.max(0, budget.criticalTokens - budget.criticalSpent);
              const awarenessRemaining = Math.max(0, budget.awarenessTokens - budget.awarenessSpent);
              const exhausted = criticalRemaining === 0 && awarenessRemaining === 0;
              return (
                <span
                  key={budget.id}
                  className={`attention-budget-badge ${exhausted ? "exhausted" : ""}`}
                  title={`${budget.agentId} — critical ${criticalRemaining}/${budget.criticalTokens}, awareness ${awarenessRemaining}/${budget.awarenessTokens}`}
                >
                  {budget.agentId}: {criticalRemaining}⚡/{awarenessRemaining}ⓘ
                </span>
              );
            })}
          </div>
        )}

        {attentionAuction ? (
          <>
            <h4 className="attention-lane-heading">Interrupt lane ({attentionAuction.interruptItems.length})</h4>
            <ul className="attention-queue-list">
              {attentionAuction.interruptItems.map((item) => (
                <li key={item.id} className="attention-queue-item" data-testid="attention-queue-item">
                  <span className={`severity-badge severity-${item.severity}`}>{item.severity}</span>
                  <div className="attention-queue-body">
                    <strong>{item.entityName ?? item.entityId}</strong>
                    <span className="attention-queue-message">{item.message}</span>
                    <small>
                      {item.kind}
                      {item.agentId ? ` · ${item.agentId}` : ""}
                    </small>
                  </div>
                  <div className="attention-queue-actions">
                    <button type="button" onClick={() => goToLink(item.linkPath, item.entityId)}>
                      View
                    </button>
                    <button
                      type="button"
                      onClick={() => resolveFlag(item)}
                      disabled={resolvingId === item.id}
                    >
                      {resolvingId === item.id ? "Resolving…" : "Resolve"}
                    </button>
                  </div>
                </li>
              ))}
              {attentionAuction.interruptItems.length === 0 && (
                <li className="wiki-empty">No open attention signals</li>
              )}
            </ul>

            {attentionAuction.deferredCount > 0 && (
              <>
                <h4 className="attention-lane-heading deferred" data-testid="deferred-lane-heading">
                  Deferred to brief ({attentionAuction.deferredCount})
                </h4>
                <ul className="attention-queue-list deferred-list">
                  {queue
                    .filter((item) => item.deferredToBrief)
                    .map((item) => (
                      <li key={item.id} className="attention-queue-item deferred" data-testid="deferred-queue-item">
                        <span className={`severity-badge severity-${item.severity}`}>{item.severity}</span>
                        <div className="attention-queue-body">
                          <strong>{item.entityName ?? item.entityId}</strong>
                          <span className="attention-queue-message">{item.message}</span>
                          <small>
                            {item.kind}
                            {item.agentId ? ` · ${item.agentId} · budget exhausted` : ""}
                          </small>
                        </div>
                        <div className="attention-queue-actions">
                          <button type="button" onClick={() => goToLink(item.linkPath, item.entityId)}>
                            View
                          </button>
                        </div>
                      </li>
                    ))}
                </ul>
              </>
            )}
          </>
        ) : (
          <ul className="attention-queue-list">
            {queue.map((item) => (
              <li key={item.id} className="attention-queue-item" data-testid="attention-queue-item">
                <span className={`severity-badge severity-${item.severity}`}>{item.severity}</span>
                <div className="attention-queue-body">
                  <strong>{item.entityName ?? item.entityId}</strong>
                  <span className="attention-queue-message">{item.message}</span>
                  <small>{item.kind}</small>
                </div>
                <div className="attention-queue-actions">
                  <button type="button" onClick={() => goToLink(item.linkPath, item.entityId)}>
                    View
                  </button>
                  <button
                    type="button"
                    onClick={() => resolveFlag(item)}
                    disabled={resolvingId === item.id}
                  >
                    {resolvingId === item.id ? "Resolving…" : "Resolve"}
                  </button>
                </div>
              </li>
            ))}
            {queue.length === 0 && <li className="wiki-empty">No open attention signals</li>}
          </ul>
        )}
      </div>
    </section>
  );
}
