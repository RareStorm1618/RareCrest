import { useCallback, useEffect, useState } from "react";
import type { PortfolioRollup } from "@rarecrest/contracts";
import { navigate } from "../lib/routing.js";
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
  portfolioClear: boolean;
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [briefRes, prioritiesRes, queueRes] = await Promise.all([
        fetch(`${apiBase}/api/v1/command/morning-brief`, { headers }),
        fetch(`${apiBase}/api/v1/command/priorities`, { headers }),
        fetch(`${apiBase}/api/v1/command/attention-queue`, { headers }),
      ]);
      if (!briefRes.ok) throw new Error(await briefRes.text());
      if (!prioritiesRes.ok) throw new Error(await prioritiesRes.text());
      if (!queueRes.ok) throw new Error(await queueRes.text());
      const briefData = (await briefRes.json()) as MorningBrief;
      const prioritiesData = (await prioritiesRes.json()) as { ranked: PriorityItem[] };
      const queueData = (await queueRes.json()) as { items: AttentionQueueItem[]; portfolioClear: boolean };
      setBrief(briefData);
      setPriorities(prioritiesData.ranked ?? []);
      setQueue(queueData.items ?? []);
      setPortfolioClear(briefData.portfolioClear ?? queueData.portfolioClear);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load command center");
    } finally {
      setLoading(false);
    }
  }, [apiBase, headers]);

  useEffect(() => {
    load();
  }, [load]);

  const goToItem = (entityId: string | null) => {
    if (!entityId) return;
    const entity = rollup?.entities.find((e) => e.id === entityId);
    if (entity) rememberEntity({ id: entity.id, name: entity.name });
    navigate({ name: "diagnostics", entityId });
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
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className="command-card"
                          disabled={!entityId}
                          onClick={() => goToItem(entityId)}
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
                onClick={() => goToItem(item.entityId)}
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
        </div>
      </div>
    </section>
  );
}
