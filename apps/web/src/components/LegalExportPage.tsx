import { useCallback, useEffect, useState } from "react";

interface LegalExportPageProps {
  entityId: string;
  entityName: string;
  apiBase: string;
  headers: Record<string, string>;
}

interface LegalMatter {
  id: string;
  entityId: string;
  title: string;
  status: string;
  disclaimer: string;
  createdAt: string;
}

interface RegulatoryCalendarEvent {
  id: string;
  entityId: string;
  regime: string;
  eventType: string;
  dueAt: string;
  cadence: string;
  priority: string;
  createdAt: string;
}

interface ExportResult {
  packId: string;
  format: string;
  downloadUrl: string;
  generatedAt: string;
  contentHash: string;
}

type Tab = "legal" | "export";

export function LegalExportPage({ entityId, entityName, apiBase, headers }: LegalExportPageProps) {
  const [tab, setTab] = useState<Tab>("legal");
  const [matters, setMatters] = useState<LegalMatter[]>([]);
  const [calendar, setCalendar] = useState<RegulatoryCalendarEvent[]>([]);
  const [newMatterTitle, setNewMatterTitle] = useState("");
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [exportFormat, setExportFormat] = useState<"markdown" | "pdf">("markdown");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const jsonHeaders = { ...headers, "Content-Type": "application/json" };

  const loadLegal = useCallback(async () => {
    setError(null);
    try {
      const [mattersRes, calendarRes] = await Promise.all([
        fetch(`${apiBase}/api/v1/legal/matters/${entityId}`, { headers }),
        fetch(`${apiBase}/api/v1/legal/regulatory-calendar/${entityId}`, { headers }),
      ]);
      if (mattersRes.ok) {
        const data = (await mattersRes.json()) as { matters: LegalMatter[] };
        setMatters(data.matters ?? []);
      }
      if (calendarRes.ok) {
        const data = (await calendarRes.json()) as { events: RegulatoryCalendarEvent[] };
        setCalendar(data.events ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load legal matters");
    }
  }, [apiBase, entityId, headers]);

  useEffect(() => {
    loadLegal();
  }, [loadLegal]);

  const createMatter = async () => {
    if (!newMatterTitle.trim()) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/legal/matters`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ title: newMatterTitle.trim(), entityId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? "Create matter failed");
      }
      setNewMatterTitle("");
      setStatus("Matter opened");
      await loadLegal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create matter failed");
    } finally {
      setBusy(false);
    }
  };

  const runExport = async () => {
    setBusy(true);
    setError(null);
    setStatus(null);
    setExportResult(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/exports/oversight-pack`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ entityId, format: exportFormat }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? "Export failed");
      }
      const data = (await res.json()) as ExportResult;
      setExportResult(data);
      setStatus("Oversight pack generated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="legal-export-page" data-testid="legal-export-page">
      <header className="page-header">
        <h2>Legal &amp; Export — {entityName}</h2>
        <p>Legal matters, regulatory calendar, and director-owned oversight pack export.</p>
      </header>

      <div className="tab-bar" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "legal"}
          className={tab === "legal" ? "active" : undefined}
          onClick={() => setTab("legal")}
        >
          Legal
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "export"}
          className={tab === "export" ? "active" : undefined}
          onClick={() => setTab("export")}
        >
          Export
        </button>
      </div>

      {error && (
        <p className="wiki-error" role="alert">
          {error}
        </p>
      )}
      {status && <p className="wiki-status">{status}</p>}

      {tab === "legal" && (
        <div className="legal-tab">
          <div className="runtime-section">
            <h3>Open matters</h3>
            {matters.length === 0 ? (
              <p className="wiki-empty">No legal matters recorded.</p>
            ) : (
              <div className="runtime-card-grid">
                {matters.map((matter) => (
                  <div key={matter.id} className="runtime-card matter-card">
                    <strong>{matter.title}</strong>
                    <span className={`status-pill matter-status-${matter.status}`}>{matter.status}</span>
                    <small>{matter.disclaimer}</small>
                  </div>
                ))}
              </div>
            )}
            <div className="add-regime">
              <input
                value={newMatterTitle}
                onChange={(e) => setNewMatterTitle(e.target.value)}
                placeholder="New matter title"
                disabled={busy}
              />
              <button type="button" onClick={createMatter} disabled={busy || !newMatterTitle.trim()}>
                Open matter
              </button>
            </div>
          </div>

          <div className="runtime-section">
            <h3>Regulatory calendar</h3>
            {calendar.length === 0 ? (
              <p className="wiki-empty">No regulatory calendar events scheduled.</p>
            ) : (
              <div className="runtime-card-grid">
                {calendar.map((event) => (
                  <div key={event.id} className="runtime-card">
                    <strong>{event.regime}</strong>
                    <span>{event.eventType}</span>
                    <small>
                      Due {new Date(event.dueAt).toLocaleDateString()} · {event.priority}
                    </small>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "export" && (
        <div className="export-tab runtime-section">
          <h3>Oversight pack export</h3>
          <label>
            Format
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as "markdown" | "pdf")}
              disabled={busy}
            >
              <option value="markdown">Markdown</option>
              <option value="pdf">PDF</option>
            </select>
          </label>
          <button type="button" onClick={runExport} disabled={busy}>
            {busy ? "Generating…" : "Generate oversight pack"}
          </button>
          {exportResult && (
            <div className="export-result" data-testid="export-result">
              <p>
                Generated {new Date(exportResult.generatedAt).toLocaleString()} · hash{" "}
                {exportResult.contentHash.slice(0, 12)}…
              </p>
              <a href={exportResult.downloadUrl} target="_blank" rel="noreferrer" className="download-link">
                Download {exportResult.format} pack
              </a>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
