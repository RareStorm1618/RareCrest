# SECTION A — Business-wide (the holding layer above all verticals)

## The overarching purpose / mission that ties all verticals together (one paragraph).

**UNKNOWN** as a single written holding-company MTP across all verticals. What is evidenced in RareAngels1: RareAngels exists to connect families of children with rare diseases to peer support networks, mentors (“Angels”), and community resources (care circles, prayer requests, visual product discovery, HopeCoin resource-sharing) — explicitly **not** a medical provider or emergency service (`docs/legal/terms-of-service.md`). Sibling product repos exist under the same operator orbit (RareAngels1, HopeCoin, HealKids/HEALKidsAI, RareEdge, EXO), but a unified cross-vertical mission statement binding them was **not found** in RareAngels1 or the EXO research pack (`C:\Users\MP3-Backup\Documents\GitHub\EXO\research\`). EXO research currently productizes Organizational Singularity / ExO 3.0 methodology, not a Bentley multi-vertical operating charter.

## The operating principle for how the business is run AI-first with one human director — what decisions stay with the human vs. what agents handle.

**Human director (evidenced):** Roderick Bentley is named CEO/Founder and final authority on pilot success criteria, security/compliance sign-off, and HopeCoin fiat-fallback ADR acceptance (`docs/pilot/success-criteria-v1.0.md`, `docs/security/wo7051-security-posture-index.md`, `docs/adr/ADR-WO6554-hopecoin-fiat-fallback.md`). Contact domain in ops: `rod@abristorm.org`. CTO role on AngelVault bug-bounty escalations / `pause()` authorization also routes to that address (`docs/runbooks/angelvault-bug-bounty-operations.md`).

**Repo development operating model (evidenced):** AI drafts → mandatory human architecture review → peer review → 2-approval merge; IP owned by RareAngels (`README.md`).

**Agents / AI below the loop (evidenced inside RareAngels):** Angel Assistant (“Haven”) — conversational guidance, Circle coordination, distress routing; **not** medical advice; crisis escalates to humans (`config/character/identity.md`, ToS §4). Software-factory / agent fleets implement work orders under human gates. Payment/HopeCoin paths enforce mission-lock and fail-closed KYC; humans retain compliance-officer review, economic-parameter changes, multisig pause, and legal/regulatory go/no-go (WO-3775).

**Holding-layer EXO permission envelopes / kill-switch matrix across all verticals:** UNKNOWN (EXO PRD skeleton exists; not wired to Bentley verticals in-repo).

## Cross-vertical shared services (finance, legal, data, brand, infrastructure) — what is shared vs. siloed per vertical.

| Area | Shared (evidenced) | Siloed / UNKNOWN |
|------|--------------------|------------------|
| Brand / voice | RareAngels brand voice & design tokens in RareAngels1 | Cross-vertical brand system for HopeCoin/HealKids/RareEdge: UNKNOWN |
| Infra / platform | RareAngels platform services (payment, AngelVault, KYC, event bus, blockchain anchoring) host HopeCoin | Whether HopeCoin is a separate legal entity vs. a platform module: UNKNOWN |
| Finance | Dual-rail payments (Stripe + HopeCoin); PCI SAQ-A via Stripe | Holding-company treasury / shared finance org chart: UNKNOWN |
| Legal / compliance | HIPAA/BAA checklists, privacy/ToS, KYC/AML service, compliance_officer role | Shared counsel across verticals: UNKNOWN |
| Data | Healthcare Context Bus, AngelVault ledgers, HopeCoin economics tables inside RareAngels1 | Cross-vertical data lake / EXO data plane: UNKNOWN |

## Any existing AI agents, tools, or automations already in use today, per function.

| Function | What exists today (repo-evidenced) |
|----------|-------------------------------------|
| Family support AI | Angel Assistant / Haven (Vertex AI); character files in `config/character/` |
| Crisis | Crisis signal detection → human coordinator (pilot P95 ≤10 min target) |
| Engineering | Cursor/Claude Software Factory agents executing WOs; human review gates |
| Payments / HopeCoin | Rate oracle, burn orchestrator, reward distribution, KYC/AML monitoring, mission-lock orchestrator, blockchain node failover — largely **code-complete / flag-gated**, not necessarily live mainnet |
| Matching / ops | Volunteer matching, donor management, partnership escrow consumers (event-driven) |
| Live production agent fleet as EXO “teammates” with permission envelopes | UNKNOWN |

## The single most important metric for the business as a whole.

**UNKNOWN** at holding-company level. Closest documented primary KPI for the live product vertical: **Core Loop Fulfillment Rate ≥70%** (support requests fulfilled within 24h by Circle members without team intervention) for the 50-family RareAngels pilot (`docs/pilot/success-criteria-v1.0.md`).

---

# SECTION B — Per vertical: HopeCoin

## One-line identity: what this entity is, in a sentence.

HopeCoin (ticker **HOPE**) is RareAngels’ mission-locked community currency / token rail for recognizing contributions and moving value inside care circles, AngelVault wallets, rewards, escrow, and (designed) dual-rail checkout — currently piloted as **platform credits**, with on-chain ERC-20 settlement pending regulatory clearance.

## Legal/entity type: (for-profit, nonprofit, fund, token/protocol, platform, etc.).

**Token/protocol + platform module** (ERC-20 HopeCoin + AngelVault/escrow contracts + off-chain ledger). Parent RareAngels nonprofit status: **“[to be determined: nonprofit status pending]”** (ToS §7.3). Separate HopeCoin legal entity: **UNKNOWN**. Securities classification (utility vs security): **UNKNOWN** — WO-3775 explicitly requires legal determination and has not concluded.

## What it does: its product/service and who it serves (2-3 paragraphs).

HopeCoin is the incentive and settlement layer for RareAngels’ rare-disease family support platform. Families, Angels (peer supporters/donors), volunteers, and partners earn or transfer HOPE for participation (prayer/crisis support, volunteering, mentorship rewards, marketplace/HeartCart fulfillment, corporate volunteer hours). Balances surface in AngelVault; `give()` and transfers must carry one of eight canonical **mission purpose categories**: `medical_expenses`, `transportation`, `food_nutrition`, `equipment_supplies`, `services`, `education`, `emergency_support`, `charitable_donations`.

On-chain design (committed `HopeCoin.sol`): fixed **1,000,000,000** max supply; **1.0% burn** on non-exempt transfers; genesis pools — Platform Rewards **400M**, Foundation Reserves **300M**, Community Grants **200M**, Team & Advisors **100M**; target network **Polygon L2**. Dual-rail architecture pairs HopeCoin with Stripe fiat. A rate oracle publishes HopeCoin/USD (composite with **$0.15** target peg). Redemption/conversion services exist in code (quote → receipt-backed request → KYC gate → burn/payout instructions), flag-gated off for live money.

**Pilot reality (ADR-WO6554, draft pending Rod sign-off):** no real crypto issued/held/transferred; balances are fiat-equivalent ledger credits; UI keeps HC branding with “Pilot mode · Credits tracked, blockchain settlement pending”; `ENABLE_HOPECOIN` feature flag; on-chain transition blocked on WO-3775 + counsel + BAA/DPA + audited contracts.

**Document conflict (do not paper over):** ToS §7.1 states HopeCoin has **NO monetary value** and **CANNOT be redeemed for cash**, while `services/hopecoin_redemption` implements USD conversion under KYC. Treat as unresolved product/legal tension → **UNKNOWN which rule wins in production**.

## Current state: what exists today (live product, patents, AUM, users, partnerships, code, etc.).

| Asset | State |
|-------|--------|
| Smart contracts | `smart-contracts/hopecoin-token/` (HopeCoin, vesting, subscription, burn registry), escrow/partnership/marketplace contracts, Certora specs; bug-bounty runbook assumes Immunefi **after** mainnet + audit certs |
| Backend | AngelVault orchestrator/mission-lock; `hopecoin_rewards`, `hopecoin_rate_oracle`, `hopecoin_redemption`, burn orchestrator, KYC/AML, payment dual-rail, blockchain gateway/failover |
| Mobile/web | AngelVault wallet / HopeCoin give UI (WO-6412); HopeCoin widgets/dashboards |
| Pilot | Designed for ~**50 families**; HopeCoin as credits; ~10k wallets cited as scale-ceiling assumption (unconfirmed) |
| Mainnet deployment / live AUM / circulating supply | **UNKNOWN** (production gates require deployed contract address + RPC proof; not evidenced as live) |
| Third-party audit (Trail of Bits / OZ / equiv.) | **UNKNOWN** (WO-3775 assessment required) |
| Patents specific to HopeCoin | **UNKNOWN** |
| RareAngels “58 patents / IP portfolio” | **UNKNOWN** in RareAngels1 — no inventory of 58 patents found in this extraction pass (Archive path `C:\Archive\Patents revised 3-15-26` exists but was not readable here). Do not invent categories. |

## Stakeholders / audiences: who interacts with it externally.

Families (recipients / givers), Angels / donors, volunteer mentors, nonprofit partners (501(c)(3) verification flows exist; partner incentive models mostly proposal-stage), corporate partners (employee volunteer → HopeCoin), marketplace/HeartCart fulfillers, compliance officers, multisig admins, Immunefi researchers (post-mainnet), Stripe (fiat rail), Jumio (KYC, flag-OFF until credentials).

## Core workflows: the 5-10 repeatable processes that run this entity.

1. Wallet create / custody model setup (custodial vs non-custodial) + security score / MFA
2. Earn / reward credit (activity catalog → caps → distribution request → AngelVault credit event)
3. Mission-locked transfer / `give()` (purpose category → alignment score → sign → submit or ledger write)
4. Escrow fund / milestone release / dispute / refund (HopeCoinEscrow / partnership escrow)
5. Dual-rail checkout (HopeCoin and/or Stripe) for HeartCart / donations
6. Supply accounting + daily HCB supply report + burn orchestration (transfer burn + AngelVault confirm)
7. Rate oracle publish (daily 02:00 UTC) + emergency MFA rate override
8. Fiat redemption (quote → receipts → KYC re-check → burn + payout instructions)
9. KYC/AML monitoring (tier limits, OFAC, SAR/CTR case management)
10. Economic parameter governance (audit log; 7-day vote + timelock in rewards design) + emergency `pause()`

## AI teammates / agents: which of those workflows are or should be run by agents, and what human judgment must stay above the loop.

| Workflow | Agent / automation | Human above the loop |
|----------|--------------------|----------------------|
| Reward credit, burn queue, rate publish, failover | Automated services / schedulers | Economic admins on parameter changes; ops on discrepancy alerts |
| Mission-lock validation, KYC fail-closed gates | Deterministic engines (not ML for mission-lock score) | Compliance officer on sanctions/manual review; SAR filing |
| Angel Assistant mentioning HC balances | Haven AI | Never medical advice; crisis → human coordinator |
| Escrow dispute / emergency withdraw / pause | Multisig roles | CTO/multisig for Critical bounty / `HopeCoinEscrow.pause()` |
| On-chain go-live / securities & MTL posture | N/A | Legal + Rod (WO-3775 / ADR-6554) |
| Agent-initiated payments (x402 / agentic wallets) | PRD research artifact only | **UNKNOWN** if approved for production |

## Data it owns: the key data assets, their sensitivity, and any regulatory constraints.

- Wallet addresses, balances, ledgers, `hopecoin_transactions`, burn/buyback/allocation tables
- Purpose categories + receipts (redemption) — may link to **PHI** when `medical_expenses` / `equipment_supplies`
- KYC docs (ciphertext-only), sanctions hits, SAR/CTR (7y audit / ≥5y SAR retention)
- Rate history, economic parameters, audit Merkle/blockchain anchors
- Sensitivity: financial + healthcare-adjacent; COPPA via parent-managed child accounts on RareAngels
- Constraints: HIPAA/BAA for PHI-adjacent paths; KYC/AML/OFAC/FinCEN SAR-CTR; potential SEC/CFTC + state money-transmitter (WO-3775 open); PCI out of scope for HC rail (Stripe owns card CDE)

## Governance / risk: the highest-stakes decisions (money, legal, customer-of-record) that need kill switches and human review.

- Contract `pause()` / emergency withdraw (multisig)
- Enable/disable `ENABLE_HOPECOIN` and redemption/burn dispatch flags
- Economic parameter changes; MFA rate overrides
- KYC tier grants; OFAC matches; SAR submission
- Transactions > enhanced thresholds (e.g. >1,000 HC enhanced confirmation in wallet security)
- Securities / MTL launch clearance (WO-3775)
- Customer-of-record for fiat payouts: **UNKNOWN** exact legal entity name on bank rails
- Bug-bounty Critical: CTO notify + evaluate pause before disclosure

## Purpose / constraints: what this entity must never do, and what it exists to achieve (feeds the purpose protocol).

**Exists to:** recognize goodwill/contribution and move mission-aligned support (care, equipment, food, transport, emergency, charitable) for rare-disease families inside RareAngels.

**Must never (evidenced constraints):**
- Move value without a canonical purpose category (mission-lock non-negotiable)
- Auto-approve spend with unknown KYC / sanctions screener error (fail-closed)
- Issue/transfer real crypto during pilot without WO-3775 clearance
- Provide medical advice via AI tied to wallet context
- Store raw card data on HopeCoin path (PCI: HC outside CDE; cards via Stripe only)
- Bypass multisig pause / emergency controls for Critical fund-loss scenarios

**ToS cash-redemption ban vs redemption service:** unresolved — **UNKNOWN** final constraint.

## Success metrics: the 3-5 numbers that define success for this vertical.

1. Pilot: HopeCoin **demoable/functional** under fiat-ledger (ADR-6554 product requirement)
2. Supply integrity: no unresolved `hopecoin_supply_discrepancy` vs on-chain `totalSupply()` when live
3. Mission-lock: **0** transfers without canonical purpose (hard invariant)
4. Oracle: daily rate published; fallback peg **$0.15**; ±5% daily move cap
5. Rewards: global cap discipline (design: **50k/day** global cap in `hopecoin_rewards` README)

Holding-level revenue/AUM KPIs for HopeCoin alone: **UNKNOWN**. Engagement proxy may inherit RareAngels pilot KPIs (activation, fulfillment, retention) rather than token price.

## Dependencies on other verticals: how it connects to the others.

- **RareAngels platform:** primary host — AngelVault, Circles, HeartCart, donations, volunteer/partner rewards, Haven
- **Payment / Stripe:** fiat dual-rail and pilot fallback
- **KYC/compliance:** gates redemption and monitoring
- **Healthcare Context Bus / analytics:** supply reports, burn analytics, observability
- **HealKids / RareEdge / EXO:** no coded dependency found in RareAngels1 → **UNKNOWN** product coupling (shared founder/operator only, evidenced by email/domain and sibling repos)

---

# SECTION C — Regulatory & compliance map

| Regime | Applies to | Notes / status |
|--------|------------|----------------|
| HIPAA / BAA / healthcare DPA | RareAngels (+ HopeCoin when purpose/PHI-linked) | BAA checklists; Vertex/GCP BAA gates; PHI if medical purpose categories |
| COPPA / children’s privacy | RareAngels (HopeCoin via parent accounts) | Under-13 parental consent; DOB for age verification |
| GDPR / DSAR | RareAngels platform | Privacy policy + security framework WOs |
| PCI DSS SAQ-A | RareAngels fiat/Stripe rail | HopeCoin crypto rail **out of PCI scope** |
| KYC / AML / OFAC / FinCEN SAR & CTR | HopeCoin + payment | `services/kyc_compliance`; tier limits; CTR >$10k/day |
| SEC / CFTC securities & commodities | HopeCoin token | **UNKNOWN** classification — WO-3775 open |
| State money-transmitter | HopeCoin on-chain / stored value | Explicit open question in ADR-6554 / WO-3775 |
| IRS / tax (501(c)(3), receipts, 1099-K) | RareAngels donations / nonprofit partners; HopeCoin charitable categories | Nonprofit status **pending** per ToS; tax-receipt services exist in code |
| Smart-contract / DeFi security & Immunefi | HopeCoin / AngelVault contracts | Pause + bounty after mainnet/audits |
| IP / patent | RareAngels (claimed exclusive IP in README) | **58-patent portfolio detail: UNKNOWN** in this source set |
| App store / privacy labels | RareAngels mobile | WO-6407/6408 surfaces |
| EXO / Organizational Singularity product regs | EXO research repo | Separate from HopeCoin; not mapped to HC compliance |

---

**Sources (primary):** RareAngels1 `docs/legal/*`, `docs/adr/ADR-WO6554*`, `docs/pilot/success-criteria-v1.0.md`, `smart-contracts/hopecoin-token/contracts/HopeCoin.sol`, `services/{angelvault,hopecoin_*,kyc_compliance}/*`, WO-3775, KYC/PCI/runbook docs. **Not invented:** holding MTP, 58-patent breakdown, live mainnet AUM, final securities opinion, HopeCoin separate entity papers.
