# EXO Product Requirements Document (Skeleton)

**Version:** 0.1 (skeleton)  
**Date:** 2026-07-10  
**Status:** Draft — domain content strong; product identity TBD  
**Research basis:** `research/exo-prd-online-research-brief-2026-07-10.md`  
**Local canon:** `C:\Archive\EXO\original docs\The-Organizational-Singularity-v25.md` + building-an-exo skills  

---

## 0. Open decisions (blockers for “full” product PRD)

| # | Decision | Options | Owner | Due |
|---|---|---|---|---|
| D1 | What is EXO v1? | Skill companion · Assessment app · Workshop toolkit · Edge Twin runtime · Consulting OS · Hybrid | | |
| D2 | Primary user | CEO/board · Transformation lead · CAIO/CIO · Builder/operator | | |
| D3 | Canonical stack naming | Book 6-layer vs 10x Shift 5-layer | | |
| D4 | Commercial model | Free skill · Paid assessment · Workshop · Pilot SOW · SaaS seat | | |
| D5 | Runtime scope | Specs/templates only vs enforce GOVERN/ASSURE in software | | |

Until D1–D5 are set, treat Sections 3–8 as **domain requirements** ready to specialize into product requirements.

---

## 1. Problem / opportunity

### Problem
Traditional firms are optimized for scarce human coordination. Agentic AI collapses execution and coordination costs, so hierarchy-as-OS becomes the bottleneck. Most “enterprise AI” bolts tools onto old workflows (AI-enhanced), not AI-native redesign.

### Opportunity
Provide the destination architecture (ExO 3.0), operating system (Intelligence Stack + GOVERN/ASSURE), and migration playbook (REWRITE / Edge Twin) in a form operators can diagnose, design, and run.

### Sources
- Book: Core Thesis, CEO Quick Start — local v25 md  
- Boundary paper — archive PDF + https://openexo.com/resource-hub (New Boundary of the Firm)  
- Moonshots #258 — https://www.youtube.com/watch?v=I9c8STV7Hnw  
- Critique / risks — https://www.sdlcnext.com/blog/moonshots-ep258-organizational-singularity/  
- Computation Economy — https://computationeconomy.com/

---

## 2. Vision & product principles

### Vision
An organization can move from hierarchy-centric operations to an intelligence-centric operating model: MTP as protocol, Intelligence Stack as OS, REWRITE as playbook, GOVERN/ASSURE never off.

### Principles (non-negotiable)
1. Destination / OS / Playbook triad always present (ExO 3.0 · Stack · REWRITE).  
2. Humans above the loop (validators), not gatekeepers on the critical path.  
3. Build at the edge for orgs &gt; ~50; Direct Mode only when immune system is weak.  
4. GOVERN/ASSURE from Day 1 (no demo-without-harness).  
5. Measure learning / safe workflow volume — not tokenmaxxing.  
6. Own orchestration, evals, logs, and fine-tune data (avoid cognitive captivity).

### Sources
- Book: “Three Things You Need to Remember”; Ch.3–4, 9–10  
- Skill MUST directives — `building-an-exo-skill_v25.skill`  
- https://openexo.com/organizational-singularity  

---

## 3. Users & jobs-to-be-done

| Persona | JTBD | Evidence |
|---|---|---|
| CEO / board | Decide Direct vs Edge; mandate Edge Twin; backcast destination | CEO Quick Start; Pilot cohort |
| Transformation / ExO lead | Run diagnostics, workshops, REWRITE sequence | Built from Zero; REWRITE playbook |
| CAIO / CIO | Stand up MVIS; data-plane inversion; Edge Twin diagnostic gates | Ch.8; Appendix F; skill Edge Twin workflow |
| Function owner (AP, CX, etc.) | Decompose tasks; ship first agentic workflow with kill switches | Appendix C; Task Decomposition Matrix |
| Builder / agent engineer | Author agent blueprints; evals; decision traces | AGENT_SPEC_SCHEMA; templates |
| Middle manager → exception architect | Redesign coordination out; keep judgment | Ch.6 Middle 60% / Bridge Curriculum |

### Sources
- Book Ch.5–7 Vertical Rewrite  
- https://openexo.com/resource-hub/build-from-zero-workshop-workbook  
- https://openexo.com/organizational-singularity-pilot  
- Instar agent-readiness pattern — https://instar.sh/features/exo3/

---

## 4. Scope

### In scope (domain — ready)
- ExO 3.0 destination model (MTP + DRIVE + SHAPE scorecards)  
- Intelligence Stack layers + GOVERN/ASSURE Four Pillars  
- REWRITE six steps + readiness diagnostics  
- Edge Twin / MVIS / data governance (HIDO six questions, decision traces)  
- Agent specification schema (8 properties)  
- Reference workflow: invoice processing Edge Twin (Appendix C)

### In scope (product — pending D1)
- [ ] Interactive diagnostics (Readiness, Dabbling, Tokenmaxxing, Miura-Ko)  
- [ ] Scorecard UX (DRIVE / SHAPE / REWRITE)  
- [ ] MTP protocol editor + refusal/endorsement tests  
- [ ] Agent blueprint registry + passport  
- [ ] Workshop canvases (Backcasting, Built from Zero)  
- [ ] Runtime control plane (evals, logs, rollback, human queue) — only if D5 = software  

### Out of scope (v1 default)
- Replacing ERP suites wholesale  
- Guaranteeing workforce-reduction outcomes  
- Model Tools Protocol (unrelated “MTP”)  
- Full ExO 1.0 SCALE/IDEAS-only consulting without ExO 3.0 bridge  

### Sources
- Book Parts II–III; Appendices A–C, F  
- Research brief §8 product surface map  

---

## 5. Functional requirements (domain → product)

> Format: **REQ-ID** · statement · acceptance sketch · sources

### 5.1 Destination architecture (ExO 3.0)

| ID | Requirement | Acceptance sketch | Sources |
|---|---|---|---|
| FR-DEST-01 | System represents MTP as three-layer protocol (inspiration, hard constraints, weighted priorities) | Protocol object can cause a refusal on a forbidden action | Book Ch.3; MTP as Protocol PDF; Instar |
| FR-DEST-02 | System scores DRIVE five characteristics 1–5 | Scorecard persisted; GOVERN-cap rule applied | Book Ch.3; DRIVE playbook; skill |
| FR-DEST-03 | System scores SHAPE five characteristics 1–5 | Scorecard persisted; Binding Problem / retention-by-resonance surfaced | Book Ch.3; SHAPE playbook |
| FR-DEST-04 | Purpose Litmus Tests (refusal + endorsement [+ third if v24]) gate “purpose approved” | Cannot mark MTP complete if refusal test fails | Book; Instar; skill MUST |

### 5.2 Intelligence Stack OS

| ID | Requirement | Acceptance sketch | Sources |
|---|---|---|---|
| FR-STACK-01 | Model workflows across PURPOSE→SENSE→INTERPRET→DECIDE→ACT→LEARN | Each layer has defined inputs/outputs | Book Ch.4; Appendix C |
| FR-STACK-02 | GOVERN/ASSURE always attached: Trusted Evals, Searchable Logs, Granular Rollback, Human Review Queue | Deploy blocked if any pillar &lt; 3 | Book Ch.4; skill |
| FR-STACK-03 | Agent specs require 8 properties (Purpose, Autonomy Tier, Permission Envelope, Memory Boundary, Escalation Rules, Eval Suite, Telemetry/Audit, Reusability Scope) | Incomplete blueprint rejected | `[AGENT_SPEC_SCHEMA]`; template |
| FR-STACK-04 | Data objects answer HIDO six questions | Manifest incomplete → cannot promote workflow | `[DATA_GOVERNANCE_PROTOCOL]`; template |
| FR-STACK-05 | Decision and execution separated; decisions written to decision ledger before ACT | Trace shows decide≠execute | Book Ch.8 / Appendix C; decision-trace template |
| FR-STACK-06 | Kill switches: Yellow / Red / Black with test cadence | Untested kill switch flagged non-compliant | Appendix C |

### 5.3 Diagnostics & gates

| ID | Requirement | Acceptance sketch | Sources |
|---|---|---|---|
| FR-DIAG-01 | REWRITE Readiness Score (8 dimensions, 1–10) with interpretation matrix | Score + recommended mode (Direct/Edge/Light Edge) | Appendix A; template |
| FR-DIAG-02 | Dabbling Test (50% time + operating-cadence checks) | Binary result recorded | Appendix A; CEO Quick Start |
| FR-DIAG-03 | Tokenmaxxing Test (Leaderboard / Geometry / Latency) | Any Yes → below L3 flag | Appendix A; skill |
| FR-DIAG-04 | Miura-Ko L0–L5 placement; ladder wins if score diverges | Divergence warning shown | Book; skill |
| FR-DIAG-05 | CIO Edge Twin Diagnostic; Q5–Q8 Red halts build | Hard gate enforced | Appendix F; skill Readiness Gate Protocol |
| FR-DIAG-06 | Task Decomposition Matrix scores coordination vs judgment | Recommends deploy / oversight / hybrid / human-led | Template; Instar |

### 5.4 Migration playbook (REWRITE)

| ID | Requirement | Acceptance sketch | Sources |
|---|---|---|---|
| FR-RW-01 | Backcasting Canvas workshop outputs Destination Architecture + Five Design Conditions | Step 1 exit gate | Appendix B; template |
| FR-RW-02 | Support Direct Mode vs Edge Mode pathing by size/readiness | Mode recommendation documented | Book Ch.9–10; Pilot |
| FR-RW-03 | MVIS checklist: event bus, agent registry, central logging, one agent per class | Stand-up checklist completable in “one week” framing | Book Ch.4 |
| FR-RW-04 | Edge Twin: copy workflow (don’t move); parallel run; migrate on outperform | Parallel-run metrics required before deprecate | Book Edge Deployment; BigGo/Moonshots narrative |
| FR-RW-05 | Pilot method stages Diagnose→Design→Pilot→Prove→Scale (if services product) | Stage exit criteria defined | Pilot page snippets |

### 5.5 Product-surface requirements (enable after D1)

| ID | Requirement | Acceptance sketch | Sources |
|---|---|---|---|
| FR-PROD-01 | Skill companion answers contextual prompts without generic summary-only mode | Role/company/context required | Book Preface; skill |
| FR-PROD-02 | Assessment funnel returns score + roadmap (ExQ-like or Readiness-like) | &lt;15 min path | platform.openexo.com pattern |
| FR-PROD-03 | Agent passport portable across agents | Peer agent can verify constraints before trust | Instar; Moonshots passport concept |
| FR-PROD-04 | Learning-velocity dashboard (lessons, overrides, capability growth) | Token count not primary KPI | Instar; Tokenmaxxing Test |

---

## 6. Non-functional requirements

| ID | Requirement | Sources |
|---|---|---|
| NFR-SEC-01 | Map Four Pillars to NIST AI RMF Govern/Map/Measure/Manage | NIST AI RMF; skill four-pillars mapping |
| NFR-SEC-02 | Threat model includes OWASP LLM Top 10 + Agentic Top 10 | OWASP; CSA |
| NFR-SEC-03 | Control objectives mappable to CSA AI Controls Matrix | CSA AICM |
| NFR-AUD-01 | Immutable audit log with correlation IDs across layers | Book GOVERN/ASSURE; “Log Is the Agent” |
| NFR-OPS-01 | Granular rollback of agent/workflow versions | Four Pillars |
| NFR-OPS-02 | Human override path (esp. EU-exposed) | Book Art.14 note; Human Review Queue |
| NFR-REL-01 | Multi-model inference optionality (anti cognitive captivity) | Book Ch.3 Nadella validation |
| NFR-PRIV-01 | Permission envelopes: scope isolation, destructive-action thresholds, soft-delete windows | PocketOS / SHAPE failure modes |

---

## 7. Success metrics

### Product metrics (once D1 set)
- Time-to-first completed Readiness Score  
- % users completing Backcasting Canvas  
- # agent blueprints created with all 8 properties  
- Pillar scores ≥3 before first production agent  

### Transformation metrics (customer outcomes — hypotheses)
- Workflows safely executed by agents under human command (not seat adoption)  
- Override rate + eval drift within thresholds  
- Learning-velocity trend up  
- Twin vs mothership: cost / cycle time / accuracy  

### Do not use as primary success
- Raw token spend / token leaderboards (Tokenmaxxing anti-pattern)

### Sources
- Appendix A; skill Tokenmaxxing Test; Instar learning-velocity; Jenkins/OpenText quote in skill  

---

## 8. Risks & open questions

| Risk | Mitigation / PRD note | Sources |
|---|---|---|
| Coase-collapse over-generalized from easy workflows | Scope first Edge Twins to prescriptive workflows (AP, CX, visa-like) | sdlcnext critique |
| Fiduciary wedge retains most mass in regulated firms | Don’t promise 80% headcount cuts as acceptance criteria | sdlcnext; Boundary paper |
| GOVERN/ASSURE harness harder than mid-market can build | MVIS-first; pillar gates; optional runtime partners (Instar-like) | critique; skill PocketOS |
| Org immune system kills mothership transforms | Edge Twin + CEO/board air cover as requirement | Book; Moonshots |
| Messaging split 5-layer vs 6-layer | Canonical = book/skill until clarified | 10x Shift vs v25 |
| Case metrics unverified | Keep as hypotheses until primary confirmation | BigGo / podcast |

---

## 9. Milestones (proposed)

| Phase | Outcome | Depends on |
|---|---|---|
| M0 | Product decisions D1–D5 locked | Owner |
| M1 | Domain PRD v1.0 from archive + this skeleton | Research brief |
| M2 | Unlock Hub playbooks; fold into FR acceptance tests | OpenExO login |
| M3 | v1 surface shipped (skill and/or diagnostics and/or pilot kit) | D1 |
| M4 | Optional runtime GOVERN/ASSURE MVP | D5 |

---

## 10. Source index (quick)

- Local: `C:\Archive\EXO\original docs\`  
- Bookapp: https://openexo.com/organizational-singularity  
- Hub: https://openexo.com/resource-hub  
- Pilot: https://openexo.com/organizational-singularity-pilot  
- 10x Shift: https://openexo.com/10x-shift  
- ExQ/platform: https://platform.openexo.com/  
- Instar EXO3: https://instar.sh/features/exo3/  
- Computation Economy: https://computationeconomy.com/  
- Moonshots summary: https://www.sdlcnext.com/blog/moonshots-ep258-organizational-singularity/  
- Moonshots video: https://www.youtube.com/watch?v=I9c8STV7Hnw  
- NIST AI RMF / OWASP / CSA AICM — see research brief §6  

---

## 11. Document control

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-07-10 | Skeleton created from archive audit + online research |
