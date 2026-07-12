# RareCrest Trust Boundaries

This document is the honest map of what RareCrest **does** enforce today and what must remain **human-gated forever** for a mission that serves the sick and suffering.

## What this pass hardened (fail-closed where possible)

| Control | Behavior |
| --- | --- |
| Entity tenancy | Entity-scoped API routes call `assertEntityAccess` so vertical A cannot read/write vertical B entities. |
| Director scope | Cross-vertical director views require `isVerifiedDirector`. In `AUTH_TRUST_MODE=strict`, that means `x-vertical=holding` **and** `x-user-role=director`. Dev mode still allows local demos. |
| Agent passport | Issuance is blocked unless governance hard-rules allow **and** local pre-check is clear. Violating passports are **not** persisted. Denies are traced. |
| Runtime activation | Client-attested `activationControls` are ignored. Controls are derived from envelope audits, evaluation runs, and roster state. |
| PHI default | Spec/hard-rule payloads default `encryptionLayerPresent` to **false** (fail-closed). |
| Financial release | Approving a money/trade held action requires a non-empty `humanInstructionId` and a fresh hard-rule check **before** the review is marked approved. |
| Rollback to running | Rollback that would set an agent `running` re-checks derived activation controls; otherwise the agent is halted. |
| Internal RPC | Governance + Intelligence `/rpc/*` accept `x-internal-service-token` when `INTERNAL_SERVICE_TOKEN` is set. Clients forward the same env var. |
| Command queue | Non-directors only see attention items for their authenticated vertical. |

## What must remain human-gated forever

These are structural, not TODOs:

1. **PHI decrypt / raw clinical access** — agents must never hold a path to plaintext PHI. Encryption layers and human custody stay outside autonomous agent rights.
2. **Financial commits** (trades, fund moves, token transfers) — require an explicit human instruction id and human review; automation may prepare, never commit alone.
3. **Kill-switch ceremony** — arming/triggering production kill switches needs dual-control humans and durable (not in-memory-only) state in production.
4. **Real identity** — header auth (`x-user-id`, `x-vertical`, `x-user-role`) is a **dev/transport shim**. Production must use a real IdP (OIDC/SAML), signed tokens, and short-lived sessions. Until then, treat the API as a trusted-network service only.
5. **Legal/clinical advice** — RareCrest assists operators; it does not replace licensed counsel or clinicians.

## Environment knobs

| Variable | Meaning |
| --- | --- |
| `AUTH_TRUST_MODE=dev` (default) | Accepts director claims used in local demos (`director-1` / `x-user-role=director`). |
| `AUTH_TRUST_MODE=strict` | Director scope only when vertical is `holding` and role is `director`. |
| `INTERNAL_SERVICE_TOKEN` | When set on governance/intelligence **and** the API, internal RPC is authenticated. Leave unset only for local unit tests. |

## How to rely on this team (engineering posture)

- Prefer fail-closed over convenience.
- Never claim “100% secure.” Claim what is tested and what is still human-owned.
- Every deny path should leave an auditable decision trace when intelligence is reachable.
- Production cutover checklist: IdP, durable kill-switch store, secrets manager for `INTERNAL_SERVICE_TOKEN`, PHI encryption service with agent-blind decrypt, dual-control financial commit workflow.
