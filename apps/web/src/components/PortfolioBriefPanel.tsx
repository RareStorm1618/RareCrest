import { useMemo } from "react";
import type { PortfolioRollup } from "@rarecrest/contracts";
import { buildPortfolioBrief } from "../lib/portfolio-brief.js";
import { navigate } from "../lib/routing.js";
import { rememberEntity } from "../lib/entity-memory.js";
import { ResultCard, type ResultCardMetric } from "./ResultCard.js";

interface PortfolioBriefPanelProps {
  rollup: PortfolioRollup;
}

export function PortfolioBriefPanel({ rollup }: PortfolioBriefPanelProps) {
  const brief = useMemo(() => buildPortfolioBrief(rollup), [rollup]);

  const schemaMetrics: ResultCardMetric[] = [
    { label: "Total entities", value: brief.schema.totalEntities as number },
    { label: "Attention flags", value: brief.schema.attentionFlagCount as number },
    { label: "Portfolio clear", value: brief.schema.portfolioClear ? "Yes" : "No" },
    { label: "Critical signals", value: brief.schema.criticalCount as number },
  ];

  return (
    <section className="portfolio-brief" data-testid="portfolio-brief">
      <header>
        <p className="eyebrow">Director intelligence brief</p>
        <h2>{brief.headline}</h2>
        <p className="brief-narrative">{brief.narrative}</p>
      </header>
      <div className="brief-tracks">
        <div className="signal-list" aria-label="Priority signals">
          {brief.signals.map((signal) => (
            <button
              key={signal.id}
              type="button"
              className={`signal-card severity-${signal.severity}`}
              onClick={() => {
                if (!signal.entityId) return;
                rememberEntity({
                  id: signal.entityId,
                  name: rollup.entities.find((e) => e.id === signal.entityId)?.name ?? signal.entityId,
                });
                navigate({
                  name: signal.suggestedRoute ?? "diagnostics",
                  entityId: signal.entityId,
                });
              }}
            >
              <strong>{signal.title}</strong>
              <span>{signal.detail}</span>
            </button>
          ))}
        </div>
        <aside className="brief-schema" aria-label="Machine schema">
          <ResultCard title="Structured brief" metrics={schemaMetrics} raw={brief.schema} />
          <p className="schema-note">Generated {new Date(brief.generatedAt).toLocaleTimeString()}</p>
        </aside>
      </div>
    </section>
  );
}
