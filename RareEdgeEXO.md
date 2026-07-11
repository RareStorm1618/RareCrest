# SECTION A — Business-wide (the holding layer above all verticals)

## The overarching purpose / mission that ties all verticals together (one paragraph)

Documented cross-vertical purpose is partial, not a single signed holding-company MTP. RareEdge’s repo states that **all profits fund RareAngels** rare-disease family support (`README.md`; `_MASTER_PROMPT`). RareAngels is described as an institutional-grade AI platform for rare disease families (RareAngels1 `README.md`; SF artifacts describe connecting families needing help with people who want to help). Sibling verticals on disk include **HealKids.ai** (children’s platform monorepo) and **CircleOfSupport** (backend/frontend present; mission text UNKNOWN from a root README). A formal EXO holding-layer mission statement that binds RareEdge + RareAngels + HealKids + others under one MTP protocol is **UNKNOWN**. (Separate OpenExO / Organizational Singularity research exists under `GitHub/EXO/research/` and is **not** evidenced as Roderick’s corporate charter.)

## The operating principle for how the business is run AI-first with one human director — what decisions stay with the human vs. what agents handle

**Human director (Roderick Bentley / operator):** milestone redirects and phase authority (`goal.md`); unpausing the trading engine; authorizing live capital; inventing/filling secrets (`REPLACE_ME_FROM_SECRETS_MANAGER`); hosted/paid infra (Stripe, live broker, GitHub Actions spend); product/legal/compliance sign-offs (e.g. Redis fail-open vs fail-closed for compliance gate); champion acknowledgement / live-grade promotion gates; kill-switch and feature-flag enablement for blast-radius features.

**Agents / automations (below the loop, evidenced in RareEdge):** signal generation and voting; paper order intents; Master Orchestrator rank → keep/archive → contrarian invert → `MASTER_LEARNINGS.md`; generational evolution proposals; research/backtest loops; pre-trade compliance evaluation (with human acknowledgment on soft warnings); audit-chain writes; Software Factory / WO execution by AI workers with mandatory human review (RareAngels IP policy: AI drafts only; human architecture review + 2-approval merge).

**Principle in practice (RareEdge hard edges):** paper-only, local-first until explicit human go-ahead; agents may propose and paper-execute; they must not bypass approval, live broker, or production credential paths (`AgentOutputGuardrails`, `AgentManifestCompiler`).

## Cross-vertical shared services (finance, legal, data, brand, infrastructure) — what is shared vs. siloed per vertical

| Service | Shared vs siloed | Evidence |
|---|---|---|
| Finance / profit routing | Intent: RareEdge profits → RareAngels | README / MASTER_PROMPT; **operational transfer mechanics UNKNOWN** |
| Legal / entity structure | UNKNOWN | No holding LLC/Inc docs found in RareEdgeV9 |
| Brand | Siloed per product name (RareEdge, RareAngels, HealKids.ai) | Repo READMEs |
| Operator identity | Shared Abristorm emails (`brielle@`, `ariya@`, `austin@`, `rod@abristorm.org`) appear as operators | `goal.md`, `fix_plan.md`, `OBSIDIAN_SCALE_LOOP.md` |
| AI methodology / agent skills | Shared patterns (DrMike, Software Factory, TurboQuant references) | Cross-repo skills/docs |
| Data planes | Siloed (RareEdge trading DB vs RareAngels PHI/HIPAA stack) | Separate repos; RareAngels HIPAA/BAA runbooks |
| Infra (Supabase, Redis, K8s, CI) | Per-vertical repos; no documented shared EXO control plane | UNKNOWN for holding OS |

## Any existing AI agents, tools, or automations already in use today, per function

| Function | What exists today |
|---|---|
| Trading / research (RareEdge) | Directional agents (Momentum, MeanReversion, RegimeTransition, Volatility, BubbleDetection); Protection / risk agents; 0DTE lab population; Master Orchestrator + WO-EVOLVE generational loop; FiveX3 study/archiver; Agent Cognitive Framework (ACF) surfaces; NautilusTrader engine (**paused**); Alpaca paper; pre-trade compliance gate |
| Build / delivery | Ralph-style loops, Software Factory WOs, Cursor/Claude agent skills (`worun`, `val`, DrMike), failover-daemon fleet (operator policy) |
| RareAngels | Angel Assistant character (“Haven”); large WO-driven AI platform; RareMD requirement packs; HopeCoin / matching / crisis flows (product code + docs) |
| HealKids.ai | AI Worker services (e.g. ImpactModelingEngine) in monorepo |
| Holding EXO runtime | UNKNOWN (no shipped EXO control plane for multi-vertical ops found) |

## The single most important metric for the business as a whole

**UNKNOWN** (no holding-layer KPI document found). Closest documented north stars by vertical: RareEdge WO-EVOLVE — risk-adjusted profit / cumulative PnL over generations (paper until live authorized); RareAngels — family support / impact outcomes (not a single named holding KPI). OpenExO research KPI (“workflows safely executed by agents under human command”) is **not** adopted as Roderick’s holding metric in-repo.

---

# SECTION B — Per vertical: RareEdge

## One-line identity

RareEdge is an algorithmic trading platform (charts, agents, paper/live-capable stack) whose stated purpose is to generate profits that fund RareAngels rare-disease support.

## Legal/entity type

**UNKNOWN** (for-profit platform product in code/docs; no LLC/Inc/fund registration text found in RareEdgeV9). Not described as a 501(c)(3), token protocol, or registered investment fund in repo sources reviewed.

## What it does

RareEdge consolidates a Next.js trading dashboard, market-data/charting stack, Python/NautilusTrader engine, orchestrator, and 65+ analytics modules (order flow, 0DTE options, regime detection, sector rotation, backtesting, risk tools, AI agents). Primary broker integration is **Alpaca** (paper default); equities/ETF data defaults to Alpaca→Polygon; crypto data defaults to Coinbase.

It serves the operator (Roderick / Abristorm operators) today under a **local / paper-only** envelope. Planned milestones include paper staging (K8s + live Alpaca paper + market data) and later multi-tenant production with billing/compliance (L3 in `_MASTER_PROMPT`). External end-customers are not yet the active operating mode; “small group of testers” is the L2 intent.

Profits are explicitly earmarked for RareAngels; RareEdge itself is the trading/tech engine, not the family-support product.

## Current state

- **Ultimate goal:** “make RareEdge fully operational” (`goal.md`).
- **Phase 19 (Master Orchestrator + WO-EVOLVE):** marked program complete (2026-06-19) for local/paper evolutionary loop; live data / remote migrations remain operator-gated.
- **Phase 18 hosted CI:** parked on external GitHub Actions spending gate.
- **Trading engine:** intentionally **paused**; paper-only; no live capital.
- **Not yet:** hosted-ready, production-ready, Stripe-ready, paid-infra-ready, remote-mutation-ready, or live-trading-ready (`goal.md`).
- Large WO corpus implemented locally; many items remain `blocked-on-provider/live-infra` or staging evidence.

## Stakeholders / audiences

| Audience | Role |
|---|---|
| Roderick Bentley | Human director / product owner (named on WOs) |
| Abristorm operators (`*@abristorm.org`) | Day-to-day operators of loops and milestones |
| AI coding/trading agents | Build and paper-trade below the loop |
| Future paper testers (L2) | Intended small cohort |
| RareAngels (beneficiary) | Profit destination, not a RareEdge UI user |
| External retail/institutional customers | Planned for L3 multi-tenant; **not live today** |
| Brokers/providers (Alpaca, Polygon, Coinbase, etc.) | Data/execution vendors |

## Core workflows

1. Market data ingest & charting (OHLC, studies, FiveX3 measurement/archive)
2. Watchlist / symbol management
3. Auth / session (local Supabase)
4. Agent signal generation → assembly-window vote → synthesis (realtime path; engine paused)
5. Paper order submit → fill → positions / outcomes
6. Pre-trade compliance evaluation (pass / soft_warning / hard_block) + audit hash chain
7. Master Orchestrator loop: rank agents → keep/archive → invert bad → write learnings → option intents (paper)
8. Generational evolution / ACF evolution proposals (human-gated promotion)
9. Research / backtest / walk-forward / preregistered studies
10. Security & ops gates (route policies, migration inventory, secret scan, CI)

## AI teammates / agents

| Workflow | Agent-runnable today / intended | Must stay human |
|---|---|---|
| Signal generation & ranking | Yes (directional + risk agents, MO) | Risk limits, live enablement |
| Paper trading / option intents | Yes (paper) | Unpause engine; live capital |
| Evolution / mutation / champion | Propose + paper evidence | Champion ack; live-grade promotion |
| Compliance soft warnings | Auto-ack for automated sources; human text for manual | Rule severity policy; kill switch `COMPLIANCE_GATE_ENABLED` |
| Credentials / secrets | Never | Always human / secrets manager |
| Hosted spend / Stripe / live broker | Blocked by guardrails | Explicit operator approval |

## Data it owns

| Asset | Sensitivity | Constraints |
|---|---|---|
| Market bars, quotes, FiveX3/signal measures | Commercial / vendor ToS | Provider licenses (Alpaca/Polygon/Coinbase); not PHI |
| Paper portfolios, orders, fills, tax-lot/cost-basis artifacts | Financial operational | Paper envelope; live would raise broker/securities issues |
| Agent configs, memories, `MASTER_LEARNINGS.md`, audit chains | IP / operational integrity | Tamper-evident audit; compliance audit retention **≥7 years** (WO-153) |
| User auth accounts (Supabase) | PII (accounts) | Auth/RLS; multi-tenant production not live |
| Strategy DNA / research DBs | Proprietary IP | Local/paper research claims only |
| Children’s data / PHI | N/A to RareEdge core | COPPA/HIPAA belong to RareAngels/HealKids, not RareEdge trading DB |

**Regulatory note:** RareEdge is not currently operating as a live multi-tenant broker or adviser; securities/AML applicability for production customers is **UNKNOWN pending legal entity and product classification**.

## Governance / risk

Highest-stakes decisions needing kill switches / human review:

- Unpausing engine / enabling live broker calls
- Capital allocation and live order placement
- Compliance gate disable (`COMPLIANCE_GATE_ENABLED=false` still audits bypass)
- Restricted instruments / PDT hard blocks
- Champion / active promotion from paper-only evidence (blocked without live-grade proof)
- Secrets, Stripe, paid infra, production DB mutations
- Customer-of-record / billing (L3; not live)

## Purpose / constraints

**Exists to achieve:** operational, profitable (eventually live) algorithmic trading whose profits fund RareAngels; self-improving agent population under human command; falsifiable paper research before live.

**Must never do (current hard edges):** trade live capital without explicit permission; invent credentials; skip human approval on irreversible outward actions; treat paper telemetry as live performance or investment advice; ship agents that bypass safety/approval/paper-only policy; claim hosted/production readiness without evidence.

## Success metrics

1. Risk-adjusted agent/portfolio performance (DSR/PBO-gated; WO-EVOLVE) — paper until live authorized  
2. Cumulative PnL trajectory toward long-range capacity goals (aspirational “billions” in WO-EVOLVE — **not a current live KPI**)  
3. Local/paper operational readiness (L1 demo flows green; engine remains paused by policy)  
4. Audit integrity (hash-chained compliance/orchestrator decisions)  
5. **UNKNOWN:** formal $ transferred to RareAngels (profit→nonprofit transfer not evidenced in-repo)

## Dependencies on other verticals

- **RareAngels:** beneficiary of profits; shared operator/AI tooling culture; not a runtime dependency for trading loops  
- **HealKids.ai / CircleOfSupport:** no code dependency found in RareEdgeV9; ecosystem adjacency **UNKNOWN** at holding layer  
- **EXO (holding OS):** RareEdge is intended as a vertical under the user’s EXO framing; no EXO runtime integration found in-repo  
- **Providers:** Alpaca, Polygon, Coinbase, Supabase, Redis, (planned) K8s/Stripe — external, not sister verticals  

---

# SECTION C — Regulatory & compliance map

| Regime | Applies to | Status / notes |
|---|---|---|
| Securities / broker-dealer / investment adviser (SEC/FINRA etc.) | RareEdge (if live multi-tenant trading/advice) | **UNKNOWN** entity classification; currently paper-only / engine paused; PDT rule encoded in compliance engine for live margin accounts |
| Pre-trade / portfolio compliance (internal) | RareEdge | Implemented (WO-153); 7-year audit retention |
| Payment / Stripe / consumer billing | RareEdge L3 | Planned; blocked in current phase guardrails |
| Market-data vendor ToS | RareEdge | Alpaca / Polygon / Coinbase contracts — details UNKNOWN in-repo |
| Nonprofit / 501(c)(3) | RareAngels (and partner nonprofits) | Product/docs assume tax-exempt / EIN verification paths; **RareAngels’ own IRS determination status UNKNOWN from this pass** (placeholders noted in RareAngels build notes) |
| Charitable solicitation / donation receipts | RareAngels | Documented in blueprints/WOs |
| HIPAA / BAA / PHI | RareAngels (and clinical-adjacent features) | Extensive runbooks; BAA execution often operator-gated |
| COPPA / children’s privacy | RareAngels (child deletion WO-7136); **HealKids.ai** (children’s product — specifics UNKNOWN beyond monorepo existence) | RareEdge: not applicable |
| GDPR / DSAR | RareAngels | Documented compliance WOs |
| Crypto / AML / KYC / sanctions | RareAngels (HopeCoin, AngelVault, financial disclaimers cite KYC/AML); RareEdge crypto **data** via Coinbase | RareEdge trading AML program: **UNKNOWN**; HopeCoin Howey/security risk flagged in RareAngels proposals |
| IP / patent / trade secret | All verticals | RareAngels: “All IP exclusively owned by RareAngels”; RareEdge strategy IP proprietary |
| AI governance (NIST AI RMF, OWASP LLM/Agentic, EU AI Act Art.14 human override) | EXO product research / future holding OS; RareEdge agent guardrails partially align | OpenExO research maps standards; RareEdge has human-review queues / kill switches in design — formal regulatory mapping **UNKNOWN** |
| Tax (1099-K, charitable receipts, cost basis) | RareAngels (platform); RareEdge (tax-lot modules for trading) | RareEdge tax-lot is paper/engineering; live tax reporting UNKNOWN |

---

**Evidence note:** Holding-layer EXO (Roderick multi-vertical OS) is mostly **UNKNOWN** in written form; RareEdge and RareAngels repos supply the concrete facts above. OpenExO materials in `GitHub/EXO/research/` describe a different productization track and were not treated as Roderick’s corporate mission.
