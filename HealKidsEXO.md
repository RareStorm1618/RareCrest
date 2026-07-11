# EXO Ecosystem Content Extraction — Heal Kids.AI

**Date:** 2026-07-10  
**Scope:** Section A (holding layer) + Section B (Heal Kids.AI only) + Section C (regulatory map)  
**Evidence rule:** Factual / specific only. UNKNOWN where not evidenced.  
**Primary sources:** HEALKidsAI (`MasterDev` requirements, legal/nonprofit docs, AI worker, production readiness); EXO research repo; RareStorm 501(c)(3) materials.  
**Source integrity note:** Heal Kids facts are grounded in HEALKidsAI requirements/legal docs/code. Holding-layer EXO-for-Bentley verticals, shared services map, north-star business metric, production user counts, and Rare Angels’ 58-patent breakdown remain UNKNOWN pending operator-supplied source packs (patent index exists at `RareAngels/misc/Patent/` but was not fully extracted into this document).

---

## SECTION A — Business-wide (the holding layer above all verticals)

### The overarching purpose / mission that ties all verticals together (one paragraph).

UNKNOWN for a formal holding-company mission that binds all Bentley verticals. Adjacent (different product): EXO PRD v1 frames EXO as productizing Organizational Singularity / ExO 3.0 so organizations become AI-native with humans above the loop — not a documented multi-vertical operating company charter. Observed rare-disease cluster (Heal Kids / RareStorm / RareAngels companion): mission language centers on solving rare disease and supporting affected families; whether that is the holding-layer MTP is UNKNOWN.

### The operating principle for how the business is run AI-first with one human director — what decisions stay with the human vs. what agents handle.

UNKNOWN as a written Bentley holding-layer decision matrix. Documented pattern inside Heal Kids only: agents execute below the loop (categorization, screening, translation, receipts, indexing, recommendations); humans retain moderation approval, child-safety review, AML/fraud holds, donations >$5,000 stewardship, annual-report editorial review, and medical-diagnosis authority (Navigator is explicitly not a diagnosis). EXO PRD principle (general, not Bentley-specific): “humans above the loop (validators), not gatekeepers on the critical path”; GOVERN/ASSURE kill switches / permission envelopes required — applicability to this holding company is UNKNOWN.

### Cross-vertical shared services (finance, legal, data, brand, infrastructure) — what is shared vs. siloed per vertical.

UNKNOWN at holding layer. Observed for Heal Kids: finance/donations via RareStorm 501(c)(3) + Every.org / Giving Block; legal/privacy under Arizona + GDPR/CCPA requirements; infra = Vercel client + AWS ECS api/ai-worker + Postgres/Redis/SQS; brand = healkids.ai / RareStorm. What is shared with Rare Angels, RareEdge, or other verticals is UNKNOWN.

### Any existing AI agents, tools, or automations already in use today, per function.

Holding-wide inventory: UNKNOWN. Heal Kids (code-complete in repo; production-live status UNKNOWN) AI Worker engines include: idea categorization + duplicate detection; content screening; translation prewarm; Mission Companion; Diagnosis Navigator; Meeting Deliberation AI; Collective Intelligence Synthesis; Library AI; Advocacy Asset Generator; Coalition Match; Search Indexer; Knowledge Graph / Atlas / Policy ingestion; Impact Metrics / Modeling / Sharing; Agentic Donation Processor (AML → receipt → CRM); Notification Dispatcher; Leaderboard / XP / membership / recruitment / professional-verification / section-health / annual-report generators. Tooling stack: OpenAI (worker), DeepL/Google/OpenAI translation, Stripe Radar, Mux video, Every.org / Giving Block, Zoom, Software Factory MCP for delivery. Cursor/Claude CLI agent fleets used for software delivery (operator practice) — not product runtime.

### The single most important metric for the business as a whole.

UNKNOWN.

---

## SECTION B — Per vertical: Heal Kids.AI

### One-line identity: what this entity is, in a sentence.

HealKids.ai is RareStorm’s multilingual global advocacy and collaboration platform for pediatric (and broader) rare-disease impact, aimed at Phase 2 solution development under the Perfect Formula.

### Legal/entity type: (for-profit, nonprofit, fund, token/protocol, platform, etc.).

Platform / pilot program operated under **RareStorm**, an Arizona-registered **501(c)(3) public charity** (EIN **84-3305217**; exemption effective **September 12, 2019**; public charity status IRC 170(b)(1)(A)(vi); ACC File **23020313**). Formerly **AbriStorm**; Articles of Amendment to RareStorm approved **2025-02-26** / public-notice date **2025-03-20**. Not a for-profit, fund, or token protocol. Contact/founder on IRS/ACC materials: **Roderick / Rod Bentley**.

### What it does: its product/service and who it serves (2-3 paragraphs).

Rare disease affects ~488M people globally; ~75% of rare diseases affect children; average diagnostic odyssey ~6 years / 17 specialists; only ~5% of ~11,000 rare diseases have approved treatments (platform research claims). RareStorm completed a **22-month Phase 1** stakeholder investigation; HealKids.ai is the digital home for **Phase 2** — making the problem accessible, credible, and actionable worldwide.

The product is a stakeholder hub (**21 sections**: 5 Phase 1 — Patients Children/Adults, Families, Hospice, Nonprofits; 16 Phase 2 — providers, AI researchers, pharma, FDA, VC, insurance, universities, etc.). Visitors explore research (Tear Sheet + footnotes + mini-browser), submit ideas (typed/voice, anonymous option), join Zoom stakeholder meetings with deliberation AI, donate to RareStorm (card/ACH/wire/check/crypto via intermediaries), use AI tools (Diagnosis Navigator, Advocacy Toolkit, Knowledge Graph, Atlas, Coalition Builder, Mission Companion), and track the north-star **HealKids.ai International Children’s Hospital** (Scottsdale, AZ). Companion platform **RareAngels.com** is specified for direct patient/family support (distinct product surface).

### Current state: what exists today (live product, patents, AUM, users, partnerships, code, etc.). For Rare Angels, detail the 58 patents / IP portfolio — categories and what they cover.

- **Code:** HEALKidsAI monorepo — client-app (Next.js/Vercel), api-server, ai-worker; **157 work orders** Phases 1–5 implemented; **1,095 unit tests** passing as of 2026-07-04 production-readiness doc.
- **Live production / public users / AUM / revenue:** UNKNOWN (readiness checklist still open: secrets, counsel review, expert sign-off on impact methodology, staging QA).
- **Research IP:** Phase 1 Tear Sheet + Box Introduction + stakeholder research corpus (200+ research content items seeded); not a patent portfolio.
- **Rare Angels 58 patents / IP portfolio:** N/A to this vertical’s own assets; categories/coverage for Rare Angels patents: **UNKNOWN** in Heal Kids sources (index files located at `RareAngels/misc/Patent/PATENT_PORTFOLIO_INDEX.md` and `patent-portfolio-matrix.md` — not yet extracted here).
- **Nonprofit:** RareStorm EIN/status documented; donations designed via Every.org slug `healkids` + Giving Block crypto path.
- **Partnerships:** Corporate/Institutional Partnership Portal specified; live partner count: UNKNOWN.

### Stakeholders / audiences: who interacts with it externally.

Families/caregivers; child and adult patients; donors/supporters; healthcare providers; researchers/academics/pharma; nonprofit leaders; general public; institutional partner representatives; press/media; Ambassadors; verified healthcare professionals; children via parent-supervised Children’s Voice Hub; MCP/API integrators.

### Core workflows: the 5-10 repeatable processes that run this entity.

1. Stakeholder research browse + footnote verification
2. Community idea submission → AI categorize/embed/dedupe → publish or moderation hold
3. Content moderation / trust & safety (UGC + child-safety queue)
4. Donation intake → fraud/AML gates → agentic post-donation (log, receipt, CRM)
5. Stakeholder meeting schedule → Zoom → live deliberation AI → post-meeting synthesis
6. Mission Companion recommendations / onboarding paths
7. Diagnosis Navigator session (anonymous, non-persisted)
8. Advocacy asset generation + policy-tracker alerts
9. Children’s Voice Hub (parent consent → child submit → 48h safety review → gallery)
10. Account lifecycle (auth, child profiles, right-to-forget / deletion)
11. Hospital vision funding tracking + institutional partnership commitments
12. Annual Global Rare Disease Intelligence Report draft → human editorial → publish

### AI teammates / agents: which of those workflows are or should be run by agents, and what human judgment must stay above the loop.

| Workflow | Agent role | Human above the loop |
|---|---|---|
| Idea pipeline | Categorize, embed, duplicate-merge | Low-confidence / policy → moderation; publish decisions |
| UGC screening | AIScreeningService | Approve/reject/block |
| Donations | Agentic processor, AML, receipts | AML flags; fraud holds; >$5k stewardship |
| Meetings | Claim tagging + synthesis | Chair/co-chair facilitation; action ownership |
| Navigator | Ranked disease candidates | Not a diagnosis; licensed clinician required |
| Children’s Hub | (assistive tooling if any) | Mandatory human Child Safety Review |
| Annual report | Draft compiler | RareStorm leadership editorial review |
| Mission Companion | Rank ≤3 actions | User dismiss/control; no autonomous outward acts |

### Data it owns: the key data assets, their sensitivity, and any regulatory constraints (securities, nonprofit, crypto/AML, children's data/COPPA for Heal Kids, etc.).

Account email/country/preferences; ideas & embeddings; donations/donor CRM fields; meeting transcripts/syntheses; children’s submissions + parental consent records; moderation audit logs; partnership commitments; search index; knowledge graph/atlas datasets; encrypted PII (KMS). **Sensitivity:** high for child data, health-adjacent symptom text, donor financials, E2EE DMs. **Constraints:** GDPR, CCPA, Arizona nonprofit/charitable solicitation, COPPA-style children’s privacy (parental consent, Children’s Privacy Policy), crypto AML/KYC via intermediary, PCI via Stripe/Every.org (RareStorm non-custodial for crypto). HIPAA covered-entity status: UNKNOWN (Navigator designed to avoid retained PHI).

### Governance / risk: the highest-stakes decisions (money, legal, customer-of-record) that need kill switches and human review.

Money: donation fraud/AML holds; large-gift stewardship; hospital funding designations. Legal/customer-of-record: RareStorm as charity of record; Terms/Privacy material updates require re-ack. Child safety: no publish without moderator. Medical: Navigator disclaimer + no persisted symptom profiles. Content: user block cascades; moderation queue. Impact modeling production use gated on external expert sign-off (WO-111/157). Outward irreversible actions (publish annual report, convert flagged crypto, approve child content) require humans.

### Purpose / constraints: what this entity must never do, and what it exists to achieve (feeds the purpose protocol).

**Exists to:** make rare disease solvable at scale via global stakeholder collaboration; advance Perfect Formula Phase 2; fund/build toward HealKids.ai International Children’s Hospital; honor children’s voices. **Must never:** present Navigator output as a medical diagnosis; publish children’s content without parent consent + safety review; store anonymous-submitter identity; drop low-confidence ideas silently (hold instead); let RareStorm custody crypto (intermediary only); use platform for harassment, medical misinformation, or unlawful activity (Terms). Mission drift into for-profit exploitation of children’s data: constrained by 501(c)(3) purpose (research, collaboration, family support).

### Success metrics: the 3-5 numbers that define success for this vertical.

1. Global reach: ≥50 countries, ≥20 languages, ≥25% non-English visits (12 months)
2. Engagement: ≥500 verified ideas from ≥30 countries (6 months); session >4 min; bounce <50%
3. Financial: ≥$50k donations Y1; ≥3 payment methods; conversion ≥25% desktop / ≥20% mobile
4. Collaborative activation: ≥1 stakeholder call/month (≥10 participants); ≥3 groups with documented solution proposals Y1
5. AI/hospital: ≥1,000 Navigator sessions Y1; first hospital Funding Milestone; ≥10 verified Partner Organizations

### Dependencies on other verticals: how it connects to the others.

Explicit companion: **RareAngels.com** (patient support, crisis resources, specialist directory, grants, trial matching) — Heal Kids = collaboration/advocacy; Rare Angels = direct family support. Shared founder/operator (Bentley) and rare-disease mission adjacency. Shared services with RareEdge / other EXO verticals: UNKNOWN. Software delivery uses shared Software Factory / agent fleet practices: operational, not product dependency.

---

## SECTION C — Regulatory & compliance map

List every regulatory regime touching the business (securities/SEC for the fund, nonprofit/501c3, crypto/AML/KYC, children's privacy, IP/patent, data protection) and which vertical each applies to.

| Regime | Applies to | Notes / evidence |
|---|---|---|
| **US 501(c)(3) / IRS Form 990** | Heal Kids / RareStorm | EIN 84-3305217; public charity; contribution deductibility |
| **Arizona nonprofit / ACC / charitable solicitation** | Heal Kids / RareStorm | AZ registration; Donor Rights → AZ AG Charitable Trust Section |
| **GDPR (EU)** | Heal Kids | Privacy, right-to-forget, account deletion |
| **CCPA (California)** | Heal Kids | Privacy policy requirements |
| **COPPA / children’s privacy** | Heal Kids (Children’s Voice Hub) | Parent Guardian consent; Children’s Privacy Policy; no child accounts; PII minimization in gallery |
| **Payment / PCI (via processors)** | Heal Kids donations | Stripe / Every.org embeds; device fingerprint disclosed |
| **Crypto AML/KYC / sanctions screening** | Heal Kids crypto donations | Wallet AML before conversion; human hold on flags; non-custodial via Every.org/Giving Block |
| **FinCEN / money transmitter** | UNKNOWN for RareStorm directly | Designed as intermediary-processed; holding-layer crypto (HopeCoin etc.) is Rare Angels SF content, not Heal Kids |
| **FDA digital health / medical device** | Heal Kids Navigator (risk) | Requirements frame as non-diagnosis starting point; formal classification: UNKNOWN |
| **HIPAA** | UNKNOWN / likely avoided | Navigator: no account, no IP/session persistence of symptoms |
| **IP / copyright (UGC, research)** | Heal Kids | Terms: IP of contributed content; Tear Sheet citations |
| **Patent portfolio (58 patents)** | Rare Angels (prompt) — **not evidenced in Heal Kids** | UNKNOWN categories/coverage (see `RareAngels/misc/Patent/`) |
| **Securities / SEC (fund)** | Not Heal Kids | N/A unless a separate fund vertical exists — UNKNOWN |
| **State charitable solicitation (multi-state)** | Heal Kids / RareStorm | Referenced; full multi-state registration status: UNKNOWN |

---

## Follow-up sources (not yet extracted)

| Path | Relevance |
|---|---|
| `C:\Users\MP3-Backup\Documents\GitHub\EXO\research\EXO-PRD-Requirements-v1.md` | EXO product PRD (Organizational Singularity) — adjacent, not Bentley holding OS |
| `C:\Users\MP3-Backup\Documents\GitHub\RareAngels\misc\Patent\PATENT_PORTFOLIO_INDEX.md` | Rare Angels patent index |
| `C:\Users\MP3-Backup\Documents\GitHub\RareAngels\misc\Patent\Overview\patent-portfolio-matrix.md` | Patent portfolio matrix |
| `C:\Users\MP3-Backup\Documents\GitHub\OpenClaw\openclaw-workspace\agents\MASTER-SYSTEM-PROMPT.md` | Mentions EXO / above-the-loop language |
