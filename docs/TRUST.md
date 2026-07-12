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

## What must remain human-owned forever

1. **PHI plaintext custody** — decrypt is human-only; never forward plaintext to agents.
2. **IdP MFA / offboarding** — RareCrest honors revocations; the IdP owns workforce lifecycle.
3. **KMS/KEK custody** — `PHI_KMS_KEK` / cloud KMS keys live in a secrets manager, rotated by humans, never in git.
4. **Legal/clinical judgment** — RareCrest assists; it does not replace licensed humans.
5. **Board-level kill-switch drills** — the platform enforces dual-control; humans must rehearse it.

## Environment knobs

| Variable | Meaning |
| --- | --- |
| `AUTH_TRUST_MODE=dev\|strict` | Dev allows header shim; strict requires Bearer+jti+OIDC director rules. |
| `OIDC_ISSUER` / `OIDC_AUDIENCE` / `OIDC_JWKS_URL` | Production IdP verification. |
| `JWT_SECRET` | Local HS256 verification. |
| `INTERNAL_SERVICE_TOKEN` | Internal RPC auth. |
| `PHI_KMS_KEK` or `PHI_KMS_KEK_FILE` | Preferred local KEK for DEK wrapping. |
| `PHI_KMS_ENDPOINT` + `PHI_KMS_TOKEN` | Remote KMS broker (`/wrap`, `/unwrap`). |
| `PHI_MASTER_KEY` | Legacy fallback KEK material in **dev only**; insufficient alone in strict. |
| `VITE_API_BEARER_TOKEN` / `EXPO_PUBLIC_API_BEARER_TOKEN` | Client Bearer tokens. |

## Production cutover checklist

- [ ] `AUTH_TRUST_MODE=strict`
- [ ] Real IdP JWKS configured; tokens include `sub`, `vertical`, `role`, `jti`
- [ ] `INTERNAL_SERVICE_TOKEN` from secrets manager on API + governance + intelligence
- [ ] `PHI_KMS_KEK` or cloud KMS endpoint from secrets manager (`*_FILE` supported)
- [ ] `pnpm db:migrate` through `018_kms_revocation_financial.sql`
- [ ] Register encryption layer per care entity
- [ ] Dual-control kill-switch drill (two distinct humans)
- [ ] Dual-control financial commit drill (two distinct approvers)
- [ ] Offboarding path: `POST /api/v1/auth/revoke` with subject (and optional jti)
- [ ] Confirm agent roles cannot decrypt PHI

## Engineering posture

Prefer fail-closed. Never claim “100% secure.” Claim what is tested and what is still human-owned.
