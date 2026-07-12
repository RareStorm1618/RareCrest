# RareCrest VPS Cutover

This is the concrete walkthrough for moving RareCrest from local/loopback dev to a private VPS.
It complements [`TRUST.md`](./TRUST.md) (the trust-boundary map and the checklist source of
truth) — read that first. This document is the "how", TRUST.md is the "what is actually
enforced".

RareCrest services never terminate TLS themselves. Every sidecar (`governance-engine`,
`intelligence`, `scoring`) binds to `127.0.0.1` by default and is not meant to be exposed
directly to the internet. Only the API and web app sit behind your reverse proxy.

## 1. TLS reverse proxy

Put a TLS-terminating reverse proxy (Caddy, nginx, or your cloud LB) in front of the API
(`apps/api`, default port 3000) and web app (`apps/web`, default port 5173). A sample Caddy
config is checked in at [`infra/proxy/Caddyfile.example`](../infra/proxy/Caddyfile.example):

```caddyfile
your-domain.example {
  reverse_proxy /api/* api:3000
  reverse_proxy * web:5173
}
```

Copy it, replace `your-domain.example` with your real domain, and point Caddy's automatic
HTTPS (or your own certs) at it. Never bind `apps/api` or `apps/web` directly to a public
interface without a proxy in front — `assertPrivateDeploymentOrDie` (see `apps/api/src/fortress.ts`)
already refuses to start a non-loopback API bind without `AUTH_TRUST_MODE=strict` +
`CORS_ALLOWED_ORIGINS` + `INTERNAL_SERVICE_TOKEN`, but the proxy is still the TLS boundary.

## 2. Sidecar binds stay loopback

| Service | Default bind | Override |
| --- | --- | --- |
| `apps/api` | `0.0.0.0` (fronted by proxy) | `API_HOST` |
| `services/governance-engine` | `127.0.0.1` | `GOVERNANCE_HOST` |
| `services/intelligence` | `127.0.0.1` | `INTELLIGENCE_HOST` |
| `services/scoring` | `127.0.0.1` | `SCORING_HOST` |

Only widen a sidecar's bind (e.g. to run it on a separate VM behind a private network/VPN)
if `INTERNAL_SERVICE_TOKEN` (or `_FILE`) is set — all three sidecars fail closed (503) on
`/rpc/*` without it once `AUTH_TRUST_MODE=strict` or `REQUIRE_INTERNAL_RPC_AUTH=1`.

## 3. CORS

Set `CORS_ALLOWED_ORIGINS` to the exact web origin(s) serving the director/operator UI
(comma-separated for multiple). This is mandatory once `API_HOST` is not loopback — the API
refuses to start otherwise (`assertPrivateDeploymentOrDie`).

```bash
CORS_ALLOWED_ORIGINS=https://app.your-domain.example
```

## 4. OIDC claims

Configure a real IdP (`OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_JWKS_URL`) rather than the dev
`JWT_SECRET` shim. Tokens **must** include:

- `sub` — stable user id
- `vertical` (or `https://rarecrest.ai/vertical`) — one of the RareCrest verticals
- `role` (or `https://rarecrest.ai/role`) — `director`, `operator`, `compliance_officer`,
  `clinician`, `agent`, `human`, or `admin` (see `apps/api/src/rbac.ts`)
- `jti` — required in `AUTH_TRUST_MODE=strict` for session revocation

Director cross-vertical scope (`isVerifiedDirector`) requires `vertical=holding` +
`role=director` sourced from a verified OIDC token in strict mode — header spoofing is
rejected outright.

## 5. Secrets: `*_FILE` everywhere

Every secret-shaped env var supports the Docker/K8s secrets-file pattern: set `FOO_FILE` to a
path and RareCrest reads+trims it (`loadSecret`), falling back to `FOO` directly. Prefer the
`_FILE` form on a VPS so secrets never land in process environment dumps or `docker inspect`:

```bash
INTERNAL_SERVICE_TOKEN_FILE=/run/secrets/internal_service_token
PHI_KMS_KEK_FILE=/run/secrets/phi_kms_kek
WIKI_VAULT_PACKAGE_KEK_FILE=/run/secrets/wiki_vault_kek
WIKI_VAULT_PACKAGE_HMAC_FILE=/run/secrets/wiki_vault_hmac
```

## 6. `INTERNAL_SERVICE_TOKEN` is mandatory

Non-negotiable on a VPS. It gates every `/rpc/*` call between API, governance-engine,
intelligence, and scoring. All four fail closed (503, not silently open) when it's unset and
`AUTH_TRUST_MODE=strict` (or `REQUIRE_INTERNAL_RPC_AUTH=1` for the Rust services). Generate one
strong random token and share it across all four services via secrets, not env literals in a
committed compose file.

## 7. Backup / restore drill checklist

Postgres already runs with WAL archiving in `infra/docker-compose.yml` (`archive_mode=on`,
`archive_command=cp %p /backups/wal/%f`). Before go-live, and quarterly after:

- [ ] Take a full `pg_basebackup` (or equivalent) and store it off-host
- [ ] Confirm `./infra/postgres/backups/wal` is actually receiving archived WAL segments
- [ ] Restore the base backup + WAL replay into a scratch instance
- [ ] Verify row counts on `rarecrest.entities`, `rarecrest.decision_traces`,
      `rarecrest.attention_flags` match the source within the drill window
- [ ] Time the restore — record it, so an incident has a known RTO
- [ ] Confirm MinIO (object store) bucket contents (export packs, vault packages) are
      included in the same backup cadence — exports reference object keys, not blobs, in
      Postgres

## 8. Offboarding via revoke API

When a human leaves (or a session/device is compromised), call:

```bash
curl -X POST https://your-domain.example/api/v1/auth/revoke \
  -H "Authorization: Bearer <director-or-compliance-token>" \
  -H "Content-Type: application/json" \
  -d '{"subject": "user-sub-id", "reason": "offboarding"}'
```

This inserts a blanket denylist row in `rarecrest.token_revocations` keyed by `subject` (or a
specific `jti` for a single session) — checked on every OIDC request thereafter. The IdP still
owns the underlying account/MFA lifecycle (see TRUST.md §"What must remain human-owned
forever"); RareCrest's revoke API is the fast-path kill for active API sessions while IdP-side
offboarding catches up.

## 9. SCIM / user lifecycle

RareCrest does **not** run a SCIM server in-repo, and does not plan to. The IdP is the single
source of truth for the workforce lifecycle — provisioning, deprovisioning, group/role
membership — and RareCrest only ever *consumes* the resulting OIDC claims.

- **The IdP owns user lifecycle.** Create/suspend/delete a human's account, rotate MFA, and
  manage group membership in the IdP (Okta, Azure AD/Entra, Auth0, etc.), not in RareCrest.
  There is no local RareCrest user table to keep in sync — sync friction and drift are avoided
  by never having a second copy of identity to reconcile.
- **RareCrest consumes OIDC claims, not a SCIM feed.** Every request's `vertical` and `role`
  come from the OIDC token (`sub`, `vertical`, `role`, `jti` — see §4 above), resolved fresh on
  each request. Map IdP groups to RareCrest's `role`/`vertical` claims at the IdP's claim-mapping
  layer (e.g. an Okta group `rarecrest-director-holding` → claims `role=director`,
  `vertical=holding`); RareCrest never has to be told about a group change directly.
- **Offboarding is immediate and fail-closed even before the IdP finishes propagating.** Two
  layers, not one:
  1. Suspend/delete the account at the IdP (the durable, source-of-truth action).
  2. Call the fast-path kill described in §8 above — `POST /api/v1/auth/revoke` — so active
     sessions/tokens are denylisted immediately, without waiting on IdP-side token expiry or
     propagation delay.
- **No SCIM server, no local roster, by design.** If a future integration needs SCIM
  provisioning (e.g. auto-creating IdP accounts from an HR system), that belongs in the IdP or a
  dedicated identity broker in front of it — never inside RareCrest's trust boundary. RareCrest
  stays a claims consumer, never an identity source of record.

## 10. Go-live smoke checks

- `GET /health` returns `status: "ok"` with `database`, `governance`, `intelligence` all `true`
- `GET /metrics` shows `rarecrest_auth_failures_total`, `rarecrest_rbac_denials_total`, and
  `rarecrest_phi_decrypt_total{outcome="denied"}` at `0` (a clean environment has no denials yet)
- Kill switches are `idle` for every entity (no `armed`/`triggered` state left from staging)
- Run the full [Production cutover checklist](./TRUST.md#production-cutover-checklist) in TRUST.md
