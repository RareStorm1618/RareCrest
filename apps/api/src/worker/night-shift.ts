import type { DatabaseClient } from "@rarecrest/db";
import { ParliamentService } from "../services/parliament.js";
import { AsyncJobService } from "../services/async-jobs.js";
import { anchorProvenanceRoot } from "../services/provenance.js";

export interface NightShiftDeps {
  parliament?: ParliamentService;
  asyncJobs?: AsyncJobService;
  /** Async jobs stuck in pending/running past this window are marked failed. Default 60. */
  staleAfterMinutes?: number;
}

export interface NightShiftSealResult {
  sealId: string;
  sessionId: string;
  status: "executed" | "failed";
  detail?: string;
}

export interface NightShiftResult {
  sealsExecuted: number;
  sealsFailed: number;
  sealResults: NightShiftSealResult[];
  staleJobsMarked: number;
  provenanceRootId: string | null;
  ranAt: string;
}

/**
 * EXO Wave A night-shift pass: the unattended, periodic counterpart to the director-triggered
 * `/api/v1/seals/due/execute` and ad-hoc job cleanup. Deliberately narrow scope — execute
 * time-locked seals whose cooling-off window has elapsed (reusing
 * `ParliamentService.listDueSeals`/`executeSeal`, so the same fail-closed time-lock and
 * effect-digest checks apply), and mark stale async jobs. It does *not* attempt the
 * wiki_promote side-effect that the director-triggered `/seals/due/execute` route performs —
 * that stays a human-triggered action; the night shift only advances the seal's own state.
 */
export async function runNightShift(
  db: DatabaseClient,
  deps: NightShiftDeps = {},
): Promise<NightShiftResult> {
  const parliament = deps.parliament ?? new ParliamentService(db);
  const asyncJobs = deps.asyncJobs ?? new AsyncJobService(db);
  const staleAfterMinutes = deps.staleAfterMinutes ?? 60;

  const due = await parliament.listDueSeals();
  const sealResults: NightShiftSealResult[] = [];
  for (const seal of due) {
    try {
      const executed = await parliament.executeSeal(seal.id);
      sealResults.push({ sealId: executed.id, sessionId: executed.sessionId, status: "executed" });
    } catch (err) {
      sealResults.push({
        sealId: seal.id,
        sessionId: seal.sessionId,
        status: "failed",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const staleJobsMarked = await asyncJobs.markStale(staleAfterMinutes);

  let provenanceRootId: string | null = null;
  try {
    const root = await anchorProvenanceRoot(db, { periodHours: 24 });
    provenanceRootId = root.id;
  } catch {
    // Anchoring is best-effort in night-shift so seal execution still completes if
    // provenance tables are mid-migration; director can POST /provenance/root/anchor.
  }

  return {
    sealsExecuted: sealResults.filter((r) => r.status === "executed").length,
    sealsFailed: sealResults.filter((r) => r.status === "failed").length,
    sealResults,
    staleJobsMarked,
    provenanceRootId,
    ranAt: new Date().toISOString(),
  };
}
