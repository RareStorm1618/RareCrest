# EXO PRD Research Brief — Online + Archive Sources

**Date:** 2026-07-10  
**Purpose:** Collect and organize primary/secondary materials to support a full PRD / requirements pack for EXO (ExO 3.0 / Organizational Singularity).  
**Status:** Research complete enough for a **domain/transformation PRD**; product PRD still needs product-definition decisions + unlock of login-walled OpenExO toolkits.  
**Local archive already held:** `C:\Archive\EXO\original docs\`

---

## 1. Verdict (evidence-based)

| Deliverable | Ready? | Why |
|---|---|---|
| Domain / transformation requirements | **Yes** | Book v25 + skills + templates + online corroboration |
| Full software product PRD | **Partial** | Packaging signals exist (pilot, skill, ExQ, Instar), but v1 product identity, UX, SLAs, and commercial model are not locked |
| Competitive / adjacent product patterns | **Yes** | Instar EXO 3.0 mapping is the clearest public productization |
| Governance / NFR baseline | **Yes** | NIST AI RMF, OWASP LLM + Agentic Top 10, CSA AICM |

---

## 2. Local archive inventory (already on disk)

Path: `C:\Archive\EXO\original docs\`

| File | Type | Role for PRD |
|---|---|---|
| `The-Organizational-Singularity-v25.md` | Markdown book (~292 KB) | Canonical doctrine: ExO 3.0, Intelligence Stack, REWRITE, Edge Twin, Appendices A–F, invoice worked example |
| `building-an-exo-skill_v25.skill` | Claude skill zip | Executable MUST rules, workflows, 11 templates, `schema.json`, reference modules |
| `building-an-exo-v25-codex.skill` | Codex skill zip | Same framework pack for Codex |
| `Boundary_Revised.pdf` | Paper | Firm as container for trusted agency; Coase update |
| `MTP as a Protocol.pdf` | Guide | MTP → machine-readable constraint / decision / identity protocol |

### Skill contents worth extracting into requirements

**Templates:** agent-specification, backcasting-canvas, cio-edge-twin-diagnostic, decision-trace-template, drive-scorecard, hido-six-questions, mtp-protocol, rewrite-readiness-scorecard, shape-scorecard, task-decomposition-matrix, workflow-data-manifest-template

**References:** exo30-architecture, intelligence-stack, rewrite-playbook, edge-deployment, data-plane-inversion, edge-twin-data-governance, drive-engine, shape-form, four-pillars-standards-mapping, cold-start-learning-feeds, social-capital-crosswalk, v15/v24/v25 deltas

**Schema:** `schema.json` (schema_version 1.2) with structured `input` / `output` for skill runs

---

## 3. Primary online sources (OpenExO / Salim)

### 3.1 Canonical product surfaces

| Source | URL | What it contributes |
|---|---|---|
| Organizational Singularity v25 Bookapp | https://openexo.com/organizational-singularity | Live canonical text; Dual-Track Architecture; ExO 3.0 / Stack / REWRITE |
| Resource Hub (~60 assets) | https://openexo.com/resource-hub | Directory of playbooks, PDFs, skills, workshops, case studies |
| OS Markdown (hub lists v24; related v25) | https://openexo.com/resource-hub/organizational-singularity-markdown-file | AI-readable outline twin of the book |
| ExO 3.0 Claude Skill | https://openexo.com/resource-hub/exo-30-claude-skill | Product form: interactive skill companion (**login**) |
| Claude Skill How-to Guide | https://openexo.com/claude-skill-how-to-guide | Onboarding UX for skill product |
| Pilot Cohort | https://openexo.com/organizational-singularity-pilot | High-touch delivery product (**sold out / login**) |
| 10x Shift workshop | https://openexo.com/10x-shift | Entry workshop (Jul 22, 2026, 8:00 AM PT); toolkit bundle |
| Begin transformation / ExQ | https://openexo.com/begin-your-transformation · https://platform.openexo.com/ | Free ExQ assessment funnel (~10 min, 40k+ orgs claimed) |
| ExO Model page | https://openexo.com/exo-model | Classic ExO attributes + ExQ CTA |
| Salim Ismail site | https://salimismail.com/ | Keynote framing; skill as living book |

### 3.2 Framework toolkits on Resource Hub (many locked)

| Asset | Hub path / name | PRD use |
|---|---|---|
| MTP as a Protocol | Guides PDF | Purpose-as-protocol requirements (“Three Layers, Two Tests, One Protocol”) |
| The New Boundary of the Firm | Paper PDF | Problem statement; Elastic / Trusted-Core / Accountability Enterprise models |
| DRIVE Playbook + Presentation (v24) | Tools / Guides | Intelligence-engine scorecard requirements |
| SHAPE Playbook + Presentation (v24) | Tools / Guides | Org-form / safety scorecard requirements |
| REWRITE Playbook + Presentation (v24/v25 related) | Tools / Guides | Migration method + readiness dimensions |
| Built from Zero Workbook + Presentation | Learning | Workshop UX: eliminate / augment / automate / human; coordination vs judgment |
| Overcoming Organizational Immune System | Tools PDF | Change-management / Edge Twin rationale |
| Transformation Guide | Guides ZIP | Legacy ExO transformation pack |
| 10 Mistakes… | Guides PDF | Anti-patterns → non-goals / failure modes |
| ExQ Survey | Tools | Assessment product pattern |
| Case studies (Rio Tinto, Boston Scientific, Vodacom, Sareb, Coteminas, …) | Case Studies PDF | Evidence / sector examples (mostly ExO 1.0/2.0 era) |
| Top 100 ExOs / Fortune 100 / India & Insurance Reimagined | Reports | Benchmark / ROI narrative inputs |

### 3.3 Pilot packaging signals (from public snippets + podcast)

Publicly recoverable product shape (page itself login-walled / sold out):

- **Method stages:** Diagnose → Design → Pilot → Prove → Scale  
- **Duration signal:** ~3 months embedded engagement  
- **Diagnostic:** 8-dimension REWRITE audit from the OS book  
- **Scope pattern:** pick ~3 highest-leverage functions; architect agents/squads/metrics on paper before shipping  
- **Staffing:** Salim + senior OpenExO partner embedded; weekly working sessions  
- **Cohort size signal:** first ~10 CEOs (Moonshots #258)  
- **Mode rule:** &lt;50 employees → Direct Mode possible; &gt;50 → Edge Twin mandatory  

**PRD implication:** EXO can be packaged as (a) skill/content product, (b) assessment funnel, (c) workshop, (d) high-touch pilot — not only as one SaaS.

---

## 4. Secondary / narrative sources

| Source | URL | Contribution | Caveat |
|---|---|---|---|
| Moonshots Ep. 258 (YouTube) | https://www.youtube.com/watch?v=I9c8STV7Hnw | Full narrative: Fiduciary Wedge, Stack, Middle 60%, REWRITE steps, 2036 firm | Spoken claims; verify before treating as requirements |
| Moonshots #258 writeup + critique | https://www.sdlcnext.com/blog/moonshots-ep258-organizational-singularity/ | Clean summary **plus** skeptical risk section (Coase overclaim, fiduciary wedge mass, harness maturity, politics of headcount cuts) | Use critique in PRD Risks |
| BigGo finance writeup | https://finance.biggo.com/news/1a6403d73d5b0957 | Edge Twin migration steps; Cognition Labs 73× ARR claim; Fermy America 800→80; UAE visa example; ERP disruption thesis | Secondary journalism; treat metrics as hypotheses |
| “The Real Reason Your AI Deployments Are Failing” | https://www.youtube.com/watch?v=ZmztFg588aQ | Immune system / edge deployment argument | Video; extract carefully |

### Claim bank (mark as *hypothesis* until primary-verified)

- Surviving firms operate on ~10–25% of current workforce in 5–7 years  
- Middle layer absorbs ~60% of cuts; coalface ~20%; senior ~20%  
- Cognition Labs ARR grew ~73× after AI-native operating model  
- Fermy America power plant example: ~800 → ~80  
- UAE golden-visa processing → ~5 hours (automation signal)  
- Direct Mode threshold ~50 employees  
- Dabbling Test: 50% of leadership time must change (Krivkovich / McKinsey, Apr 2026)  
- Miura-Ko L3 = compounding threshold  
- EU AI Act Article 14 human-override effect date cited as Aug 2, 2026 in book  

---

## 5. Adjacent productization (fills software-PRD gaps)

### 5.1 Instar — EXO 3.0 Alignment

URL: https://instar.sh/features/exo3/

**Why it matters:** Clearest public mapping of ExO 3.0 ideas into **shippable product features**.

| Concept | Instar feature pattern | Candidate EXO requirement |
|---|---|---|
| MTP as protocol | Constraints + tradeoff hierarchy + identity layer | Intent object with refusal/endorsement tests |
| Purpose litmus | Refusal test + endorsement test | “Governs vs cheers” validation gate |
| Task Decomposition Matrix | Agent-readiness scoring → deploy / oversight / hybrid / human-led | Workflow scoring service |
| Agent passport | Portable identity + trust + constraints; peer verification | Agent metadata / policy object |
| Learning velocity | Lessons / corrections / capability growth KPI | Learning-velocity metric (not token throughput) |
| Proof method | Controlled case studies (intent on vs off, same model) | Acceptance tests for purpose governance |

### 5.2 Computation Economy / firm-boundary research

URL: https://computationeconomy.com/

- Ted Shelton forthcoming book framing (labor→compute, profit→rent, wages→access)  
- Working paper: *The Nature of the Firm in an Exponential and Algorithmic Economy* (Salim Ismail) — Fiduciary Wedge, three coordination regimes  
- Complements `Boundary_Revised.pdf` already in archive  

### 5.3 Do not confuse: Model Tools Protocol (MTP)

GitHub `modeltoolsprotocol` is a **CLI `--mtp-describe` spec**, unrelated to Massive Transformative Purpose. Exclude from ExO MTP requirements.

---

## 6. Governance / standards (NFR inputs)

Map these into GOVERN/ASSURE Four Pillars (Trusted Evals, Searchable Logs, Granular Rollback, Human Review Queue):

| Standard | URL / note | Maps to |
|---|---|---|
| NIST AI RMF | https://www.nist.gov/itl/ai-risk-management-framework | Govern / Map / Measure / Manage |
| OWASP Top 10 for LLM Apps | https://owasp.org/www-project-top-10-for-large-language-model-applications/ | Prompt injection, excessive agency, insecure output, etc. |
| OWASP Agentic Top 10 (2026) | https://genai.owasp.org/ | Tool misuse, privilege abuse, inter-agent trust, cascading failures |
| CSA AI Controls Matrix | https://cloudsecurityalliance.org/artifacts/ai-controls-matrix-v1-1 | ~247 control objectives / 18 domains |
| CSA note on NIST AI Agent Standards | CSA labs PDF (Mar 2026) | Agent interoperability + runtime governance implications |
| Crosswalk example | https://github.com/emmanuelgjr/GenAI-Security-Crosswalk | Agentic Top 10 ↔ NIST AI RMF mapping |

---

## 7. Messaging inconsistency to reconcile in PRD

**Book / skill (v25):** Intelligence Stack = six cognitive layers  
PURPOSE → SENSE → INTERPRET → DECIDE → ACT/ORCHESTRATE → LEARN + GOVERN/ASSURE

**10x Shift landing page (Jul 2026):** lists **five** persistent intelligence layers with different names:

1. Environmental Intelligence  
2. Strategic Architecture  
3. Change Orchestration  
4. Autonomous Operations  
5. Governance & Sentinel  

**PRD action:** Treat book/skill as canonical for requirements; flag 10x Shift naming as marketing/workshop variant pending author clarification.

---

## 8. Product surface map (observed ecosystem)

```text
Content layer     Bookapp v25 · OS Markdown · PDFs · presentations
Skill layer       Claude skill · Codex skill · AI-X assistant
Assessment layer  ExQ Survey · REWRITE Readiness · DRIVE/SHAPE scorecards
Workshop layer    10x Shift · Built from Zero · Pro Mastermind
Services layer    Organizational Singularity Pilot (Diagnose→Scale)
Runtime adjacent  Instar-like intent/passport/eval products (third party)
```

**Open product decision for EXO repo:** which of these surfaces is *this* project building first?

---

## 9. Still missing / login-walled (next collection actions)

1. Unlock Resource Hub: DRIVE / SHAPE / REWRITE interactive playbooks, Built from Zero workbook, Claude Skill how-to  
2. Capture full Pilot page (pricing, SLAs, deliverables, eligibility) while accessible  
3. Download Computation Economy working papers  
4. Decide EXO product identity (skill vs SaaS vs consulting OS vs hybrid)  
5. Reconcile 5-layer vs 6-layer stack naming with OpenExO  
6. Primary-verify case metrics (Cognition Labs, Fermy America, UAE) before putting in acceptance criteria  

---

## 10. Recommended PRD section ← source mapping

| PRD section | Best sources |
|---|---|
| Problem / opportunity | Book Core Thesis; Boundary paper; Moonshots #258; Computation Economy |
| Vision / destination | ExO 3.0 (MTP + DRIVE + SHAPE); book Ch.3 |
| Users / personas | CEO Quick Start; Vertical Rewrite Ch.5–7; Pilot CEO cohort |
| Jobs to be done | Built from Zero; REWRITE steps; skill workflows |
| Functional requirements | Intelligence Stack; AGENT_SPEC_SCHEMA; HIDO; templates; Instar feature patterns |
| Non-functional / safety | GOVERN/ASSURE; NIST/OWASP/CSA; kill-switch architecture; Quiet Drift |
| Migration / implementation | REWRITE playbook; Edge Deployment; MVIS; Appendix C invoice twin |
| Diagnostics / gates | Appendix A; CIO Edge Twin Diagnostic; Dabbling/Tokenmaxxing/Miura-Ko |
| Success metrics | Learning velocity; workflow volume under agents; readiness score deltas; *hypothesis* ROI claims |
| Packaging / GTM | Pilot stages; ExQ funnel; 10x Shift; skill distribution |
| Risks / open questions | sdlcnext critique; immune system; cognitive captivity; headcount politics |
| Out of scope | Classic ExO 1.0 SCALE/IDEAS-only work unless bridging; Model Tools Protocol MTP |

---

## 11. Quality control

### Fact check

| Claim | Status | Source type |
|---|---|---|
| Archive contains book + 2 skills + 2 PDFs | **Verified** | Local filesystem listing 2026-07-10 |
| OpenExO Resource Hub lists ~60 resources including OS book, skills, playbooks | **Verified** | https://openexo.com/resource-hub |
| Pilot page currently sold out / login | **Verified** | Fetch 2026-07-10 |
| Instar publishes EXO 3.0 feature mapping | **Verified** | https://instar.sh/features/exo3/ |
| 10x Shift uses 5-layer stack naming | **Verified** | https://openexo.com/10x-shift |
| Cognition Labs 73× ARR / Fermy 800→80 | **Needs verification** | Secondary (podcast / BigGo) |
| Exact pilot pricing & SOW | **Unavailable** | Login wall |

### Assumptions

- EXO repo intends to productize or operationalize Organizational Singularity / ExO 3.0 material.  
- Book + skill remain more authoritative than workshop landing-page variants.  
- “Full PRD” means both domain requirements and product requirements unless scoped otherwise.

### Gaps

- No unlocked interactive playbook HTML content captured.  
- No official API/SDK docs for an OpenExO runtime product.  
- Product owner decision on v1 surface still required.

---

## 12. Companion file

See also: `research/exo-prd-skeleton.md` — PRD skeleton with these sources cited into each section.
