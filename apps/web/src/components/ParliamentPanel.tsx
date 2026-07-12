import { useCallback, useEffect, useState } from "react";

interface ParliamentPanelProps {
  entityId: string;
  apiBase: string;
  headers: Record<string, string>;
}

type StakeClass = "wiki_promote" | "financial_release" | "activation" | "doctrine";
type SessionStatus = "open" | "ready_for_seal" | "sealed" | "rejected" | "expired";
type VoteChoice = "aye" | "nay" | "abstain";
type StakeholderLens = "lp" | "patient" | "regulator" | "engineering" | "fiduciary";
type SealMode = "immediate" | "time_lock";

interface ParliamentSessionRow {
  id: string;
  entityId: string;
  topic: string;
  stakeClass: StakeClass;
  status: SessionStatus;
  createdBy: string;
  redTeamNay: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ParliamentVoteRow {
  id: string;
  sessionId: string;
  officerRole: string;
  agentId: string;
  vote: VoteChoice;
  rationale: string;
  stakeholderLens: StakeholderLens;
  createdAt: string;
}

interface SealRow {
  id: string;
  sessionId: string;
  sealedBy: string;
  sealedAt: string;
  mode: SealMode;
  executeAfter: string | null;
  cancelledAt: string | null;
  executedAt: string | null;
  humanInstructionId: string | null;
  overrideNote: string | null;
  correlationId: string | null;
  payload: Record<string, unknown>;
}

const STAKE_CLASSES: StakeClass[] = ["wiki_promote", "financial_release", "activation", "doctrine"];
const STAKEHOLDER_LENSES: StakeholderLens[] = ["lp", "patient", "regulator", "engineering", "fiduciary"];
const VOTE_CHOICES: VoteChoice[] = ["aye", "nay", "abstain"];

function sealStatusLabel(seal: SealRow | null): string {
  if (!seal) return "";
  if (seal.cancelledAt) return "cancelled";
  if (seal.executedAt) return "executed";
  if (seal.mode === "time_lock") return "time-locked";
  return "sealed";
}

export function ParliamentPanel({ entityId, apiBase, headers }: ParliamentPanelProps) {
  const [sessions, setSessions] = useState<ParliamentSessionRow[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [topic, setTopic] = useState("");
  const [stakeClass, setStakeClass] = useState<StakeClass>("doctrine");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [votes, setVotes] = useState<ParliamentVoteRow[]>([]);
  const [seal, setSeal] = useState<SealRow | null>(null);

  const [officerRole, setOfficerRole] = useState("compliance_prep");
  const [voteChoice, setVoteChoice] = useState<VoteChoice>("aye");
  const [stakeholderLens, setStakeholderLens] = useState<StakeholderLens>("engineering");
  const [rationale, setRationale] = useState("");

  const [timeLockHours, setTimeLockHours] = useState(4);
  const [overrideNote, setOverrideNote] = useState("");

  const jsonHeaders = { ...headers, "Content-Type": "application/json" };

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(`${apiBase}/api/v1/parliament`);
      url.searchParams.set("entityId", entityId);
      const res = await fetch(url, { headers });
      if (res.status === 404) {
        setUnavailable(true);
        setSessions([]);
        return;
      }
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { sessions: ParliamentSessionRow[] };
      setSessions(data.sessions ?? []);
      setUnavailable(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Parliament sessions");
    } finally {
      setLoading(false);
    }
  }, [apiBase, entityId, headers]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const loadDetail = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`${apiBase}/api/v1/parliament/${id}`, { headers });
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as { session: ParliamentSessionRow; votes: ParliamentVoteRow[]; seal: SealRow | null };
        setVotes(data.votes ?? []);
        setSeal(data.seal ?? null);
        setSessions((prev) => prev.map((s) => (s.id === id ? data.session : s)));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load session detail");
      }
    },
    [apiBase, headers],
  );

  const selectSession = async (id: string) => {
    setSelectedId(id);
    setOverrideNote("");
    await loadDetail(id);
  };

  const openSession = async () => {
    if (!topic.trim()) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/parliament`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ entityId, topic: topic.trim(), stakeClass }),
      });
      if (!res.ok) throw new Error(await res.text());
      const session = (await res.json()) as ParliamentSessionRow;
      setStatus(`Session opened: ${session.topic}`);
      setTopic("");
      await loadSessions();
      await selectSession(session.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Open session failed");
    } finally {
      setBusy(false);
    }
  };

  const castVote = async () => {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/parliament/${selectedId}/votes`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          officerRole,
          vote: voteChoice,
          rationale: rationale.trim() || undefined,
          stakeholderLens,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setStatus("Vote recorded");
      setRationale("");
      await loadDetail(selectedId);
      await loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cast vote failed");
    } finally {
      setBusy(false);
    }
  };

  const sealNow = async (mode: SealMode) => {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/parliament/${selectedId}/seal`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          mode,
          executeAfterHours: mode === "time_lock" ? timeLockHours : undefined,
          overrideNote: overrideNote.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? "Seal failed");
      }
      setStatus(mode === "immediate" ? "Sealed immediately" : `Sealed — time-locked ${timeLockHours}h`);
      await loadDetail(selectedId);
      await loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Seal failed");
    } finally {
      setBusy(false);
    }
  };

  const cancelSeal = async () => {
    if (!seal) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/seals/${seal.id}/cancel`, {
        method: "POST",
        headers: jsonHeaders,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? "Cancel seal failed");
      }
      setStatus("Seal cancelled — session rejected");
      if (selectedId) await loadDetail(selectedId);
      await loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel seal failed");
    } finally {
      setBusy(false);
    }
  };

  const selectedSession = sessions.find((s) => s.id === selectedId) ?? null;

  return (
    <section className="parliament-panel runtime-section" data-testid="parliament-panel">
      <h3>Parliament + Seal</h3>
      <p className="phi-note">
        Multi-officer, multi-stakeholder-lens deliberation before wiki promote / financial release /
        activation / doctrine actions — sealed by a human director, immediately or with a
        cancellable time-lock.
      </p>

      {error && (
        <p className="wiki-error" role="alert">
          {error}
        </p>
      )}
      {status && <p className="wiki-status">{status}</p>}

      {unavailable ? (
        <p className="wiki-empty">Parliament API is not deployed yet.</p>
      ) : (
        <>
          <div className="parliament-open-form">
            <label>
              Topic
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="What is Parliament deciding?"
                disabled={busy}
              />
            </label>
            <label>
              Stake class
              <select value={stakeClass} onChange={(e) => setStakeClass(e.target.value as StakeClass)} disabled={busy}>
                {STAKE_CLASSES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={openSession} disabled={busy || !topic.trim()}>
              Open session
            </button>
          </div>

          {loading && sessions.length === 0 ? (
            <p className="wiki-empty">Loading Parliament sessions…</p>
          ) : sessions.length === 0 ? (
            <p className="wiki-empty">No Parliament sessions for this entity yet.</p>
          ) : (
            <ul className="parliament-session-list" data-testid="parliament-session-list">
              {sessions.map((s) => (
                <li key={s.id} className={s.id === selectedId ? "active" : undefined}>
                  <button type="button" onClick={() => selectSession(s.id)}>
                    <strong>{s.topic}</strong>
                    <small>
                      {s.stakeClass} · <span className={`status-pill status-${s.status}`}>{s.status}</span>
                      {s.redTeamNay && " · red-team NAY"}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {selectedSession && (
            <div className="parliament-detail" data-testid="parliament-detail">
              <h4>
                {selectedSession.topic} — <span className={`status-pill status-${selectedSession.status}`}>{selectedSession.status}</span>
              </h4>

              <ul className="parliament-vote-list">
                {votes.length === 0 && <li className="wiki-empty">No votes yet.</li>}
                {votes.map((v) => (
                  <li key={v.id}>
                    <span>
                      <strong>{v.officerRole}</strong> ({v.stakeholderLens}) —{" "}
                      <span className={`vote-badge vote-${v.vote}`}>{v.vote}</span>
                      {v.rationale && <em> — {v.rationale}</em>}
                    </span>
                  </li>
                ))}
              </ul>

              {(selectedSession.status === "open" || selectedSession.status === "ready_for_seal") && (
                <div className="parliament-vote-form">
                  <label>
                    Officer role
                    <input value={officerRole} onChange={(e) => setOfficerRole(e.target.value)} disabled={busy} />
                  </label>
                  <label>
                    Stakeholder lens
                    <select
                      value={stakeholderLens}
                      onChange={(e) => setStakeholderLens(e.target.value as StakeholderLens)}
                      disabled={busy}
                    >
                      {STAKEHOLDER_LENSES.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Vote
                    <select value={voteChoice} onChange={(e) => setVoteChoice(e.target.value as VoteChoice)} disabled={busy}>
                      {VOTE_CHOICES.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Rationale
                    <input value={rationale} onChange={(e) => setRationale(e.target.value)} disabled={busy} />
                  </label>
                  <button type="button" onClick={castVote} disabled={busy}>
                    Cast vote
                  </button>
                </div>
              )}

              {selectedSession.status === "ready_for_seal" && (
                <div className="parliament-seal-form">
                  {selectedSession.redTeamNay && (
                    <label>
                      Override note (required — red-team nay recorded)
                      <input
                        value={overrideNote}
                        onChange={(e) => setOverrideNote(e.target.value)}
                        disabled={busy}
                        placeholder="Why the director is sealing over the red-team objection"
                      />
                    </label>
                  )}
                  <div className="actions">
                    <button
                      type="button"
                      onClick={() => sealNow("immediate")}
                      disabled={busy || (selectedSession.redTeamNay && !overrideNote.trim())}
                    >
                      Seal immediate
                    </button>
                    <label className="time-lock-hours">
                      Hours
                      <input
                        type="number"
                        min={1}
                        max={720}
                        value={timeLockHours}
                        onChange={(e) => setTimeLockHours(Number(e.target.value))}
                        disabled={busy}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => sealNow("time_lock")}
                      disabled={busy || (selectedSession.redTeamNay && !overrideNote.trim())}
                    >
                      Seal time-lock
                    </button>
                  </div>
                </div>
              )}

              {seal && (
                <div className="parliament-seal-status" data-testid="parliament-seal-status">
                  <span>
                    Seal: <strong>{sealStatusLabel(seal)}</strong> ({seal.mode})
                    {seal.executeAfter && !seal.executedAt && !seal.cancelledAt && (
                      <> — unlocks {new Date(seal.executeAfter).toLocaleString()}</>
                    )}
                  </span>
                  {seal.mode === "time_lock" && !seal.executedAt && !seal.cancelledAt && (
                    <button type="button" onClick={cancelSeal} disabled={busy}>
                      Cancel seal
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
