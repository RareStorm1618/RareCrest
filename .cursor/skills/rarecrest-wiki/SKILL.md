# RareCrest Federated Canon Wiki

Operate RareCrest's Knowledge OS (Plan A): one wiki engine, vertical namespaces, RareCrest as system of record. Obsidian is an optional director IDE via sync manifest.

## When to use

- Ingesting documents / web clips into a namespace
- Querying with wikilink citations
- Linting, doctor health, promote-to-canon
- Autoresearch, thinking sessions, Canvas/Bases export
- Creating holding bridge projections

## Namespace model

| Namespace | Access |
| --- | --- |
| `holding/canon` | Directors / holding |
| `vertical/{key}/wiki` | That vertical only |
| `entity/{id}/working` | Entity-scoped auth |
| `bridges/{from}__{to}` | Holding-only redacted |

## Core API

Base: `/api/v1/wiki`

1. `POST /namespace` — resolve namespace + charter
2. `POST /ingest` — immutable raw → compiled pages (Defuddle via `html`)
3. `POST /query` — hot cache + PageRank + hybrid BM25 → cited answer
4. `POST /lint` — 8-category lint report
5. `GET /doctor` — namespace health
6. `POST /promote` — dual-control when holding/financial
7. `POST /contradictions` — flag + inject callouts
8. `POST /lock` / `POST /unlock` — multi-writer advisory locks
9. `POST /autoresearch` — bounded gap-fill research → ingest
10. `POST /think` — 10-principle thinking session page
11. `GET /export/canvas` / `GET /export/bases` — Obsidian-oriented exports
12. `POST /bridges` — holding redacted bridge page
13. `POST /obsidian/sync-manifest` — non-PHI file list for director vault sync

## CLI

```bash
pnpm --filter @rarecrest/wiki exec rarecrest-wiki doctor
pnpm --filter @rarecrest/wiki exec rarecrest-wiki lint < pages.json
pnpm --filter @rarecrest/wiki exec rarecrest-wiki graph < graph.json
```

## Trust rules (non-negotiable)

- Never embed PHI plaintext; care charters are PHI-blind
- Financial / holding canon promotion needs two distinct humans
- Do not cross vertical namespaces without director/holding authority
- Agents draft; humans promote

## Companion UI

Director web: `#/entities/{id}/wiki` — Wiki Companion (list, query with `[[citations]]`, ingest, lint, doctor).
