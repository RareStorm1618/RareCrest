# RareCrest

RareCrest is the holding operating system above five verticals (RareStorm, RareAngels, RareEdge, HopeCoin, Heal Kids.AI). It provides director-facing governance, diagnostics, portfolio management, and migration tooling with structurally enforced hard rules.

## Stack

- **Client:** TypeScript 7.0 — React 19 (web) + React Native (mobile)
- **API Server:** Node.js 22 / TypeScript — workflow orchestration and access broker
- **Governance Engine:** Rust — hard-rule enforcement (two-of-three rights, encrypt-before-access, no autonomous financial action)
- **Intelligence Services:** Rust + Node.js — scoring, decision traces, skill companion
- **Data Layer:** Managed PostgreSQL + MinIO (object store) + Qdrant (vector store)

## Quick Start

```bash
# Install dependencies
pnpm install

# Start infrastructure (Postgres, MinIO, Qdrant)
pnpm infra:up

# Run migrations
pnpm db:migrate

# Start development
pnpm dev
```

## Hard Rules (Structural)

1. **Two-of-three rights** — agents may hold at most 2 of: sensitive-data access, code execution, external communication
2. **Encrypt-before-access** — PHI requires encryption layer before any agent access
3. **No autonomous financial action** — trading, fund movement, token supply changes require explicit human instruction

## Work Order Execution

Work orders are executed via Software Factory with grade-10 perfection loop. Execution artifacts live in `.sw-factory/WO-<n>/`.

## Project Structure

```
apps/
  api/          Node.js API Server
  web/          React 19 web client
  mobile/       React Native mobile client
packages/
  contracts/    Shared TypeScript contracts
  db/           Database client, migrations, tenancy
  governance-client/  RPC client for Governance Engine
services/
  governance-engine/  Rust hard-rule enforcement
  scoring/            Rust deterministic scoring
  intelligence/       Mixed intelligence services
infra/
  docker-compose.yml  Local dev infrastructure
  postgres/           Postgres init scripts
  provisioning/       Cloud provisioning docs
```

## License

Proprietary — Roderick E. Bentley holds 100% background IP.
