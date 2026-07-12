# RareCrest Federated Canon Wiki (Private Canon Fortress)

Operate RareCrest's Knowledge OS: one wiki engine, vertical namespaces, RareCrest as system of record.
Obsidian is an **offline encrypted satellite** (signed vault packages) — not a live plaintext sync target.

## When to use

- Ingesting documents / web clips into a namespace
- Querying with wikilink citations
- Linting, doctor health, promote-to-canon (humans/directors)
- Autoresearch (director + `WIKI_AUTORESEARCH_ENABLED=true` only)
- Encrypted Obsidian vault packages for directors
- Creating holding bridge projections (verified director)

## Namespace model

| Namespace | Access |
| --- | --- |
| `holding/canon` | Verified director |
| `vertical/{key}/wiki` | That vertical only |
| `entity/{id}/working` | Entity-scoped auth (`assertEntityAccess` on every read/write) |
| `bridges/{from}__{to}` | Verified director only |

## Core API

Base: `/api/v1/wiki`

1. `POST /namespace` — resolve namespace + charter
2. `POST /ingest` — immutable raw → compiled pages (PHI reject on care charters without vault ref)
2b. `POST /ingest/decision-traces` — humans only; redacted allowlist payload
3. `POST /query` — hybrid answer; agents never see `phi_ref` / `financial` bodies
4. `POST /lint` / `GET /doctor` / `POST /lock`
5. `POST /promote` — humans/directors; dual-control when holding/financial
6. `POST /autoresearch` — **OFF by default**; director + enable flag + explicit `WEB_SEARCH_PROVIDER`
7. `POST /think` — humans/directors
8. `GET /export/canvas` / `GET /export/bases` — metadata exports
9. `POST /bridges` — verified director
10. `POST /obsidian/sync-manifest` — metadata only (`includeBodies` forbidden)
11. `POST /obsidian/vault-package` — encrypted signed package; large namespaces return `202` + job id
12. `GET /obsidian/vault-package/jobs/:jobId` — poll async package builds

## CLI

```bash
pnpm --filter @rarecrest/wiki exec rarecrest-wiki doctor
pnpm --filter @rarecrest/wiki exec rarecrest-wiki lint < pages.json
pnpm --filter @rarecrest/wiki exec rarecrest-wiki vault-decrypt package.rcvault --out ./ObsidianVault
```

## Fortress env (required for LAN/VPN)

```
AUTH_TRUST_MODE=strict          # required when API_HOST is not loopback
CORS_ALLOWED_ORIGINS=https://...
WIKI_AGENT_BOUNDS=strict
WIKI_AUTORESEARCH_ENABLED=false
WIKI_VAULT_PACKAGE_KEK=...
WIKI_VAULT_PACKAGE_HMAC=...
```

## Trust rules (non-negotiable)

- RareCrest is SoR; Obsidian is offline encrypted satellite; public research is opt-in and director-gated
- Never embed PHI plaintext; care charters are PHI-blind
- Financial / holding canon promotion needs two distinct humans
- Do not cross vertical namespaces without director/holding authority
- Agents draft/query/lint only — no promote, autoresearch, vault package, bridges

## Companion UI

Director web: `#/entities/{id}/wiki` — Wiki Companion (query, ingest, promote, vault package, sync traces).
