# RareCrest Trust Boundaries

This document is the honest map of what RareCrest **does** enforce today and what must remain **human-gated forever** for a mission that serves the sick and suffering.

## What is fail-closed today

| Control | Behavior |
| --- | --- |
| Entity tenancy | Entity-scoped API routes call `assertEntityAccess` so vertical A cannot read/write vertical B entities. |
| Director scope | Cross-vertical director views require `isVerifiedDirector`. In `AUTH_TRUST_MODE=strict`, that means an **OIDC** token with `vertical=holding` and `role=director`. Header spoofing is rejected in strict mode. |
| OIDC / JWT auth | Bearer tokens verified via `OIDC_JWKS_URL` (preferred) or `JWT_SECRET` (HS256). Strict mode requires Bearer; header auth is a **dev-only** shim. |
| Agent passport | Issuance is blocked unless governance hard-rules allow **and** local pre-check is clear. Violating passports are **not** persisted. Denies are traced. |
| Runtime activation | Client-attested `activationControls` are ignored. Controls are derived from envelope audits, evaluation runs, roster state, and **durable kill-switch** rows. |
| PHI encryption evidence | `encryptionLayerPresent` is derived from `rarecrest.entity_encryption_layers`, never trusted from the client. |
| PHI vault | Ciphertext-only envelopes in `rarecrest.phi_envelopes`. Agents get blind refs. Decrypt requires human custody roles (`director`, `clinician`, `compliance_officer`) and is audited. |
| Financial release | Approving a money/trade held action requires a non-empty `humanInstructionId` and a fresh hard-rule check **before** the review is marked approved. |
| Rollback to running | Rollback that would set an agent `running` re-checks derived activation controls; otherwise the agent is halted. |
| Kill switch | Durable Postgres state (`rarecrest.kill_switches` + event log). Arm then trigger. In strict mode, **dual-control**: trigger actor must differ from arm actor. Trigger halts entity agents. |
| Internal RPC | Governance + Intelligence `/rpc/*` accept `x-internal-service-token` when `INTERNAL_SERVICE_TOKEN` is set. |
| Command queue | Non-directors only see attention items for their authenticated vertical. |

## What must remain human-gated forever

These are structural, not TODOs:

1. **PHI decrypt / raw clinical access** — agents must never hold a path to plaintext PHI. The vault encrypts; only human custody roles may decrypt, and plaintext must never be forwarded to agents.
2. **Financial commits** (trades, fund moves, token transfers) — require an explicit human instruction id and human review; automation may prepare, never commit alone.
3. **Kill-switch ceremony** — arming and triggering need two distinct humans in production (`AUTH_TRUST_MODE=strict`). Governance in-memory cache is secondary to the durable store.
4. **IdP operations** — RareCrest verifies tokens; your identity provider owns MFA, session revocation, and workforce offboarding.
5. **Legal/clinical advice** — RareCrest assists operators; it does not replace licensed counsel or clinicians.
6. **Key custody** — `PHI_MASTER_KEY` / KMS material must live in a secrets manager, rotated by humans, never in git.

## Environment knobs

| Variable | Meaning |
| --- | --- |
| `AUTH_TRUST_MODE=dev` (default) | Allows header auth for local demos; dual-control may be same-actor for local drills. |
| `AUTH_TRUST_MODE=strict` | Bearer required; director scope only via OIDC holding+director; kill-switch dual-control enforced. |
| `OIDC_ISSUER` / `OIDC_AUDIENCE` / `OIDC_JWKS_URL` | Production IdP verification (JWKS preferred). |
| `JWT_SECRET` | Local/HS256 verification when JWKS is not configured. |
| `INTERNAL_SERVICE_TOKEN` | Authenticates internal governance/intelligence RPC. |
| `PHI_MASTER_KEY` | 32-byte key material (64-hex, 32-byte base64, or passphrase hashed to SHA-256). Required to seal/open PHI. |
| `VITE_API_BEARER_TOKEN` | Web client Bearer token (preferred over header shim). |

## How to rely on this team (engineering posture)

- Prefer fail-closed over convenience.
- Never claim “100% secure.” Claim what is tested and what is still human-owned.
- Every deny path should leave an auditable decision trace when intelligence is reachable.
- Production cutover checklist: real IdP + JWKS, secrets manager for tokens/keys, migrate `016`/`017`, dual-control kill-switch drills, PHI layer registration per care entity, agent role never granted decrypt.
