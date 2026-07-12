export interface ResultCardMetric {
  label: string;
  value: string | number;
}

interface ResultCardProps {
  title: string;
  summary?: string;
  metrics?: ResultCardMetric[];
  raw?: unknown;
}

/** Shared result surface for Design Studio (and similar) panels: a titled summary
 * with optional at-a-glance metrics, and the full server response tucked behind
 * an expandable details disclosure rather than a bare JSON dump. */
export function ResultCard({ title, summary, metrics, raw }: ResultCardProps) {
  return (
    <div className="result-card" data-testid="result-card">
      <h4>{title}</h4>
      {summary && <p className="result-card-summary">{summary}</p>}
      {metrics && metrics.length > 0 && (
        <dl className="result-card-metrics">
          {metrics.map((metric) => (
            <div key={metric.label} className="result-card-metric">
              <dt>{metric.label}</dt>
              <dd>{String(metric.value)}</dd>
            </div>
          ))}
        </dl>
      )}
      {raw !== undefined && (
        <details className="result-card-raw">
          <summary>Raw response</summary>
          <pre>{JSON.stringify(raw, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}
