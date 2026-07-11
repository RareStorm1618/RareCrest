# EXO — Product Requirements Document (PRD) & Requirements Specification

| Field | Value |
|---|---|
| **Document** | EXO PRD / Requirements Specification |
| **Version** | 1.0 |
| **Date** | 2026-07-10 |
| **Status** | Complete domain + product requirements baseline |
| **Owner** | EXO project (to assign) |
| **Canon** | *The Organizational Singularity* OS Outline **v25** (June 2026), Salim Ismail with contributors |
| **Local sources** | `C:\Archive\EXO\original docs\` |
| **Research companion** | `research/exo-prd-online-research-brief-2026-07-10.md` |
| **Supersedes** | `research/exo-prd-skeleton.md` (v0.1) |

---

## 0. Executive summary

### What EXO is

**EXO** is the productization of the Organizational Singularity / ExO 3.0 operating model: a system that helps organizations **diagnose** their AI-native readiness, **design** a destination architecture (MTP + DRIVE + SHAPE), **specify** an Intelligence Stack with GOVERN/ASSURE controls, and **migrate** via the REWRITE playbook (Direct Mode or Edge Twin).

It is not “another chatbot bolted onto the org chart.” It is the tooling and method for rewriting the firm around intelligence rather than hierarchy.

### The three frameworks EXO must always carry

| Framework | Role | Analogy (v24) |
|---|---|---|
| **ExO 3.0** | Destination architecture | Where you are going |
| **Intelligence Stack** | Operating system | Engine block |
| **REWRITE** | Migration playbook | How you get there |

Supporting mechanisms EXO must also encode: Fiduciary Wedge, Edge Deployment / Edge Twin, Direct vs Edge Mode, Self-Disruption Probe, Middle 60% / Bridge Curriculum, GOVERN/ASSURE Four Pillars, Minimal Viable Intelligence Stack (MVIS), MTP-as-protocol, HIDO six questions, Agent Spec (8 properties).

### Recommended product stance (resolves open decisions)

| Decision | Recommendation for v1.0 |
|---|---|
| **D1 — What is EXO?** | **Hybrid Organizational OS toolkit**: Skill companion + Diagnostics/Scorecards + Design artifact studio. Runtime GOVERN/ASSURE enforcement is **Phase 2**. High-touch Pilot method is a **services overlay**, not the only product. |
| **D2 — Primary user** | **Transformation lead / CAIO** as daily user; **CEO/board** as decision authority and mandate giver. |
| **D3 — Stack naming** | **Canonical = book/skill six layers** (PURPOSE → SENSE → INTERPRET → DECIDE → ORCHESTRATE/ACT → LEARN + GOVERN/ASSURE). Treat 10x Shift five-layer naming as workshop marketing until reconciled. |
| **D4 — Commercial** | Freemium diagnostics + paid design studio / skill; optional Pilot SOW; runtime SaaS later. |
| **D5 — Runtime** | Phase 1 = specs, gates, templates, traces (design-time). Phase 2 = enforce evals/logs/rollback/queues (run-time). |

### Why now (market signal)

MIT Technology Review (May 2026): **85% of organizations want to be agentic within three years; 76% say their current operating model cannot support it.** That ambition–architecture gap is the problem EXO exists to close.

---

## 1. Problem statement

### 1.1 The structural problem

For nearly a century, firms existed because internal coordination was cheaper than market coordination (Coase, 1937). Agentic AI inverts that economics: execution and coordination costs collapse toward zero, while **accountability, trust, and purpose** remain scarce. Hierarchy-as-operating-system becomes the bottleneck.

Most enterprise AI fails because it is **AI-enhanced** (tools on old workflows), not **AI-native** (work routed through intelligence layers with humans above the loop).

### 1.2 Failure modes EXO must prevent

| Failure mode | Description | Source |
|---|---|---|
| Dabbling | Leadership calendars and approval chains unchanged; AI is theater | Krivkovich / Appendix A |
| Tokenmaxxing | Input proxies (tokens) rewarded; org geometry unchanged; cycle time flat | Appendix A / v24 |
| Quiet Drift | Agents degrade slowly without eval detection | Ch.4 |
| PocketOS / Amazon Q pattern | Destructive autonomy without permission envelopes / kill switches | Ch.4 callouts |
| DRIVE without SHAPE | Speed without fiduciary / human / trust chassis | Ch.3 |
| Vendor Shortcut | Renting a suite catalog mistaken for operating-model rewrite | Ch.3 / skill |
| Mothership immune system | Core transformation killed by middle-layer antibodies | Edge Deployment / Moonshots |
| Codifier’s Curse mishandled | Knowledge extraction without transition support | REWRITE Step 3 |
| Cognitive captivity | Learning loop owned by a single model/platform landlord | Nadella / v25 |

### 1.3 Opportunity

Provide a single coherent system that:

1. Makes the destination machine-readable (MTP protocol + ExO 3.0 scorecards).  
2. Makes the operating system explicit (Intelligence Stack + agent/data specs).  
3. Makes migration sequenced and gated (REWRITE + diagnostics + Edge Twin).  
4. Makes governance operational from Day 1 (Four Pillars), not a post-hoc compliance deck.

### 1.4 Sources for this section

- Local: `The-Organizational-Singularity-v25.md` (Core Thesis, Ch.1–4, 9–10)  
- `Boundary_Revised.pdf` / Resource Hub “New Boundary of the Firm”  
- https://openexo.com/organizational-singularity  
- https://computationeconomy.com/  
- https://www.youtube.com/watch?v=I9c8STV7Hnw (Moonshots #258)  
- https://www.sdlcnext.com/blog/moonshots-ep258-organizational-singularity/ (incl. critique)

---

## 2. Goals, non-goals, and success definition

### 2.1 Goals

**G1 — Diagnostic clarity:** A leadership team can complete the Appendix A suite and know Direct vs Edge mode, readiness band, Miura-Ko level, and whether they are dabbling/tokenmaxxing.

**G2 — Destination fidelity:** Produce a signed Destination Architecture with MTP protocol passing three litmus tests and Five Design Conditions binding.

**G3 — Spec completeness:** No agent ships without an 8-property blueprint; no workflow migrates without a Workflow Data Manifest + HIDO answers.

**G4 — Safe migration:** Parallel-run-then-deprecate with pre-defined success criteria, cold-start learning feeds, and kill switches.

**G5 — Compounding measurement:** Primary KPI is **volume of workflows safely executed by autonomous agents under human command** (and learning velocity)—not seats, not tokens.

### 2.2 Non-goals (v1)

- Guaranteeing specific headcount reduction percentages (treat 10–25% workforce hypotheses as **scenario planning**, not acceptance criteria).  
- Replacing ERP/SAP/Oracle suites wholesale in v1.  
- Building a general-purpose multi-agent framework unrelated to ExO 3.0.  
- Confusing Massive Transformative Purpose with Model Tools Protocol (unrelated CLI `--mtp-describe` project).  
- Shipping runtime enforcement before design-time gates are solid (Phase 2).

### 2.3 Definition of done for this PRD

This PRD is “done” when:

- Domain requirements are complete and testable (Sections 5–9).  
- Product surfaces and phases are specified (Sections 4, 10–12).  
- Open risks and verification gaps are explicit (Section 13).  
- Source traceability exists for every major requirement family (Appendix A).

---

## 3. Users, personas, and jobs-to-be-done

### 3.1 Primary personas

| Persona | Goals | Primary EXO surfaces | Pain if EXO fails |
|---|---|---|---|
| **CEO / Board** | Mandate rewrite; choose Direct vs Edge; own Fiduciary Wedge | Executive brief, Readiness band, Destination Architecture sign-off | Transformation theater; liability without control |
| **CAIO / CIO** | Stand MVIS; data-plane inversion; Edge Twin gates; vendor resistance | Diagnostics, Edge Twin Diagnostic, manifests, Four Pillars | Integration stall; cognitive captivity |
| **Transformation / ExO Lead** | Run workshops; facilitate REWRITE sequence | Scorecards, canvases, playbooks, skill companion | Sequence skipped; Step 1 missing |
| **Function Owner** (AP, CX, Ops) | First twin on a bounded workflow | Task Decomposition, agent blueprints, parallel-run metrics | Faster bureaucracy |
| **Agent Builder / Engineer** | Spec, eval, deploy within envelopes | Agent Spec, eval suites, decision traces | PocketOS-class incidents |
| **Exception Architect** (ex-middle manager) | Own escalations, Bridge Curriculum, tacit capture | Human Review Queue design, elicitation agents | Deskilling / resistance |
| **CFO / Risk / Legal** | Fiduciary, audit, kill switches, disclosure | GOVERN/ASSURE, SOX-for-AI framing, logs | Unbounded agent liability |

### 3.2 Core jobs-to-be-done

1. **When** we claim to be “AI-native,” **I want** a falsifiable diagnostic, **so that** we stop paying for theater.  
2. **When** we start a rewrite, **I want** a backcast destination before tools, **so that** we don’t optimize the wrong org.  
3. **When** we deploy agents, **I want** specs + pillars ≥3, **so that** we don’t delete production in nine seconds.  
4. **When** we migrate a workflow, **I want** parallel proof + learning from overrides, **so that** the twin compounds.  
5. **When** purpose is stated, **I want** agents that can refuse and leaders that would endorse, **so that** MTP governs rather than cheers.

### 3.3 Sources

- Book Ch.5–7 (Vertical Rewrite), CEO Quick Start, Appendix A/F  
- Built from Zero workshop — https://openexo.com/resource-hub/build-from-zero-workshop-workbook  
- Pilot cohort — https://openexo.com/organizational-singularity-pilot  
- Instar EXO 3.0 — https://instar.sh/features/exo3/

---

## 4. Product definition & surfaces

### 4.1 Product architecture (recommended)

```text
┌─────────────────────────────────────────────────────────────┐
│  EXO Organizational Operating System                        │
├──────────────┬──────────────┬──────────────┬────────────────┤
│  S0 Content  │  S1 Diagnose │  S2 Design   │  S3 Migrate    │
│  Book/Skill  │  Scorecards  │  Artifacts   │  Twin playbook │
├──────────────┴──────────────┴──────────────┴────────────────┤
│  S4 Runtime (Phase 2): Evals · Logs · Rollback · HRQ · Kill │
├─────────────────────────────────────────────────────────────┤
│  S5 Services overlay: Pilot Diagnose→Design→Pilot→Prove→Scale│
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Surface requirements

| Surface | v1 | Description |
|---|---|---|
| **S0 — Skill / Book companion** | MUST | Interactive ExO 3.0 skill (Claude/Codex) with contextual prompts; refuse generic-summary-only mode |
| **S1 — Diagnostics suite** | MUST | Appendix A full suite + Four Pillars + mode recommendation |
| **S2 — Design studio** | MUST | MTP protocol, DRIVE/SHAPE scorecards, Backcasting Canvas, Agent Specs, HIDO, Workflow Data Manifest, Decision Trace schema |
| **S3 — Migration workspace** | MUST | REWRITE step tracker, Edge Twin checklist, parallel-run criteria, cold-start feeds, people-transition envelope |
| **S4 — Runtime control plane** | SHOULD (Phase 2) | Enforce pillars in production |
| **S5 — Pilot method kit** | SHOULD | 3-month Diagnose→Scale facilitation pack for services delivery |
| **S6 — Assessment funnel** | MAY | ExQ-like public lead-gen assessment bridging to S1 |

### 4.3 Ecosystem alignment (observed OpenExO surfaces)

EXO should be compatible with—not necessarily duplicate—existing OpenExO distribution:

| Existing surface | URL / location | EXO relationship |
|---|---|---|
| Bookapp v25 | https://openexo.com/organizational-singularity | Content canon |
| Resource Hub | https://openexo.com/resource-hub | Playbooks, PDFs, skills |
| Claude Skill | Hub + local `.skill` archives | S0 implementation seed |
| ExQ / platform | https://platform.openexo.com/ | Funnel pattern for S6 |
| 10x Shift | https://openexo.com/10x-shift | Top-of-funnel workshop |
| Pilot | https://openexo.com/organizational-singularity-pilot | S5 services pattern |
| Instar EXO3 | https://instar.sh/features/exo3/ | Adjacent runtime reference for S4 |

---

## 5. Domain architecture requirements (canonical model)

These are **normative**. Any EXO implementation MUST preserve this model.

### 5.1 ExO 3.0 destination (REQ-DEST)

**REQ-DEST-01 — Ten characteristics.** EXO SHALL represent ExO 3.0 as MTP + DRIVE(5) + SHAPE(5). DRIVE and SHAPE components are scored 1–5 (max 50 combined). MTP is gating, not scored on the same 1–5 scale.

**DRIVE (intelligence engine):**

| Code | Name | Meaning |
|---|---|---|
| D | Decision Architecture | Two-way doors get speed; one-way doors get human gating |
| R | Recursive Learning | Workflows versioned; optimizations propagated |
| I | Intelligence Stack | Engine block; I score capped at lowest Four Pillars score |
| V | Value Moat | Proprietary data, network effects, intelligence density, reconfiguration speed, curatorial judgment |
| E | Elastic Agency | Capability Registry, Graduated Authority, Decision Boundary Map |

**SHAPE (organizational form):**

| Code | Name | Meaning |
|---|---|---|
| S | Safe Autonomy | Fiduciary Wedge, compliance-as-code, kill switches, audit, agent-to-agent oversight |
| H | Human Architecture | Middle 60%, Junior Loop, Bifurcation Risk, Binding Problem (retention-by-resonance) |
| A | Adaptive Architecture | Modular pods; org chart as swappable component |
| P | Purpose Control | MTP protocol + litmus tests + Agentic Fidelity Paradox defense |
| E | Ecosystem Trust | Policy API for external agents; traveling data metadata; pre-agreed liability |

**REQ-DEST-02 — Crossing rule.** EXO SHALL warn when DRIVE is advanced without SHAPE (“DRIVE without SHAPE is a fuse waiting for a spark”) and SHALL apply GOVERN-cap: high DRIVE without GOVERN/ASSURE is overstated (cap DRIVE total at 13/25 until GOVERN exists at least in alert-only mode).

**REQ-DEST-03 — Five Design Conditions (binding Step-1 gate).** Destination Architecture is incomplete unless all five hold:

1. AI-Centric Workflow Architecture  
2. Recursive Improvement Infrastructure  
3. Model Sovereignty and Governed Autonomy  
4. Intelligence Density at Every Layer  
5. Human Flourishing as a Binding Constraint  

**REQ-DEST-04 — Three Compounding Loops.** EXO SHOULD visualize and check that optimizations do not starve sibling loops:

- Intelligence: D → I → R → V  
- Trust: Ecosystem Trust → Elastic Agency → Value Moat  
- Governance: Safe Autonomy → Adaptive Architecture → Recursive Learning  

**REQ-DEST-05 — Automotive framing.** UX copy MAY use: Stack = engine block; DRIVE = drivetrain; SHAPE = chassis/safety.

### 5.2 MTP as protocol (REQ-MTP)

**REQ-MTP-01 — Three layers.** MTP SHALL be authored as:

1. **Constraint Layer** — hard forbidden actions with trigger, refusal, log/escalate  
2. **Decision Layer** — weighted tradeoff rules (two agents must converge)  
3. **Identity Layer** — why high-judgment humans stay + **explicit disqualifiers**  

Plus an inspirational one-sentence MTP statement.

**REQ-MTP-02 — Three litmus tests (all required to pass).**

1. **Endorsement:** Could an agent, given only the protocol, make a decision leadership would endorse?  
2. **Refusal / non-build:** Could that agent decide what NOT to build?  
3. **Identity:** Could a high-judgment human, reading only Identity Layer, answer why they stay, what is visible, and who the org is not for?  

**REQ-MTP-03 — Agentic Fidelity Paradox.** EXO SHALL encode purpose, not procedure, and route drift detection to GOVERN (evals), not ever-tighter scripts alone.

**REQ-MTP-04 — Product feature parity (Instar-informed).** EXO SHOULD support:

- Constraint objects with refuse+log  
- Deterministic tradeoff resolution  
- “Governs vs cheers” report from litmus runs  

Sources: MTP as Protocol PDF; skill `templates/mtp-protocol.md`; https://instar.sh/features/exo3/

### 5.3 Intelligence Stack (REQ-STACK)

**REQ-STACK-01 — Six layers + control plane.**

| Layer | Function |
|---|---|
| PURPOSE | Objectives/constraints from MTP |
| SENSE | Raw signal ingestion |
| INTERPRET | Context, history, scenarios |
| DECIDE | Options + commit within Permission Envelope |
| ORCHESTRATE / ACT | Execute via tools/APIs/humans/agents |
| LEARN | Evaluate outcomes; propagate improvements; build why-layer / token capital |
| GOVERN/ASSURE | Cross-cutting; never off |

**REQ-STACK-02 — Decide ≠ Execute.** DECIDE writes an approved payload to a decision ledger; ACT consumes it. Separation is mandatory for lineage.

**REQ-STACK-03 — Industry crosswalk.** EXO SHOULD map Stack layers to industry 5-layer vocabulary (Intelligence / Action / Governance / Orchestration / Economics) and explicitly call out LEARN as the missing compounding layer.

**REQ-STACK-04 — MVIS.** EXO SHALL define Minimal Viable Intelligence Stack as:

1. One event bus  
2. Basic agent registry (every agent registered with spec)  
3. Central logging with correlation IDs  
4. One agent per class (at least one per cognitive layer in scope)  

Stand-up target: ~1 week. Skipping MVIS is a documented anti-pattern.

### 5.4 GOVERN/ASSURE Four Pillars (REQ-GOV)

**REQ-GOV-01 — Four pillars.**

| Pillar | Requirement |
|---|---|
| Trusted Evals | Continuous versioned test set; drift triggers retrain/rollback |
| Searchable Logs + Correlation IDs | Immutable, hashed/signed; full chain SENSE→…→outcome |
| Granular Rollback | Revert one agent class/version without taking Stack down |
| Human Review Queue | Money / legal / customer-of-record → named human + SLA |

**REQ-GOV-02 — Deployment gate.** Do not deploy a new agent class until **each** pillar scores ≥ 3 (Four Pillars Maturity = **minimum**, not average).

**REQ-GOV-03 — Kill switches.** At minimum three severities (per Appendix C pattern):

- **Yellow** — disable auto-approve for vendor/category  
- **Red** — halt execution in affected category; manual fallback  
- **Black** — disable Stack for workflow; CFO/CAIO/GOVERN only  
- Kill switches MUST be tested on a defined cadence (e.g., quarterly); untested = non-compliant  

**REQ-GOV-04 — Permission envelope hard rules (PocketOS).**

- Scoped workload identity (not shared admin tokens)  
- Read/write credentials separated  
- Destructive/irreversible ops NEVER `execute_within_bounds`  
- Soft-delete windows on irreversible operations  
- Approval thresholds on destructive endpoints  

**REQ-GOV-05 — Standards mapping.** Four Pillars SHALL be mappable to:

- NIST AI RMF (Govern/Map/Measure/Manage)  
- OWASP LLM Top 10 (+ Agentic Top 10 for multi-agent)  
- CSA AI Controls Matrix  
- OpenText ADLC (creation → monitor → safety-test → retire) as lifecycle parallel  

**REQ-GOV-06 — Board framing.** EXO SHOULD support “Sarbanes-Oxley Moment for AI” language: decision rights, escalation thresholds, fiduciary liability, disclosure.

### 5.5 Agent specification (REQ-AGENT)

**REQ-AGENT-01 — Eight properties mandatory.** No agent without complete:

1. Purpose  
2. Autonomy Tier (`recommend_only` | `execute_within_bounds` | `fully_autonomous` | split-by-action-class)  
3. Permission Envelope  
4. Memory Boundary  
5. Escalation Rules  
6. Eval Suite (accuracy floor + override-rate ceiling)  
7. Telemetry / Audit Trail  
8. Reusability Scope  

Plus: named Human Owner, version, stack layer(s).

**REQ-AGENT-02 — Eval calibration pattern (reference).** For high-frequency extraction: daily ≥200-case baseline; accuracy floor example 97%; override rate ceiling example 5% triggers retrain/threshold adjust. Each production class MUST declare its own two numbers.

**REQ-AGENT-03 — Agent passport (SHOULD).** Portable metadata: identity, trust level, constraints; peer agents verify before trusting actions (Instar / Moonshots pattern).

### 5.6 Data governance (REQ-DATA)

**REQ-DATA-01 — HIDO six questions** bound as immutable metadata per object:

1. What is it?  
2. Who says so?  
3. How can it be used?  
4. What are the legal terms?  
5. What happens if wrong?  
6. How is dispute resolved?  

**REQ-DATA-02 — Workflow Data Manifest.** Per migration-candidate workflow: sources, why needed, read/write, sensitivity, retention, named data owner. Binary rule: *If you cannot state why a workflow needs a field, the Edge Twin does not get it.*

**REQ-DATA-03 — Data-plane inversion (v25).** Prefer independent governed data layer; composable workflows on top; AI native to workflow; ERP demoted to transactional consumer. Sequence: data-independence first → progressive workflow migrate → parallel-run → deprecate.

**REQ-DATA-04 — Decision traces / why-layer.** Every agent run (even when human decides) SHOULD emit a decision trace. Log ownership is deepest lock-in (“Log Is the Agent”).

**REQ-DATA-05 — Ecosystem Trust bounds for cross-firm data.**

1. Policy-controlled API for external agents  
2. Metadata travels with data  
3. Liability framework codesigned in advance  

---

## 6. Diagnostics & gating requirements (REQ-DIAG)

### 6.1 Appendix A suite (order mandatory)

**REQ-DIAG-01 — Run order:**

1. REWRITE Readiness Score (8×1–10, total /80)  
2. Score Interpretation Matrix  
3. Miura-Ko L0–L5 reconciliation (**trust the ladder if divergence**)  
4. Dabbling Test  
5. Third Anchor: Workforce Capacity  
6. Tokenmaxxing Test  

### 6.2 Readiness dimensions (REQ-DIAG-02)

| # | Dimension | 1-anchor | 10-anchor |
|---|---|---|---|
| 1 | Organizational Drag | Weeks of alignment meetings | Zero-latency protocol routing |
| 2 | AI Elevation | Siloed in IT/lab | Empowered CAIO at exec layer |
| 3 | Work Architecture | Rigid job descriptions | Dynamic Task Decomposition Matrices |
| 4 | Firm Boundary Design | Pure internal headcount | Capability Registry humans+agents |
| 5 | Decision Autonomy | Every txn needs manager signature | Wide audited auto-approve envelopes |
| 6 | Network Structure | 1:6 pyramids | Modular pods 1:20+ |
| 7 | Reinvention Cadence | Crisis-only reorg | Continuous rebirth loops |
| 8 | Tacit Knowledge Accessibility | Trapped in heads/Slack | Continuous elicitation agents |

**Bands:**

- **56–80:** Ready for full REWRITE  
- **33–55:** Foundational — start 90-Day Edge Twin Sprint  
- **&lt;33:** Survival risk — stand up MVIS urgently  

Retake every six months.

### 6.3 Dabbling Test (REQ-DIAG-03)

Binary; **both** must pass:

1. ≥50% of leadership working time shifted because of AI  
2. Operating cadence artifacts materially changed (approvals, offsites, reviews, capital allocation)  

Fail either → dabbling (not AI-native).

### 6.4 Tokenmaxxing Test (REQ-DIAG-04)

Any single **Yes** places firm below L3 regardless of spend:

1. **Leaderboard** — rewards token/input proxies  
2. **Geometry** — agents preserve old org chart/approvals (faster same shape)  
3. **Latency** — task speed up ≫ cycle-time improvement (congestion)  

“Three Yeses, or three Don’t-Knows, equal transformation theater regardless of spend.”

### 6.5 Miura-Ko ladder (REQ-DIAG-05)

| Level | Name | Note |
|---|---|---|
| L0 | Theater | Announcements, no adoption |
| L1 | Personal Productivity | Fails Dabbling |
| L2 | Team Workflow | AI-enhanced silos |
| **L3** | Organizational Infrastructure | **Compounding threshold** |
| L4 | Compounding OS | Value moats form |
| L5 | Virtually Self-Driving | Does not yet exist |

L3 hard test: can an agent natively resolve across systems *what shipped, who ordered it, what broke, remediation path* without a meeting?

### 6.6 Mode selection (REQ-DIAG-06)

| Condition | Mode |
|---|---|
| Headcount ≤ 50 AND immune system weak | **Direct Mode** — REWRITE in place |
| Headcount &gt; 50 OR strong immune system | **Edge Mode** — REWRITE inside Edge Twin; parallel-run-then-deprecate |
| Optional | **Light Edge Mode** (skill-supported variant) |

### 6.7 CIO Edge Twin Diagnostic / Readiness Gate (REQ-DIAG-07)

EXO SHALL implement Appendix F CIO Edge Twin Diagnostic. **Q5–Q8 Red SHALL halt the build** (Readiness Gate Protocol).

### 6.8 Task Decomposition Matrix (REQ-DIAG-08)

For top coordination-heavy functions:

1. List roles → tasks  
2. Categorize: judgment / pattern / coordination / creation  
3. Score Agent Readiness 1–5  
4. Deploy: 4–5 now; 3 pilot; 1–2 human  

Recommend actions: deploy-agent / agent-with-oversight / hybrid / human-led (Instar-aligned).

**This is the single most important operational diagnostic in the framework.**

---

## 7. REWRITE playbook requirements (REQ-RW)

**REQ-RW-00 — Sequence non-negotiable.** Skipping Step 1 is the fastest failure mode. GOVERN/ASSURE runs across all steps (alert-only → escalation → kill-switch).

### Step 1 — BACKCAST & DEFINE (REQ-RW-01)

- 2–3 day C-suite Backcasting Canvas workshop  
- Outputs: Destination Architecture; Five Design Conditions instantiated; Edge Twin pipeline ranked; Architecture Blueprint for first twin; Steps 2–6 sequenced; **leadership mandate in writing**; CEO signature  
- Exit: all Five Design Conditions hold or Step 1 incomplete  

### Step 2 — ASSESS & PREPARE (REQ-RW-02)

- Complete Appendix A suite  
- Select on-ramp: **MVIS** (always) → optional **90-Day Sprint** → **Full REWRITE**  
- 90-Day Sprint pattern: D1–30 MVIS+sensing; D31–60 Capability Registry + one cross-boundary workflow; D61–90 autonomous coordination + Agency Maps for top 20 decisions  
- Exit: score complete; on-ramp selected; MVIS operational  

### Step 3 — EXTRACT (REQ-RW-03)

- Knowledge archaeology + elicitation-first agents (not task executors first)  
- Top 20 workflows; data readiness 1–5  
- Workflow Data Manifest per candidate  
- Data-independence-first sequence named  
- Transparency + transition support for Codifier’s Curse  
- Exit: capture done; manifests drafted; governed data layer path named  

### Step 4 — DIAGNOSE & STRIP (REQ-RW-04)

- Zero-based org audit (target ~50% of decision latency that is habit, not regulation)  
- Task Decomposition on top 3 functions  
- Appoint CAIO (CEO reporting; technical + P&L literacy)  
- Exit: audit complete; TDM scored; CAIO appointed; ≥50% identified drag flagged  

### Step 5 — BUILD & PROVE (REQ-RW-05)

- Decision Handover Waves 1→2→3 (low-risk high-frequency → medium → higher-judgment)  
- Parallel-run-then-deprecate; ≤2–3 parallel workflows; success criteria pre-defined  
- Prove windows: ≥30 days low-risk; 60–90 medium/higher  
- Cold-start feeds: historical replay, shadow comparison, human-correction capture, synthetic edge cases  
- **Twin validity test:** human-override rate falls over time  
- People protocol: transition leader; pre-deprecation conversations; **10–15% of savings** budget for retraining/severance/dual-staffing/Bridge Curriculum  
- Outcomes per person: Concentrate / Redeploy / Exit with support  
- Exit: waves proven; ≥5 workflows migrated; people protocol executed; beyond MVIS  

### Step 6 — REWIRE & EVOLVE (REQ-RW-06)

- Hierarchy → pod intelligence network (toward 1:20+)  
- Firm boundary redesigned from agent performance data  
- Self-Disruption Probe continuous; Organizational Half-Life measured at board  
- Exit: pods live; boundary redesigned; probe operational; reinvention in compensation  

### Pilot services overlay (REQ-RW-07)

When delivering as services (S5), map to OpenExO Pilot stages:

**Diagnose → Design → Pilot → Prove → Scale** (~3 months; ~3 highest-leverage functions; architect on paper before ship; embedded partner + weekly sessions).

---

## 8. Functional requirements by product module

Priority: **P0** = v1 must; **P1** = v1 should; **P2** = phase 2 / later.

### 8.1 S0 — Skill companion

| ID | Priority | Requirement |
|---|---|---|
| FR-S0-01 | P0 | Ship ExO skill compatible with Claude and/or Codex using local v25 skill packs as seed |
| FR-S0-02 | P0 | Require user context (role, headcount, sector, stack, decision hurdle) before deep advice |
| FR-S0-03 | P0 | Always frame Destination / OS / Playbook; never teach DRIVE without SHAPE |
| FR-S0-04 | P0 | Enforce Appendix A diagnostics before architecture recommendations |
| FR-S0-05 | P0 | Emit structured outputs aligned to skill `schema.json` (destination_architecture, scores, mode, agent_specs, manifests, validation_status, etc.) |
| FR-S0-06 | P1 | Cross-skill workflows: MVIS stand-up, Edge Twin spawn, workforce transition, Quiet Drift postmortem, Tokenmaxxing recovery, mission-driven adaptation |

### 8.2 S1 — Diagnostics

| ID | Priority | Requirement |
|---|---|---|
| FR-S1-01 | P0 | Interactive Readiness Scorecard with anchored 1/10 descriptors |
| FR-S1-02 | P0 | Four Pillars Maturity (min-of-four) with deploy lock if &lt;3 |
| FR-S1-03 | P0 | Dabbling, Tokenmaxxing, Third Anchor, Miura-Ko UI |
| FR-S1-04 | P0 | Auto-recommend Direct / Edge / Light Edge + on-ramp |
| FR-S1-05 | P0 | CIO Edge Twin Diagnostic with Red-halt on Q5–Q8 |
| FR-S1-06 | P0 | Task Decomposition Matrix with export |
| FR-S1-07 | P1 | Retake scheduling (6-month) and score history |
| FR-S1-08 | P2 | Public ExQ-like funnel that upgrades into full Appendix A |

### 8.3 S2 — Design studio

| ID | Priority | Requirement |
|---|---|---|
| FR-S2-01 | P0 | MTP protocol editor + litmus test runner (pass/fail evidence) |
| FR-S2-02 | P0 | DRIVE and SHAPE scorecards with GOVERN-cap and loop warnings |
| FR-S2-03 | P0 | Backcasting Canvas (Appendix B) digital workshop board |
| FR-S2-04 | P0 | Agent Blueprint form (8 properties + PocketOS checklist) |
| FR-S2-05 | P0 | HIDO six-questions binder + Workflow Data Manifest |
| FR-S2-06 | P0 | Decision Trace template / schema capture |
| FR-S2-07 | P1 | Capability Registry + Agency Maps for top decisions |
| FR-S2-08 | P1 | Agent passport object export/import |
| FR-S2-09 | P1 | Vendor Shortcut assessment (suite vs rewrite) |

### 8.4 S3 — Migration workspace

| ID | Priority | Requirement |
|---|---|---|
| FR-S3-01 | P0 | REWRITE step tracker with exit-criteria checklists |
| FR-S3-02 | P0 | Edge Twin setup checklist (separate entity/team, copy-not-move, CEO/board air cover) |
| FR-S3-03 | P0 | Parallel-run planner: metrics, windows, deprecate gate |
| FR-S3-04 | P0 | Cold-start learning feed logger (4 feeds) |
| FR-S3-05 | P0 | Override-rate trend chart (twin validity) |
| FR-S3-06 | P0 | People-transition envelope calculator (10–15% of savings) |
| FR-S3-07 | P1 | Wave planner (Waves 1–3) with risk class |
| FR-S3-08 | P1 | Data-plane inversion checklist (Ch.8) |
| FR-S3-09 | P1 | Built from Zero mode: eliminate / augment / automate / human for a function |

### 8.5 S4 — Runtime (Phase 2)

| ID | Priority | Requirement |
|---|---|---|
| FR-S4-01 | P2 | Eval runner continuous against versioned suites |
| FR-S4-02 | P2 | Immutable log store with correlation IDs + export for audit |
| FR-S4-03 | P2 | Granular rollback of agent versions |
| FR-S4-04 | P2 | Human Review Queue product with SLAs |
| FR-S4-05 | P2 | Yellow/Red/Black kill switch controls + test harness |
| FR-S4-06 | P2 | Policy enforcement on Permission Envelopes at action time |
| FR-S4-07 | P2 | Learning-velocity metrics (lessons, corrections, capability growth) |

### 8.6 S5 — Pilot kit

| ID | Priority | Requirement |
|---|---|---|
| FR-S5-01 | P1 | Facilitation agendas for Diagnose/Design/Pilot/Prove/Scale |
| FR-S5-02 | P1 | Artifact pack auto-generated from S1–S3 for one cohort company |
| FR-S5-03 | P1 | Weekly working-session checklist + mid-pilot deep-dive template |

---

## 9. Non-functional requirements

### 9.1 Security & safety

| ID | Requirement |
|---|---|
| NFR-SEC-01 | Threat model includes OWASP LLM Top 10 and OWASP Agentic Top 10 |
| NFR-SEC-02 | Controls mappable to CSA AI Controls Matrix domains |
| NFR-SEC-03 | NIST AI RMF alignment documented per Four Pillars |
| NFR-SEC-04 | Secrets never in prompts/logs; workload identities only |
| NFR-SEC-05 | Soft-delete + approval thresholds on destructive tool calls (if S4) |
| NFR-SEC-06 | EU-exposed deployments: human-override path explicit (Art.14 posture) |

### 9.2 Auditability & compliance

| ID | Requirement |
|---|---|
| NFR-AUD-01 | Decision traces exportable for fiduciary review |
| NFR-AUD-02 | Agent and data object provenance retained per policy |
| NFR-AUD-03 | Board pack generator: pillars, kill-switch test dates, open Red gates |

### 9.3 Reliability & operability (S4)

| ID | Requirement |
|---|---|
| NFR-OPS-01 | Kill-switch test cadence configurable; overdue = non-compliant badge |
| NFR-OPS-02 | Multi-model routing support (anti cognitive captivity) |
| NFR-OPS-03 | Customer-owned orchestration/eval/log data (customer can export/exit) |

### 9.4 Usability

| ID | Requirement |
|---|---|
| NFR-UX-01 | Dual-Track: human narrative vs machine schema blocks clearly separated |
| NFR-UX-02 | CEO path ≤ 30 minutes to mode + band recommendation |
| NFR-UX-03 | Builder path: incomplete agent spec blocked with field-level errors |
| NFR-UX-04 | Mobile-usable read of scorecards; workshop boards desktop-first |

### 9.5 Performance (design-time v1)

| ID | Requirement |
|---|---|
| NFR-PERF-01 | Scorecard save &lt; 2s; export PDF/Markdown &lt; 10s for standard packs |
| NFR-PERF-02 | Skill responses stream; structured JSON validation on completion |

---

## 10. Information architecture & data model (logical)

### 10.1 Core objects

| Object | Key fields |
|---|---|
| Organization | headcount, sector, mode, scores history |
| MTPProtocol | statement, constraints[], tradeoffs[], identity, litmusResults[] |
| DriveScore / ShapeScore | component scores, caps, notes |
| ReadinessAssessment | 8 dims, pillars, dabbling, tokenmaxxing, miuraKo, band |
| DestinationArchitecture | designConditions[5], blueprint, mandate, signatures |
| Workflow | name, TDM tasks[], dataManifest, readiness |
| AgentBlueprint | 8 properties, owner, version, passport |
| DataObjectPolicy | HIDO answers, hash, provenance |
| DecisionTrace | correlationId, inputs, rationale, actor, outcome |
| EdgeTwin | scope, parallelRuns[], overrideRateTrend, status |
| RewriteProgram | step, exitCriteria[], onRamp |

### 10.2 Skill schema alignment

EXO structured I/O SHOULD remain compatible with skill `schema.json` v1.2:

**Inputs:** context, tier, headcount, sector, current_stack, analysis_type  

**Outputs:** result, destination_architecture, drive_score, shape_score, readiness_score, appendix_a_diagnostics, deployment_mode, edge_twin_spec, vendor_shortcut_assessment, task_decomposition_summary, agent_specifications, wave_1_workflow, workflow_data_manifest, cold_start_learning_plan, cio_edge_twin_diagnostic, edge_twin_data_access, validation_status  

---

## 11. User journeys (acceptance narratives)

### Journey A — CEO weekend diagnostic (P0)

1. Enters headcount 2,400 → Edge Mode recommended.  
2. Completes Readiness (score 41) → Foundational band.  
3. Fails Dabbling (calendars unchanged).  
4. Tokenmaxxing: Leaderboard=Yes → below L3 flag.  
5. Output: “Stand MVIS + 90-Day Sprint on one AP workflow; do not buy another suite as rewrite.”  
6. Exports board one-pager.

### Journey B — CAIO first Edge Twin (P0)

1. Passes CIO Diagnostic without Red on Q5–Q8.  
2. Authors Workflow Data Manifest for invoices.  
3. Creates three agent blueprints (Intake, Match, Pay) with eval floors.  
4. Pillars all ≥3; Yellow/Red/Black defined.  
5. Parallel-run plan 45 days; override logging on.  
6. Gate: deprecate only if twin beats mothership on cost/speed/accuracy and override rate falling.

### Journey C — MTP workshop (P0)

1. Drafts three-layer MTP.  
2. Runs refusal scenarios → one constraint missing → FAIL.  
3. Adds constraint; endorsement scenarios pass.  
4. Identity disqualifiers added; Test 3 passes.  
5. MTP marked governing (not cheering).

### Journey D — Pilot cohort (P1)

1. Diagnose 8 dimensions across company.  
2. Design agents/squads/metrics for 3 functions on paper.  
3. Pilot function 1 inside twin.  
4. Prove mid-point with Salim/partner deep dive.  
5. Scale playbook to functions 2–3; leadership handover.

---

## 12. Success metrics & KPIs

### 12.1 Product KPIs

| KPI | Target (initial) |
|---|---|
| Time to mode + readiness band | ≤ 30 min for CEO path |
| % Destination Architectures with all 5 design conditions checked | ≥ 95% of “Step 1 complete” marks |
| % agents created with 8/8 properties | 100% (hard gate) |
| % twins with falling override rate by day 60 | ≥ 70% of active twins |
| Pillar ≥3 before first production agent | 100% |

### 12.2 Customer outcome KPIs (instrument, don’t over-promise)

| KPI | Notes |
|---|---|
| Workflows safely executed by agents under human command | Primary transformation metric (Jenkins/OpenText convergence) |
| Cycle time: signal → shipped change | Tokenmaxxing Latency inverse |
| Eval drift incidents caught before customer impact | Quiet Drift defense |
| Learning velocity | Lessons absorbed / capability growth (Instar-aligned) |
| Readiness score delta / 6 months | Leading indicator |

### 12.3 Hypotheses (NOT acceptance criteria until verified)

- Workforce operating at ~10–25% of prior headcount over 5–7 years (scenario)  
- Middle layer ~60% of cuts in compression scenarios  
- Specific vendor ARR anecdotes (note: book v24 removed Cognition Labs 73× figure; do not cite as fact)

---

## 13. Risks, critiques, and mitigations

| Risk | Mitigation in EXO |
|---|---|
| Coase-collapse over-generalized from easy workflows (sdlcnext critique) | Default first twins to **prescriptive** workflows (AP, CX, claims, visa-like); regulated judgment stays human-gated |
| Fiduciary wedge retains most mass in banks/health/utilities | Don’t sell headcount cuts as the product outcome; sell accountability + learning velocity |
| GOVERN harness harder than mid-market can build | MVIS-first; pillar gates; Phase 2 runtime optional; partner patterns (Instar-like) |
| Immune system kills change | Edge Mode default &gt;50; CEO/board mandate required artifact |
| Messaging 5-layer vs 6-layer | Canon = 6-layer; document workshop alias map |
| Login-walled Hub playbooks incomplete | Treat local skill refs as source of truth; sync when unlocked |
| Political backlash to displacement framing | Require people-transition envelope + Bridge Curriculum funding in Step 5 exit |

---

## 14. Phased roadmap

### Phase 0 — Foundations (now)

- This PRD + research brief  
- Local canon ingestion (book v25 + skills + PDFs)  
- Product decisions D1–D5 ratified (recommendations in §0)

### Phase 1 — Design-time OS (v1)

- S0 skill companion productionized  
- S1 diagnostics suite  
- S2 design studio (MTP, scorecards, agent/data specs, backcasting)  
- S3 migration workspace (checklists, parallel-run, cold-start, people envelope)  
- Exports: Markdown/PDF/JSON  

### Phase 2 — Runtime GOVERN/ASSURE (v1.x)

- S4 evals, logs, rollback, HRQ, kill switches  
- Agent passport verification  
- Learning-velocity dashboards  

### Phase 3 — Distribution & services

- S5 Pilot kit  
- S6 public assessment funnel  
- Hub playbook sync; workshop integrations (10x Shift / Built from Zero)

---

## 15. Acceptance criteria (program-level)

EXO v1 is accepted when:

1. A new org can complete Appendix A and receive mode + band + on-ramp without consultant intervention.  
2. MTP cannot be marked complete without three litmus passes.  
3. Agent cannot be marked deployable without 8/8 properties and pillars ≥3.  
4. Workflow cannot enter parallel-run without Manifest + HIDO + success criteria.  
5. Twin cannot deprecate mothership path without proof window + falling override rate (or explicit risk accept by CEO).  
6. All P0 requirements in §8 traced to tests or manual QA scripts.  
7. Source appendix links remain valid for audit of framework fidelity.

---

## 16. Open work / dependencies

| Item | Owner | Status |
|---|---|---|
| Ratify §0 product recommendations | Product owner | Open |
| Unlock Hub DRIVE/SHAPE/REWRITE HTML playbooks | OpenExO login | Blocked |
| Capture full Pilot SOW/pricing | BD | Blocked (sold out/login) |
| Reconcile 10x Shift 5-layer naming with authors | Content | Open |
| Primary-verify case anecdotes before marketing use | Research | Open |
| Choose tech stack for S1–S3 app | Engineering | Open |
| IP / licensing posture for ExO frameworks | Legal | Open |

---

## Appendix A — Source index (highest-value)

### Local archive

| Asset | Path |
|---|---|
| Book v25 | `C:\Archive\EXO\original docs\The-Organizational-Singularity-v25.md` |
| Claude skill | `C:\Archive\EXO\original docs\building-an-exo-skill_v25.skill` |
| Codex skill | `C:\Archive\EXO\original docs\building-an-exo-v25-codex.skill` |
| Boundary paper | `C:\Archive\EXO\original docs\Boundary_Revised.pdf` |
| MTP as Protocol | `C:\Archive\EXO\original docs\MTP as a Protocol.pdf` |

### Primary online

| Source | URL |
|---|---|
| Bookapp v25 | https://openexo.com/organizational-singularity |
| Resource Hub | https://openexo.com/resource-hub |
| OS Markdown | https://openexo.com/resource-hub/organizational-singularity-markdown-file |
| ExO 3.0 Claude Skill | https://openexo.com/resource-hub/exo-30-claude-skill |
| Claude Skill how-to | https://openexo.com/claude-skill-how-to-guide |
| Pilot cohort | https://openexo.com/organizational-singularity-pilot |
| 10x Shift | https://openexo.com/10x-shift |
| ExQ / platform | https://platform.openexo.com/ · https://openexo.com/begin-your-transformation |
| ExO Model | https://openexo.com/exo-model |
| Salim Ismail | https://salimismail.com/ |
| MTP as Protocol (hub) | https://openexo.com/resource-hub/mtp-as-a-protocol |
| DRIVE / SHAPE / REWRITE playbooks | Hub tools (login) |
| Built from Zero | https://openexo.com/resource-hub/build-from-zero-workshop-workbook |

### Secondary / adjacent

| Source | URL |
|---|---|
| Instar EXO 3.0 | https://instar.sh/features/exo3/ |
| Computation Economy | https://computationeconomy.com/ |
| Moonshots #258 video | https://www.youtube.com/watch?v=I9c8STV7Hnw |
| Moonshots summary + critique | https://www.sdlcnext.com/blog/moonshots-ep258-organizational-singularity/ |
| BigGo writeup | https://finance.biggo.com/news/1a6403d73d5b0957 |
| NIST AI RMF | https://www.nist.gov/itl/ai-risk-management-framework |
| OWASP LLM Top 10 | https://owasp.org/www-project-top-10-for-large-language-model-applications/ |
| OWASP GenAI / Agentic | https://genai.owasp.org/ |
| CSA AI Controls Matrix | https://cloudsecurityalliance.org/artifacts/ai-controls-matrix-v1-1 |

### Internal research

| File | Role |
|---|---|
| `research/exo-prd-online-research-brief-2026-07-10.md` | Collection notes & QC |
| `research/exo-prd-skeleton.md` | Earlier skeleton (superseded by this PRD) |

---

## Appendix B — Reference workflow (Invoice Edge Twin)

EXO SHALL treat Appendix C invoice processing as the **canonical first Edge Twin reference**:

- Touches all six layers + GOVERN  
- Quantifiable ROI (legacy ~11 min touch → &lt;30s clean invoices; humans on 5–10% exceptions)  
- Full agent blueprints, thresholds, kill switches, eval suites  
- Pattern reusable for expense, PR, contract approval, credit decisions  

Product implication: ship an **Invoice Twin starter pack** (manifests, three blueprints, eval harness stubs) as the default Wave-1 template.

---

## Appendix C — Quality control (DrMike standing layer)

### Fact check

| Claim | Status | Notes |
|---|---|---|
| ExO 3.0 = MTP + DRIVE5 + SHAPE5 | Verified | Book/skill |
| Stack = 6 layers + GOVERN/ASSURE | Verified | Book/skill |
| REWRITE = 6 sequenced steps | Verified | rewrite-playbook.md |
| Readiness 8 dims /80; bands 56/33 | Verified | scorecard template |
| Four Pillars deploy gate ≥3 min | Verified | Ch.4 / skill |
| Direct ≤50 / Edge &gt;50 | Verified | playbook |
| Cognition Labs 73× ARR | **Do not treat as book-canonical** | Removed in v24 per skill note |
| 10x Shift 5-layer naming | Verified divergent | Marketing vs canon |
| Pilot Diagnose→Scale | Verified from public snippets | Full SOW login-walled |

### Assumptions

- EXO productizes Organizational Singularity for operators, not only as static content.  
- Phase 1 design-time gates deliver majority of risk reduction before runtime enforcement.  
- OpenExO IP licensing allows derivative tooling (confirm with Legal).  

### Reflection / residual uncertainty

- Exact commercial packaging and Pilot pricing unknown.  
- Runtime S4 scope may be partnered rather than built.  
- Sector-specific regulated playbooks need expansion beyond invoice reference.  

### Cognitive verification

- Problem → Goals → Users → Domain model → Functional modules → NFRs → Metrics → Phases → Acceptance: **covered**.  
- Every major framework (ExO 3.0, Stack, REWRITE, diagnostics, MTP, agent/data specs) has explicit REQ IDs.  
- Critiques incorporated as risks, not ignored.

---

**End of EXO PRD v1.0**
