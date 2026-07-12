# RareCrest Trust Boundaries

This document is the honest map of what RareCrest **does** enforce today and what must remain **human-owned forever** for a mission that serves the sick and suffering.

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
| Financial dual-control | Money/trade releases need `humanInstructionId`, hard-rule clear, **and** two distinct human approvers. |
| Kill switch | Durable Postgres + dual-control trigger in strict mode. |
| Internal RPC | `INTERNAL_SERVICE_TOKEN` on governance/intelligence `/rpc/*`. |
| Command queue | Vertical-scoped unless verified director. |
| Federated Canon Wiki | Fail-closed Knowledge OS: entity IDOR closed, agent verb bounds, PHI reject on care ingest, autoresearch OFF by default, encrypted Obsidian vault packages only. |
| Private deployment gate | Non-loopback `API_HOST` requires `AUTH_TRUST_MODE=strict` + `CORS_ALLOWED_ORIGINS`. |

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

## What must remain human-owned forever

1. **PHI plaintext custody** — decrypt is human-only; never forward plaintext to agents.
2. **IdP MFA / offboarding** — RareCrest honors revocations; the IdP owns workforce lifecycle.
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
| `INTERNAL_SERVICE_TOKEN` | Internal RPC auth. |
| `PHI_KMS_KEK` or `PHI_KMS_KEK_FILE` | Preferred local KEK for DEK wrapping. |
| `PHI_KMS_ENDPOINT` + `PHI_KMS_TOKEN` | Remote KMS broker (`/wrap`, `/unwrap`). |
| `PHI_MASTER_KEY` | Legacy fallback KEK material in **dev only**; insufficient alone in strict. |
| `VITE_API_BEARER_TOKEN` / `EXPO_PUBLIC_API_BEARER_TOKEN` | Client Bearer tokens. |

## Production cutover checklist

- [ ] `AUTH_TRUST_MODE=strict`
- [ ] `CORS_ALLOWED_ORIGINS` set for LAN/VPN/VPS web origin(s)
- [ ] Real IdP JWKS configured; tokens include `sub`, `vertical`, `role`, `jti`
- [ ] `INTERNAL_SERVICE_TOKEN` from secrets manager on API + governance + intelligence
- [ ] `PHI_KMS_KEK` or cloud KMS endpoint from secrets manager (`*_FILE` supported)
- [ ] `WIKI_VAULT_PACKAGE_KEK` + `WIKI_VAULT_PACKAGE_HMAC` from secrets manager
- [ ] `WIKI_AUTORESEARCH_ENABLED=false` unless explicitly approved
- [ ] `pnpm db:migrate` through `020_wiki_vault_packages.sql`
- [ ] Register encryption layer per care entity
- [ ] Dual-control kill-switch drill (two distinct humans)
- [ ] Dual-control financial commit drill (two distinct approvers)
- [ ] Offboarding path: `POST /api/v1/auth/revoke` with subject (and optional jti)
- [ ] Confirm agent roles cannot decrypt PHI or download vault packages

## Engineering posture

Prefer fail-closed. Never claim “100% secure.” Claim what is tested and what is still human-owned.
**RareCrest is system of record. Obsidian is an offline encrypted satellite. Public internet research is opt-in and director-gated.**
