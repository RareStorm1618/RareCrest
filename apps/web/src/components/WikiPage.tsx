import { useCallback, useEffect, useMemo, useState } from "react";

interface WikiPageProps {
  entityId: string;
  entityName: string;
  vertical: string;
  apiBase: string;
  headers: Record<string, string>;
}

interface WikiPageRow {
  id: string;
  slug: string;
  title: string;
  pageType: string;
  status: string;
  sensitivity: string;
  updatedAt: string;
}

interface QueryCitation {
  slug: string;
  title: string;
  score?: number;
}

export function WikiPage({ entityId, entityName, vertical, apiBase, headers }: WikiPageProps) {
  const [namespace, setNamespace] = useState(`entity/${entityId}/working`);
  const [pages, setPages] = useState<WikiPageRow[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [pageBody, setPageBody] = useState<string>("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [citations, setCitations] = useState<QueryCitation[]>([]);
  const [doctor, setDoctor] = useState<Record<string, unknown> | null>(null);
  const [ingestTitle, setIngestTitle] = useState("");
  const [ingestBody, setIngestBody] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const jsonHeaders = useMemo(
    () => ({ ...headers, "Content-Type": "application/json", Accept: "application/json" }),
    [headers],
  );

  const loadPages = useCallback(async (ns: string) => {
    const url = new URL(`${apiBase}/api/v1/wiki/pages`);
    url.searchParams.set("namespace", ns);
    url.searchParams.set("vertical", vertical);
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(await res.text());
    const data = (await res.json()) as { pages: WikiPageRow[] };
    setPages(data.pages ?? []);
  }, [apiBase, headers, vertical]);

  const resolveNamespace = useCallback(async () => {
    const res = await fetch(`${apiBase}/api/v1/wiki/namespace`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ vertical, entityId }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = (await res.json()) as { namespace: string };
    setNamespace(data.namespace);
    return data.namespace;
  }, [apiBase, entityId, jsonHeaders, vertical]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setError(null);
        const ns = await resolveNamespace();
        if (cancelled) return;
        await loadPages(ns);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load wiki");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadPages, resolveNamespace]);

  const openPage = async (slug: string) => {
    setSelectedSlug(slug);
    setBusy(true);
    setError(null);
    try {
      const url = new URL(`${apiBase}/api/v1/wiki/pages/${encodeURIComponent(slug)}`);
      url.searchParams.set("namespace", namespace);
      url.searchParams.set("vertical", vertical);
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { body: string; title: string };
      setPageBody(data.body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open page");
    } finally {
      setBusy(false);
    }
  };

  const runQuery = async () => {
    if (!question.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/wiki/query`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ namespace, vertical, question, fileAnswer: true }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { answer: string; citations: QueryCitation[] };
      setAnswer(data.answer);
      setCitations(data.citations ?? []);
      await loadPages(namespace);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Query failed");
    } finally {
      setBusy(false);
    }
  };

  const runIngest = async () => {
    if (!ingestTitle.trim() || !ingestBody.trim()) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/wiki/ingest`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          vertical,
          entityId,
          title: ingestTitle,
          body: ingestBody,
          sourceKind: "document",
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { pagesTouched: number; summary: string };
      setStatus(`Ingested ${data.pagesTouched} pages — ${data.summary}`);
      setIngestTitle("");
      setIngestBody("");
      await loadPages(namespace);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ingest failed");
    } finally {
      setBusy(false);
    }
  };

  const runDoctor = async () => {
    setBusy(true);
    setError(null);
    try {
      const url = new URL(`${apiBase}/api/v1/wiki/doctor`);
      url.searchParams.set("namespace", namespace);
      url.searchParams.set("vertical", vertical);
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(await res.text());
      setDoctor((await res.json()) as Record<string, unknown>);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Doctor failed");
    } finally {
      setBusy(false);
    }
  };

  const runLint = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/wiki/lint`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ namespace, vertical }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { score: number; findings: unknown[] };
      setStatus(`Lint score ${data.score} · ${data.findings?.length ?? 0} findings`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lint failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="wiki-page" data-testid="wiki-page">
      <header className="page-header">
        <h2>Wiki Companion</h2>
        <p>
          Federated Canon Wiki for <strong>{entityName}</strong> — namespace{" "}
          <code>{namespace}</code>. Citations are wikilinks; RareCrest remains system of record.
        </p>
      </header>

      {error && (
        <p className="wiki-error" role="alert">
          {error}
        </p>
      )}
      {status && <p className="wiki-status">{status}</p>}

      <div className="wiki-layout">
        <aside className="wiki-sidebar">
          <div className="wiki-toolbar">
            <button type="button" disabled={busy} onClick={() => loadPages(namespace)}>
              Refresh
            </button>
            <button type="button" disabled={busy} onClick={runLint}>
              Lint
            </button>
            <button type="button" disabled={busy} onClick={runDoctor}>
              Doctor
            </button>
          </div>
          <ul className="wiki-page-list">
            {pages.map((page) => (
              <li key={page.id}>
                <button
                  type="button"
                  className={selectedSlug === page.slug ? "active" : undefined}
                  onClick={() => openPage(page.slug)}
                >
                  <span>{page.title}</span>
                  <small>
                    {page.pageType} · {page.status}
                  </small>
                </button>
              </li>
            ))}
            {pages.length === 0 && <li className="wiki-empty">No pages yet — ingest below.</li>}
          </ul>
        </aside>

        <div className="wiki-main">
          <div className="wiki-query">
            <label htmlFor="wiki-question">Ask the wiki</label>
            <div className="wiki-query-row">
              <input
                id="wiki-question"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Question grounded in this namespace…"
              />
              <button type="button" disabled={busy || !question.trim()} onClick={runQuery}>
                Query
              </button>
            </div>
            {citations.length > 0 && (
              <p className="wiki-citations">
                Citations:{" "}
                {citations.map((c) => (
                  <button key={c.slug} type="button" className="wiki-cite" onClick={() => openPage(c.slug)}>
                    [[{c.title}]]
                  </button>
                ))}
              </p>
            )}
            {answer && <pre className="wiki-answer">{answer}</pre>}
          </div>

          {selectedSlug && (
            <article className="wiki-article">
              <h3>{selectedSlug}</h3>
              <pre>{pageBody}</pre>
            </article>
          )}

          {doctor && (
            <pre className="wiki-doctor">{JSON.stringify(doctor, null, 2)}</pre>
          )}

          <div className="wiki-ingest">
            <h3>Ingest raw source</h3>
            <input
              value={ingestTitle}
              onChange={(e) => setIngestTitle(e.target.value)}
              placeholder="Title"
            />
            <textarea
              value={ingestBody}
              onChange={(e) => setIngestBody(e.target.value)}
              placeholder="Markdown body (immutable raw → compiled wiki pages)"
              rows={6}
            />
            <button type="button" disabled={busy || !ingestTitle.trim() || !ingestBody.trim()} onClick={runIngest}>
              Ingest
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
