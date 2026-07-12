# RareCrest Trust Boundaries

This document is the honest map of what RareCrest **does** enforce today and what must remain **human-owned forever** for a mission that serves the sick and suffering.

See [`VPS-CUTOVER.md`](./VPS-CUTOVER.md) for the concrete private-VPS deployment walkthrough (reverse proxy, sidecar binds, OIDC claims, secrets, backup/restore, offboarding).

## What is fail-closed today

| Control | Behavior |
| --- | --- |
| Entity tenancy | Entity-scoped API routes call `assertEntityAccess`. |
| Director scope | Strict mode: OIDC token with `vertical=holding` + `role=director`. Header spoofing rejected. |
| OIDC / JWT auth | Bearer via JWKS or `JWT_SECRET`. Strict requires Bearer + `jti`. |
| Session revocation | `rarecrest.token_revocations` denylist by `jti` or blanket `subject`. Checked on every OIDC request. |
| Agent passport | Hard-rule + local pre-check; violating passports not persisted. |
| Runtime activation | Server-derived controls; durable kill-switch blocks activation when armed/triggered. |
| PHI encryption evidence | Derived from `entity_encryption_layers` (never client boolean). |
| PHI vault + KMS wrap | Random DEK per envelope; DEK wrapped under `PHI_KMS_KEK` or remote `PHI_KMS_ENDPOINT`. Agents get blind refs only. |
| Secrets loading | `FOO` or `FOO_FILE` (Docker/K8s secrets pattern) via `loadSecret`. |
| Financial dual-control | Money/trade releases need `humanInstructionId`, hard-rule clear, **and** two distinct human approvers. `humanInstructionId` is now verified server-side against `rarecrest.human_instructions` (must exist, match the entity, and be unexpired/unrevoked) — a client-supplied id string alone is never trusted. |
| Kill switch | Durable Postgres + dual-control trigger in strict mode. Arm/trigger/disarm are all **director-only** (`isVerifiedDirector`, 403 otherwise); read stays entity-scoped. Disarm requires the disarm actor to differ from whoever armed/triggered it in strict mode. |
| Action policy gateway | `apps/api/src/policy/policy-gateway.ts`: `assertLivePassport` re-checks `hard_rule_clear` **and** `valid_until > now()` on every runtime activation/rollback (not just at issuance); `requireHumanInstruction` is the single fail-closed check behind every financial/human-instruction-gated release; `attachCorrelationId` gives every gated request a stable trace id. |
| Runtime activation realism | `deriveActivationControls` now fails closed when the kill-switch or human-review tables are unqueryable (broken table ≠ "live"), treats `evaluation_runs` as stale after 30 days, and blocks activation outright (`hardRuleClear=false`, `activationBlockedByOpenReviews=true`) while any human review is pending for the entity. |
| Internal RPC | `INTERNAL_SERVICE_TOKEN` (or `_FILE`) on API/governance-engine/intelligence/scoring `/rpc/*`. Fail-closed (503) when unset under `AUTH_TRUST_MODE=strict` or non-loopback bind. |
| Command queue | Vertical-scoped unless verified director. |
| Federated Canon Wiki | Fail-closed Knowledge OS: entity IDOR closed, agent verb bounds, PHI reject on care ingest, autoresearch OFF by default, encrypted Obsidian vault packages only. |
| Private deployment gate | Non-loopback `API_HOST` requires `AUTH_TRUST_MODE=strict` + `CORS_ALLOWED_ORIGINS`. |
| RBAC action matrix | `apps/api/src/rbac.ts` — `roleAllows(role, action)` for `kill_switch`, `phi_decrypt`, `vault_package`, `promote`, `export`. Unknown/missing role is always denied (fail-closed). Kill-switch routes gate on `roleAllows(..., 'kill_switch') \|\| isVerifiedDirector`; PHI decrypt gates on `roleAllows(..., 'phi_decrypt')`. |
| Rate limits | Postgres-backed via `rarecrest.api_rate_limits` (`assertDbRateLimit`/`WikiService.assertRateLimitDb`, used by wiki query + autoresearch); falls back to an in-memory bucket when the table/migration is unavailable — fails open on infra gaps, never silently unlimited. |
| Decision-trace hash chain | Every `decision_traces` row carries `content_hash = sha256(entityId+action+payload)` and `prev_hash` from the entity's prior trace — tamper-evident in addition to the existing append-only DB trigger. |
| Observability | `GET /metrics` (unauthenticated, like `/health`, no PHI/secrets) exposes Prometheus-ish counters: RPC-unauthorized, PHI-decrypt allow/deny, kill-switch arm/trigger/disarm, auth failures, RBAC denials. |
| Parliament + Seal | Multi-officer, multi-stakeholder-lens deliberation gate (`rarecrest.parliament_sessions`/`parliament_votes`/`seals`) in front of `wiki_promote`/`financial_release`/`activation`/`doctrine` actions. Required whenever `PARLIAMENT_REQUIRED=true` or `AUTH_TRUST_MODE=strict` (unless explicitly disabled). Sealing is director-only; a red-team `nay` blocks sealing without an explicit `overrideNote`; `time_lock` seals enforce their cooling-off window server-side and are cancellable before they execute. See [`SOLO-ORGANISM.md`](./SOLO-ORGANISM.md) for the full ceremony. |
| Holding metrics ledger | `POST /api/v1/holding/metrics` is gated to `role=director` or a verified human (`isVerifiedHumanOrDirector` — same dev/strict OIDC posture as `isVerifiedDirector`); agents cannot write North Star events. `GET /api/v1/holding/north-star` and `GET /api/v1/ops/ai-spend` (director-only) are read paths, no PHI. |
| AI spend ledger | `rarecrest.ai_spend_ledger` writes from `services/intelligence/src/spend-ledger.ts` are best-effort — a missing table or unset `DATABASE_URL`/`INTELLIGENCE_DATABASE_URL` never throws or blocks a companion response; it only stops the durable record from being written. |

## Federated Canon Wiki

| Rule | Behavior |
| --- | --- |
| System of record | RareCrest wiki tables + APIs (`/api/v1/wiki/*`). Obsidian is an **offline encrypted satellite**, never the SoR. |
| Vertical isolation | `vertical/{key}/wiki` readable/writable only by that vertical (or verified director). |
| Entity namespaces | Every `entity/{uuid}/working` op calls `assertEntityAccess` (reads and writes). |
| Holding bridges | `bridges/*` and `holding/canon` require **verified director** (not merely holding vertical). |
| PHI-blind | Care verticals reject plaintext PHI/secrets (422) unless vault blind refs; agents never receive `phi_ref`/`financial` bodies. |
| Agent bounds | `WIKI_AGENT_BOUNDS=strict` (default off loopback): agents draft/query/lint only — no promote, autoresearch, vault package, bridges. |
| Promote ceremony | Humans/directors only; dual-control for holding + financial charters. |
| Multi-writer | Advisory page locks (`lock_holder` / `lock_until`) on ingest and via `/api/v1/wiki/lock`. |
| Decision-trace → wiki | Pull ingest with redacted payload allowlist; governance gateway best-effort ingest. |
| Obsidian | Encrypted signed vault packages (`POST /obsidian/vault-package`); plaintext body sync disabled. Metadata-only manifest remains. |
| Autoresearch | **OFF** unless `WIKI_AUTORESEARCH_ENABLED=true` + director + explicit `WEB_SEARCH_PROVIDER`. No silent DuckDuckGo. |
| Skill companion drafts | `POST /api/v1/skill-companion` scans answers for prohibited claims (guaranteed / risk-free / 100% claims) before returning them, and watermarks any answer filed to the wiki with `> DRAFT — not canon. Human promote required.` — filed drafts are never canon and always route through the same human/director promote ceremony above. |

## What must remain human-owned forever

1. **PHI plaintext custody** — decrypt is human-only; never forward plaintext to agents.
2. **IdP MFA / offboarding** — RareCrest honors revocations; the IdP owns workforce lifecycle.
   There is no SCIM server in-repo: RareCrest only consumes OIDC claims (`vertical`, `role`) and
   maps IdP groups to them at the IdP; offboarding is `POST /api/v1/auth/revoke` (see
   [`VPS-CUTOVER.md` §9](./VPS-CUTOVER.md#9-scim--user-lifecycle)).
3. **KMS/KEK custody** — `PHI_KMS_KEK` / cloud KMS keys live in a secrets manager, rotated by humans, never in git.
4. **Legal/clinical judgment** — RareCrest assists; it does not replace licensed humans.
5. **Board-level kill-switch drills** — the platform enforces dual-control; humans must rehearse it.
6. **Obsidian vault passphrase / package KEK** — decrypt only on director machines; never in shared agent contexts.

## Environment knobs

| Variable | Meaning |
| --- | --- |
| `AUTH_TRUST_MODE=dev\|strict` | Dev allows header shim; strict required for non-loopback binds. |
| `CORS_ALLOWED_ORIGINS` | Comma-separated origins; required when `API_HOST` is not loopback. |
| `API_HOST` | LAN/VPN bind; use loopback for local-only. |
| `WIKI_AGENT_BOUNDS` | `strict` (default off-loopback) or `off`. |
| `WIKI_AUTORESEARCH_ENABLED` | Must be `true` to allow any live search (default `false`). |
| `WEB_SEARCH_PROVIDER` | `brave` / `tavily` / `duckduckgo` / `mock` — required when autoresearch enabled. |
| `WIKI_VAULT_PACKAGE_KEK` / `_FILE` | Encrypt Obsidian vault packages. |
| `WIKI_VAULT_PACKAGE_HMAC` / `_FILE` | Sign vault packages. |
| `OIDC_ISSUER` / `OIDC_AUDIENCE` / `OIDC_JWKS_URL` | Production IdP verification. |
| `JWT_SECRET` | Local HS256 verification. |
| `INTERNAL_SERVICE_TOKEN` / `_FILE` | Internal RPC auth (mandatory in strict/non-loopback; fail-closed 503 if unset). |
| `REQUIRE_INTERNAL_RPC_AUTH` | `1`/`true` forces fail-closed internal RPC auth even outside `AUTH_TRUST_MODE=strict` (governance-engine, scoring). |
| `SCORING_HOST` | Scoring sidecar bind address; defaults to `127.0.0.1` (loopback-only). |
| `GOVERNANCE_HOST` | Governance-engine sidecar bind address; defaults to `127.0.0.1` (loopback-only). |
| `INTELLIGENCE_HOST` | Intelligence-services sidecar bind address; defaults to `127.0.0.1` (loopback-only). |
| `INTEL_TOKEN_BUDGET_<VERTICAL>` | Daily skill-companion token budget for `<VERTICAL>` (e.g. `INTEL_TOKEN_BUDGET_RAREANGELS`); defaults to 100,000/day. Exceeding it returns 429 from `/rpc/skill-companion/complete`. |
| `PHI_KMS_KEK` or `PHI_KMS_KEK_FILE` | Preferred local KEK for DEK wrapping. |
| `PHI_KMS_ENDPOINT` + `PHI_KMS_TOKEN` | Remote KMS broker (`/wrap`, `/unwrap`). |
| `PHI_MASTER_KEY` | Legacy fallback KEK material in **dev only**; insufficient alone in strict. |
| `VITE_API_BEARER_TOKEN` / `EXPO_PUBLIC_API_BEARER_TOKEN` | Client Bearer tokens. |
| `PARLIAMENT_REQUIRED` | `true`/`false` — explicit override for the Parliament + Seal gate. Unset defers to `AUTH_TRUST_MODE=strict`. `false` always wins (dev-loopback opt-out). |
| `PARLIAMENT_MIN_VOTES` | Distinct `stakeholder_lens` votes required before a Parliament session becomes `ready_for_seal`. Defaults to `2`. |
| `LLM_HTTP_ENDPOINT` | When set, `ModelRouter`'s stub path (no explicit `ProviderCaller` wired) POSTs `{ prompt, provider, maxTokens?, temperature? }` to this URL and uses the JSON `{ text }`/`{ content }` field (or a plain-text body) as the model response — the extension point for a real backing model. Unset ⇒ deterministic stub response (dev/test default). |
| `AI_SPEND_INPUT_USD_PER_1M` / `AI_SPEND_OUTPUT_USD_PER_1M` | Override the durable AI-spend-ledger cost heuristic (default `0.5` / `1.5` USD per 1M tokens). Documented placeholder until real provider billing is wired in. |

## Production cutover checklist

- [ ] `AUTH_TRUST_MODE=strict`
- [ ] `CORS_ALLOWED_ORIGINS` set for LAN/VPN/VPS web origin(s)
- [ ] Real IdP JWKS configured; tokens include `sub`, `vertical`, `role`, `jti`
- [ ] `INTERNAL_SERVICE_TOKEN` (or `_FILE`) is **mandatory** and non-empty on API + governance-engine + intelligence + scoring — all four fail closed (503) without it under `AUTH_TRUST_MODE=strict`
- [ ] `PHI_KMS_KEK` or cloud KMS endpoint from secrets manager (`*_FILE` supported)
- [ ] `WIKI_VAULT_PACKAGE_KEK` + `WIKI_VAULT_PACKAGE_HMAC` from secrets manager
- [ ] `WIKI_AUTORESEARCH_ENABLED=false` unless explicitly approved
- [ ] `WIKI_AGENT_BOUNDS=strict` on every non-loopback deployment (default off only for loopback dev)
- [ ] `pnpm db:migrate` through `023_apex_jobs_rate_limits.sql`
- [ ] Confirm kill-switch arm/trigger/disarm all reject actors without `roleAllows(role, 'kill_switch')` or verified-director scope (403), and that disarm enforces dual-control against whoever armed/triggered
- [ ] Register encryption layer per care entity
- [ ] Dual-control kill-switch drill (two distinct humans)
- [ ] Dual-control financial commit drill (two distinct approvers)
- [ ] Offboarding path: `POST /api/v1/auth/revoke` with subject (and optional jti)
- [ ] Confirm agent roles cannot decrypt PHI or download vault packages
- [ ] Governance-engine, intelligence, and scoring sidecars bind to `127.0.0.1` (loopback) by default — only widen `GOVERNANCE_HOST`/`INTELLIGENCE_HOST`/`SCORING_HOST` behind a private network with `INTERNAL_SERVICE_TOKEN` set
- [ ] Terminate TLS at a reverse proxy (nginx/Caddy/cloud LB) in front of any non-loopback bind; RareCrest services do not terminate TLS themselves (see `infra/proxy/Caddyfile.example`)
- [ ] Kill switches disarmed and audited before go-live; confirm no `armed`/`triggered` state lingers from staging
- [ ] Confirm the `director-1` userId bypass is fully removed — `isVerifiedDirector` and `classifyWikiPrincipal` require an explicit `role=director` claim (verified via `grep -R "director-1" apps/api/src services/*/src packages/*/src` returning no privilege-check matches)
- [ ] Review `GET /metrics` after a smoke test — `rarecrest_auth_failures_total`, `rarecrest_rbac_denials_total`, and `rarecrest_phi_decrypt_total{outcome="denied"}` should all be 0 in a clean environment
- [ ] Full VPS cutover walkthrough: [`docs/VPS-CUTOVER.md`](./VPS-CUTOVER.md)

## Engineering posture

Prefer fail-closed. Never claim “100% secure.” Claim what is tested and what is still human-owned.
**RareCrest is system of record. Obsidian is an offline encrypted satellite. Public internet research is opt-in and director-gated.**
