import type { PortfolioRollup } from "@rarecrest/contracts";

interface PortfolioStatusViewProps {
  rollup: PortfolioRollup | null;
  loading: boolean;
  onSelectEntity?: (id: string) => void;
}

export function PortfolioStatusView({ rollup, loading, onSelectEntity }: PortfolioStatusViewProps) {
  if (loading) {
    return <p data-testid="portfolio-loading">Loading portfolio…</p>;
  }

  if (!rollup || rollup.summary.totalEntities === 0) {
    return (
      <section data-testid="portfolio-empty" className="portfolio-empty">
        <h2>Entity Portfolio</h2>
        <p>No entities registered yet. Register your first managed entity to begin.</p>
      </section>
    );
  }

  return (
    <section data-testid="portfolio-status" className="portfolio-status">
      <header className="portfolio-header">
        <h2>Portfolio Roll-Up</h2>
        <span className={`portfolio-badge ${rollup.summary.portfolioClear ? "clear" : "attention"}`}>
          {rollup.summary.portfolioClear ? "Portfolio clear" : `${rollup.summary.attentionFlagCount} attention flags`}
        </span>
      </header>

      <div className="portfolio-summary">
        <div className="stat">
          <strong>{rollup.summary.totalEntities}</strong>
          <span>Entities</span>
        </div>
        {Object.entries(rollup.summary.byBand).map(([band, count]) => (
          <div key={band} className="stat">
            <strong>{count}</strong>
            <span>{band}</span>
          </div>
        ))}
      </div>

      <table className="portfolio-table">
        <thead>
          <tr>
            <th>Entity</th>
            <th>Type</th>
            <th>Regimes</th>
            <th>Band</th>
            <th>Governance</th>
            <th>Status</th>
            <th>Flags</th>
            <th>Deploy</th>
          </tr>
        </thead>
        <tbody>
          {rollup.entities.map((entity) => (
            <tr
              key={entity.id}
              data-holding={entity.isHoldingEntity ? "true" : "false"}
              onClick={() => onSelectEntity?.(entity.id)}
              className={entity.attentionFlagCount > 0 ? "has-flags" : ""}
            >
              <td>
                {entity.isHoldingEntity && <span className="holding-badge">Holding</span>}
                {entity.name}
                <small>{entity.vertical}</small>
              </td>
              <td>
                {entity.entityType ?? <span className="incomplete-type">incomplete</span>}
              </td>
              <td>
                {entity.regulatoryProfileIncomplete ? (
                  <span className="profile-incomplete">incomplete</span>
                ) : (
                  entity.regulatoryRegimes.slice(0, 2).join(", ") +
                  (entity.regulatoryRegimes.length > 2 ? "…" : "")
                )}
              </td>
              <td>{entity.band}</td>
              <td>{entity.governanceStatus}</td>
              <td>{entity.stateSummary}</td>
              <td>{entity.attentionFlagCount > 0 ? entity.attentionFlagCount : "—"}</td>
              <td>{entity.clearForAgentDeployment ? "clear" : <span className="deploy-blocked">blocked</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
