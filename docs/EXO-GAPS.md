# EXO Gaps — what's next

A one-pager, written honestly rather than aspirationally: what EXO Wave A/B/C actually shipped,
and what is still a gap. Nothing here should be read as "coming soon" marketing — it is the
literal current state, so a director (or the next agent) knows exactly where the edges are.

## Federation

**Shipped (vertical product → holding SoR):** HMAC-authenticated ingress at
`POST /api/v1/federation/ingress/:vertical` (migration `030_vertical_federation.sql`).
Verticals can push `heartbeat`, `metric.record`, `attention.raise`, and
`alert.escalate` into an idempotent ledger that feeds holding metrics and the
attention queue. Contract: `docs/VERTICAL-FEDERATION.md`. Command Center shows
`federationFeed`.

**Still a gap (multi-instance):** There is **no** federation *across* separate
RareCrest deployments: no instance-to-instance sync, no partner-org contribution
path, no signed cross-instance provenance for a wiki page or decision trace that
originated somewhere else. `packages/wiki/src/obsidian-sync.ts` remains a one-way,
single-director, encrypted-vault-package export — an offline satellite for one
human, not a federation protocol between organizations. If multi-instance
federation is ever needed, it needs its own trust model.

## Mobile

`apps/mobile` (Expo/React Native) has one real screen: portfolio status + top attention items,
read-only, polling the same `/api/v1/command/attention-queue` and portfolio-status endpoints the
web app uses. Gaps: no push notifications (so "attention" on mobile means "open the app and
pull-to-refresh," not an actual interrupt), no offline cache, no write actions (can't resolve a
flag, seal a Parliament session, or run night-shift from the phone), no biometric/device-bound
auth story beyond the same bearer token the web app uses, and no deep-linking into a specific
entity's diagnostics/wiki/runtime tabs. It is a status-viewer, not an operating console.

## Provenance

The decision-trace hash chain (`rarecrest.decision_traces.content_hash`/`prev_hash`,
`computeTraceContentHash`) is tamper-evident *per entity*, verifiable only by re-walking the
chain against the same Postgres instance. Gaps: no cross-entity or cross-vertical merkle root,
no periodic external anchor (e.g., publishing a root hash somewhere outside RareCrest's own
database so a compromised DB admin couldn't quietly rewrite history), and no verifiable
provenance for the *content* of a wiki page beyond `wiki_raw_sources.content_hash` — there is no
signed attestation of *who* (which human, which agent, which officer passport) approved a
specific piece of canon beyond the promote ceremony's own audit row. Holding metric events
(`rarecrest.holding_metric_events`, EXO Wave B) are similarly append-only but unchained — no
`prev_hash`/`content_hash` linkage yet, so a North Star number is durable but not (yet)
tamper-evident the way a decision trace is.

## Other honest gaps from Wave B + C

- **AI spend cost heuristic is a placeholder.** `estimateSpendUsd` (`services/intelligence/src/spend-ledger.ts`)
  defaults to a flat $0.50/$1.50-per-1M-token guess (`AI_SPEND_INPUT_USD_PER_1M`/`AI_SPEND_OUTPUT_USD_PER_1M`),
  not real per-provider/per-model billing. It is directionally useful for spotting a spend spike,
  not a finance-grade cost report.
- **Token counts are `len/4`, not real tokenizer counts.** Both the in-memory budget
  (`estimateTokens`) and the durable ledger use the same rough heuristic — fine for a soft
  budget/spend signal, wrong if fed into anything that needs exact billing reconciliation.
- **`dualMissionScore` normalization targets are hardcoded, not director-configurable.**
  `NORTH_STAR_TARGETS` in `apps/api/src/services/holding-metrics.ts` is a simple, documented
  heuristic ($1M capital / 10,000 healing hours / 1,000 families / 100% donation ceiling) chosen
  to be legible, not calibrated against any real target-setting process.
- **`LLM_HTTP_ENDPOINT` has no auth, timeout, or retry.** It is a bare `fetch` POST — no bearer
  token, no per-request timeout, no failover if the endpoint is slow or down beyond whatever the
  caller's own failoverEnabled/allowlist already does across *providers* (not across endpoint
  health for a single provider).
- **Night-shift is cron-driven from outside the process, not self-scheduling.** `runNightShift`
  and `POST /api/v1/ops/night-shift/run` (EXO Wave A) require an external `cron`/scheduler to
  call the endpoint on a cadence; there is no in-process scheduler, so a host without a working
  cron job silently never runs it (no alert if the last night-shift run is stale).
- **Holding metric events have no correction workflow.** The ledger is append-only by design
  (matching the rest of RareCrest's audit posture), but there is no "supersede" or "correction"
  event type yet — a bad entry today can only be offset by a new event, not marked as corrected
  in a way the North Star aggregate understands specially.
