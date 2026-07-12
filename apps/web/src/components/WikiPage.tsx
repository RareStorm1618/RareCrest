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

const BRIDGE_VERTICALS = ["rarestorm", "rareangels", "rareedge", "hopecoin", "healkids", "holding"] as const;

interface ContradictionRow {
  id: string;
  namespace?: string;
  pageASlug?: string;
  pageATitle?: string;
  pageBSlug?: string;
  pageBTitle?: string;
  claimA?: string;
  claimB?: string;
  status?: string;
  createdAt?: string;
}

export function WikiPage({ entityId, entityName, vertical, apiBase, headers }: WikiPageProps) {
  const isAgentRole = headers["x-user-role"] === "agent";
  const [namespace, setNamespace] = useState(`entity/${entityId}/working`);
  const [activeVertical, setActiveVertical] = useState(vertical);
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

  const [directorOpen, setDirectorOpen] = useState(false);

  const [bridgeFromVertical, setBridgeFromVertical] = useState<string>(vertical);
  const [bridgeToVertical, setBridgeToVertical] = useState<string>("holding");
  const [bridgeTitle, setBridgeTitle] = useState("");
  const [bridgeBody, setBridgeBody] = useState("");
  const [bridgeSlug, setBridgeSlug] = useState<string | null>(null);
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const [bridgeBusy, setBridgeBusy] = useState(false);

  const [contradictionPageA, setContradictionPageA] = useState("");
  const [contradictionPageB, setContradictionPageB] = useState("");
  const [contradictionClaimA, setContradictionClaimA] = useState("");
  const [contradictionClaimB, setContradictionClaimB] = useState("");
  const [contradictionStatus, setContradictionStatus] = useState<string | null>(null);
  const [contradictionError, setContradictionError] = useState<string | null>(null);
  const [contradictionBusy, setContradictionBusy] = useState(false);
  const [contradictions, setContradictions] = useState<ContradictionRow[]>([]);
  const [contradictionsListError, setContradictionsListError] = useState<string | null>(null);

  const jsonHeaders = useMemo(
    () => ({ ...headers, "Content-Type": "application/json", Accept: "application/json" }),
    [headers],
  );

  useEffect(() => {
    setActiveVertical(vertical);
    setBridgeFromVertical(vertical);
  }, [vertical, entityId]);

  const loadPages = useCallback(async (ns: string) => {
    const url = new URL(`${apiBase}/api/v1/wiki/pages`);
    url.searchParams.set("namespace", ns);
    url.searchParams.set("vertical", activeVertical);
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(await res.text());
    const data = (await res.json()) as { pages: WikiPageRow[] };
    setPages(data.pages ?? []);
  }, [apiBase, headers, activeVertical]);

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
      url.searchParams.set("vertical", activeVertical);
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
        body: JSON.stringify({ namespace, vertical: activeVertical, question, fileAnswer: true }),
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
      url.searchParams.set("vertical", activeVertical);
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(await res.text());
      setDoctor((await res.json()) as Record<string, unknown>);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Doctor failed");
    } finally {
      setBusy(false);
    }
  };

  const runPromote = async () => {
    if (!selectedSlug) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/wiki/promote`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          namespace,
          vertical: activeVertical,
          slug: selectedSlug,
          reason: "Director promote from Wiki Companion",
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { status: string };
      setStatus(`Promote: ${data.status}`);
      await loadPages(namespace);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Promote failed");
    } finally {
      setBusy(false);
    }
  };

  const runIngestTraces = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/wiki/ingest/decision-traces`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ vertical, entityId, limit: 50 }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { ingested: number; skipped: number };
      setStatus(`Decision traces: ingested ${data.ingested}, skipped ${data.skipped}`);
      await loadPages(namespace);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Trace ingest failed");
    } finally {
      setBusy(false);
    }
  };

  const runVaultPackage = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/wiki/obsidian/vault-package`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ namespace: "holding/canon", vertical: "holding", async: false }),
      });
      if (!res.ok && res.status !== 202) throw new Error(await res.text());
      let data = (await res.json()) as {
        status?: string;
        jobId?: string;
        contentSha256?: string;
        fileCount?: number;
        downloadToken?: string;
        note?: string;
        result?: {
          contentSha256?: string;
          fileCount?: number;
          downloadToken?: string;
        };
      };
      if (data.status === "pending" && data.jobId) {
        setStatus(`Vault package building (job ${data.jobId.slice(0, 8)}…) — polling…`);
        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 1000));
          const poll = await fetch(`${apiBase}/api/v1/wiki/obsidian/vault-package/jobs/${data.jobId}`, {
            headers,
          });
          if (!poll.ok) throw new Error(await poll.text());
          const job = (await poll.json()) as {
            status: string;
            error?: string;
            result?: typeof data;
          };
          if (job.status === "failed") throw new Error(job.error ?? "Vault package job failed");
          if (job.status === "ready") {
            data = { status: "ready", ...(job.result ?? {}) };
            break;
          }
        }
        if (data.status === "pending") throw new Error("Vault package job timed out");
      }
      const sha = data.contentSha256 ?? "";
      const token = data.downloadToken ?? "";
      setStatus(
        `Encrypted vault package ready · ${data.fileCount ?? 0} files · sha ${sha.slice(0, 12)}… · token ${token.slice(0, 8)}…`,
      );
      setDoctor({ vaultPackage: data });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vault package failed (director + holding/canon only)");
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
        body: JSON.stringify({ namespace, vertical: activeVertical }),
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

  const switchToEntityWorking = async () => {
    setBusy(true);
    setError(null);
    try {
      setActiveVertical(vertical);
      const ns = await resolveNamespace();
      const url = new URL(`${apiBase}/api/v1/wiki/pages`);
      url.searchParams.set("namespace", ns);
      url.searchParams.set("vertical", vertical);
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { pages: WikiPageRow[] };
      setPages(data.pages ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to switch to entity working namespace");
    } finally {
      setBusy(false);
    }
  };

  const switchToHoldingCanon = async () => {
    setBusy(true);
    setError(null);
    try {
      setNamespace("holding/canon");
      setActiveVertical("holding");
      const url = new URL(`${apiBase}/api/v1/wiki/pages`);
      url.searchParams.set("namespace", "holding/canon");
      url.searchParams.set("vertical", "holding");
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { pages: WikiPageRow[] };
      setPages(data.pages ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to switch to holding canon (director + holding vertical only)");
    } finally {
      setBusy(false);
    }
  };

  const createBridge = async () => {
    if (!bridgeTitle.trim() || !bridgeBody.trim()) return;
    setBridgeBusy(true);
    setBridgeError(null);
    setBridgeSlug(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/wiki/bridges`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          fromVertical: bridgeFromVertical,
          toVertical: bridgeToVertical,
          title: bridgeTitle,
          redactedBody: bridgeBody,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { page?: { slug?: string } };
      setBridgeSlug(data.page?.slug ?? null);
      setBridgeTitle("");
      setBridgeBody("");
    } catch (err) {
      setBridgeError(err instanceof Error ? err.message : "Bridge projection failed (director only)");
    } finally {
      setBridgeBusy(false);
    }
  };

  const loadContradictions = useCallback(async () => {
    try {
      const url = new URL(`${apiBase}/api/v1/wiki/contradictions`);
      url.searchParams.set("namespace", namespace);
      url.searchParams.set("vertical", activeVertical);
      const res = await fetch(url, { headers });
      if (res.status === 404) {
        // Tolerate environments where this endpoint hasn't shipped yet.
        setContradictionsListError("Contradictions list unavailable — API not deployed yet");
        setContradictions([]);
        return;
      }
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { contradictions?: ContradictionRow[] };
      setContradictions(data.contradictions ?? []);
      setContradictionsListError(null);
    } catch (err) {
      setContradictionsListError(err instanceof Error ? err.message : "Failed to load contradictions");
      setContradictions([]);
    }
  }, [apiBase, headers, namespace, activeVertical]);

  useEffect(() => {
    if (!directorOpen || isAgentRole) return;
    loadContradictions();
  }, [directorOpen, isAgentRole, loadContradictions]);

  const createContradiction = async () => {
    if (
      !contradictionPageA.trim() ||
      !contradictionPageB.trim() ||
      !contradictionClaimA.trim() ||
      !contradictionClaimB.trim()
    ) {
      return;
    }
    setContradictionBusy(true);
    setContradictionError(null);
    setContradictionStatus(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/wiki/contradictions`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          namespace,
          vertical: activeVertical,
          pageASlug: contradictionPageA,
          pageBSlug: contradictionPageB,
          claimA: contradictionClaimA,
          claimB: contradictionClaimB,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setContradictionStatus("Contradiction flagged on both pages");
      setContradictionPageA("");
      setContradictionPageB("");
      setContradictionClaimA("");
      setContradictionClaimB("");
      await loadContradictions();
    } catch (err) {
      setContradictionError(err instanceof Error ? err.message : "Flag contradiction failed");
    } finally {
      setContradictionBusy(false);
    }
  };

  const resolveContradiction = async (id: string) => {
    const note = window.prompt("Resolution note (optional)") ?? undefined;
    try {
      const res = await fetch(`${apiBase}/api/v1/wiki/contradictions/${encodeURIComponent(id)}/resolve`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          namespace,
          vertical: activeVertical,
          resolution: "resolved",
          note: note?.trim() || undefined,
        }),
      });
      if (res.status === 404) {
        setContradictionsListError("Resolve endpoint unavailable — API not deployed yet");
        return;
      }
      if (!res.ok) throw new Error(await res.text());
      await loadContradictions();
    } catch (err) {
      setContradictionsListError(err instanceof Error ? err.message : "Resolve contradiction failed");
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
            {!isAgentRole && (
              <button type="button" disabled={busy || !selectedSlug} onClick={runPromote}>
                Promote
              </button>
            )}
            <button type="button" disabled={busy} onClick={runIngestTraces}>
              Sync traces
            </button>
            {!isAgentRole && (
              <button type="button" disabled={busy} onClick={runVaultPackage}>
                Vault pkg
              </button>
            )}
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

      {!isAgentRole && (
        <details
          className="director-tools"
          data-testid="director-tools"
          onToggle={(e) => setDirectorOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary>Director tools</summary>
          <div className="director-tools-body">
            <section className="director-tools-section">
              <h4>Namespace</h4>
              <div className="wiki-toolbar">
                <button
                  type="button"
                  className={namespace !== "holding/canon" ? "active" : undefined}
                  disabled={busy}
                  onClick={switchToEntityWorking}
                >
                  Entity working
                </button>
                <button
                  type="button"
                  className={namespace === "holding/canon" ? "active" : undefined}
                  disabled={busy}
                  onClick={switchToHoldingCanon}
                >
                  Holding canon
                </button>
              </div>
            </section>

            <section className="director-tools-section" data-testid="bridge-projection-form">
              <h4>Bridge projection</h4>
              <div className="director-tools-grid">
                <label>
                  From vertical
                  <select
                    value={bridgeFromVertical}
                    onChange={(e) => setBridgeFromVertical(e.target.value)}
                    disabled={bridgeBusy}
                  >
                    {BRIDGE_VERTICALS.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  To vertical
                  <select
                    value={bridgeToVertical}
                    onChange={(e) => setBridgeToVertical(e.target.value)}
                    disabled={bridgeBusy}
                  >
                    {BRIDGE_VERTICALS.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Title
                <input
                  value={bridgeTitle}
                  onChange={(e) => setBridgeTitle(e.target.value)}
                  disabled={bridgeBusy}
                  placeholder="Bridge projection title"
                />
              </label>
              <label>
                Redacted body
                <textarea
                  value={bridgeBody}
                  onChange={(e) => setBridgeBody(e.target.value)}
                  disabled={bridgeBusy}
                  placeholder="Cross-vertical safe, redacted summary"
                  rows={4}
                />
              </label>
              <button
                type="button"
                disabled={bridgeBusy || !bridgeTitle.trim() || !bridgeBody.trim()}
                onClick={createBridge}
              >
                Create bridge projection
              </button>
              {bridgeSlug && (
                <p className="wiki-status">
                  Bridge created: <code>{bridgeSlug}</code>
                </p>
              )}
              {bridgeError && (
                <p className="wiki-error" role="alert">
                  {bridgeError}
                </p>
              )}
            </section>

            <section className="director-tools-section" data-testid="contradictions-panel">
              <h4>Contradictions</h4>
              <div className="director-tools-grid">
                <label>
                  Page A slug
                  <input
                    value={contradictionPageA}
                    onChange={(e) => setContradictionPageA(e.target.value)}
                    disabled={contradictionBusy}
                  />
                </label>
                <label>
                  Page B slug
                  <input
                    value={contradictionPageB}
                    onChange={(e) => setContradictionPageB(e.target.value)}
                    disabled={contradictionBusy}
                  />
                </label>
                <label>
                  Claim A
                  <input
                    value={contradictionClaimA}
                    onChange={(e) => setContradictionClaimA(e.target.value)}
                    disabled={contradictionBusy}
                  />
                </label>
                <label>
                  Claim B
                  <input
                    value={contradictionClaimB}
                    onChange={(e) => setContradictionClaimB(e.target.value)}
                    disabled={contradictionBusy}
                  />
                </label>
              </div>
              <button
                type="button"
                disabled={
                  contradictionBusy ||
                  !contradictionPageA.trim() ||
                  !contradictionPageB.trim() ||
                  !contradictionClaimA.trim() ||
                  !contradictionClaimB.trim()
                }
                onClick={createContradiction}
              >
                Flag contradiction
              </button>
              {contradictionStatus && <p className="wiki-status">{contradictionStatus}</p>}
              {contradictionError && (
                <p className="wiki-error" role="alert">
                  {contradictionError}
                </p>
              )}

              <h5>Open contradictions</h5>
              {contradictionsListError && <p className="wiki-empty">{contradictionsListError}</p>}
              {!contradictionsListError && contradictions.length === 0 && (
                <p className="wiki-empty">No open contradictions.</p>
              )}
              {contradictions.length > 0 && (
                <ul className="contradiction-list">
                  {contradictions.map((c) => (
                    <li key={c.id}>
                      <span>
                        {c.pageATitle ?? c.pageASlug ?? "?"} ↔ {c.pageBTitle ?? c.pageBSlug ?? "?"}
                        {c.status && c.status !== "open" && ` (${c.status})`}
                      </span>
                      {(!c.status || c.status === "open") && (
                        <button type="button" onClick={() => resolveContradiction(c.id)}>
                          Resolve
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </details>
      )}
    </section>
  );
}
