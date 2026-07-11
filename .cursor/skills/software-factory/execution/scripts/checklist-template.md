<!--lint disable no-undefined-references strong-marker-->

# Work Order Execution Checklist: {{WORK_ORDER_LABEL}}

**Work Order Number:** {{WORK_ORDER_LABEL}}
**Work Order Title:** {{WORK_ORDER_TITLE}}
**Initialized At (UTC):** {{INITIALIZED_AT}}

## Phase 1: Start / Context Gathering

### Required Steps

- [ ] Review work order description provided by MCP tool output
- [ ] Identify linked requirements and blueprints
- [ ] Review every connected requirements document
- [ ] Review every connected blueprint document
- [ ] Follow `@…` mentions **and links** to other blueprints in linked documents and read each referenced blueprint via MCP
- [ ] Review every referenced blueprint discovered that way; add them to **Referenced Blueprints** in `context.md`
- [ ] Extract acceptance criteria from requirements
- [ ] Identify architecture path from blueprints (components, contracts, composition)
- [ ] `context.md` is filled or updated with `execution/scripts/update-context-index.sh` for Work Order, connected requirements, connected blueprints, referenced blueprints, and known delivery links

- [ ] **Certification: Phase 1 complete. Proceeding to Phase 2.**

## Phase 2: Planning And Implementation

### Implementation Plan

(see `execution/writing-implementation-plans.md`)

- [ ] Implementation plan documented in `implementation-plan.md`
- [ ] Testing section documented in `implementation-plan.md`

### Implementation (perfection Writer)

- [ ] Implemented changes are scoped to the Work Order
- [ ] Tests added or updated for changed behavior
- [ ] Tests are behavior-breaking (would fail if AC regresses) — not import/mock-smoke only
- [ ] No stub theater (`NotImplementedError`, ellipsis-only bodies, TODO-implement placeholders) in shipped paths
- [ ] Documentation, generated files, fixtures, migrations, or config updated where relevant
- [ ] Perfection loop followed (`.cursor/skills/rareangels-perfection/SKILL.md`): Writer → Judge → refine until 10

- [ ] **Certification: Phase 2 complete. Proceeding to Phase 3.**

## Phase 3: Review And Verification (perfection Judge)

### Review

- [ ] Blind Judge spawned (`Task` `subagent_type=review`; paths + AC only — no writer rationale)
- [ ] Judge recorded `code_grade: N/10` and `what_would_make_it_10`
- [ ] Refined until Judge returns **`code_grade: 10`** (`APPROVED` only at 10)
- [ ] Overall WO perfection pass completed (Overseer finds no remaining in-repo improvements)
- [ ] All acceptance criteria from the Work Order and linked requirements are satisfied
- [ ] Architecture is aligned with linked blueprints, or documented drift is accepted
- [ ] Exploratory pass on user-visible or external behavior — not only automated tests
- [ ] Latest `review-log.md` verdict is `APPROVED` with `code_grade: 10`

- [ ] **Certification: Phase 3 complete. Proceeding to Final Completion.**

## Final Completion Check

- [ ] All phase certifications above are complete
- [ ] Checklist is fully filled out with evidence
- [ ] Review log is complete (`review-log.md`) with **code_grade: 10**
- [ ] Implementation plan was followed (`implementation-plan.md`)
- [ ] All intended files are present in the working tree
- [ ] `python .cursor/skills/rareangels-light-overnight/scripts/validate_sf_checklist.py --wo <n>` exit 0
- [ ] `python .cursor/skills/rareangels-light-overnight/scripts/validate_code_quality_gate.py --min-grade 10 --wo <n> --paths <changed product files>` exit 0
- [ ] Work order status updated to `in_review` (then evidence comment → `completed`)
