# Execute Work Order (Cursor-native — SF-spine)

## Purpose

Execute one or more Work Orders end to end: gather context, plan, implement,
review, verify, and hand off — reflecting state to SF at every phase boundary
(`edit_work_order` status move + `add_comment` evidence). See
`../rareangels-coding-process/references/sf-state-reflection.md` for the exact
MCP calls.

This is the Cursor-native execution process. PowerShell init/context scripts;
the `user-software-factory-rare-angels` MCP server is the state spine.

## Single Work Order Execution

### 1. Resume or initialize the execution directory

First check whether `.sw-factory/WO-<number>/` already exists.

- If it exists: resume from the existing execution files and continue from the current checklist phase.
- If it does not exist: initialize it.

**PowerShell (Windows — default for Cursor on this repo):**

```powershell
powershell -ExecutionPolicy Bypass -File .cursor/skills/software-factory/execution/scripts/init-wo-execution.ps1 `
  -WorkOrderNumber "WO-<number>" `
  -WorkOrderTitle "<title>" `
  -WorkOrderId "<stable-id>"
```

Initialization creates:

- `checklist.md` - execution checklist
- `context.md` - quick-reference links and notes for execution context
- `implementation-plan.md` - implementation plan
- `review-log.md` - review log

Do not re-run initialization for an existing Work Order directory unless the user explicitly approves replacing execution files, and commit `.sw-factory/` with the rest of the change when Git is your execution-artifact system of record.

**Reflect to SF:** after init + plan (step 4), call `edit_work_order(work_order_number="WO-<n>", status="in_progress")` + `add_comment(work_order_number="WO-<n>", body="Started. Plan: .sw-factory/WO-<n>/context.md + implementation-plan.md")`.

### 2. Follow the checklist protocol

**CHECKLIST COMPLETION IS MANDATORY. EVERY ITEM MUST END IN ONE OF TWO STATES: CHECKED COMPLETE WITH `[x]`, OR MARKED `[SKIP]` WITH A SKIP REASON. UNCHECKED ITEMS ARE EXECUTION FAILURES, NOT TODOs TO IGNORE.**

Complete the checklist incrementally throughout execution. Check items off immediately after completing them and add notes in real time when evidence or skip reasons are needed. Do not defer checklist updates to the end. Each phase ends with a certification line that must be checked before proceeding to the next phase.

Skip protocol:

```markdown
- [SKIP] E2E tests run/passing
  Skip reason: Backend-only service refactor with no user-facing flow.
```

RareAngels enforces a **full-template** rule (see `.cursor/rules/software-factory-checklist.mdc`) — never a 5-line summary. Run `python .cursor/skills/rareangels-light-overnight/scripts/validate_sf_checklist.py --wo <n>` before MCP `completed`; exit 0 required.

### 3. Gather Software Factory context

Use the Software Factory MCP (`software-factory-rare-angels` in `.cursor/mcp.json`) to gather work order context. Track each completed context step in `checklist.md`; do not duplicate checklist detail here.

1. Treat the Work Order description or task request as execution scope: in-scope deliverables, exclusions, linked records, and acceptance expectations.
2. Read all linked requirements and extract the acceptance criteria that must pass.
3. Read all linked blueprints and identify the architecture path: components, models, contracts, composition, and implementation boundaries.
4. CRITICAL: Follow all blueprint references in the documents you read, including `@…` mentions and markdown links to other blueprints (resolve and read those through MCP too). It is absolutely necessary to understand linked blueprints.
5. Explore analogous code in the repository before inventing new structure. Identify file structure, naming patterns, service patterns, error handling, dependency injection, reusable components, and conventions specific to the touched module.
6. Use subagents or parallel exploration when the environment supports it and the work can be separated cleanly. In Cursor, use the `Task` tool with `subagent_type` (see `.cursor/agents/`).
7. Fill or update `context.md` when structured links are known. Rerun whenever new referenced blueprints or user-directed delivery links become known.

**PowerShell:**

```powershell
powershell -ExecutionPolicy Bypass -File .cursor/skills/software-factory/execution/scripts/update-context-index.ps1 `
  -WorkOrderNumber "WO-<number>" `
  -WorkOrderTitle "<title>" `
  -WorkOrderId "<stable-id>" `
  -Status "in_progress" `
  -Requirement "<requirement title>|<id-or-url>" `
  -Blueprint "<blueprint title>|<id-or-url>" `
  -ReferencedBlueprint "<component blueprint title>|<id-or-url>" `
  -Branch "<branch-name-if-applicable>" `
  -PullRequestUrl "<url-if-applicable>"
```

`-Requirement`, `-Blueprint`, and `-ReferencedBlueprint` may each be passed more than once.

### 4. Write the implementation plan

Write the implementation plan to `.sw-factory/WO-<number>/implementation-plan.md` (see [writing-implementation-plans.md](writing-implementation-plans.md) for structure and guidance).

**Do not create or modify implementation files until `implementation-plan.md` is written.** The plan must exist before code changes begin.

### 5. Implement with context

Implement only the Work Order scope. The implementation must stay traceable to:

- Work Order deliverables and exclusions
- linked requirements and acceptance criteria
- linked blueprint architecture, contracts, component composition, and implementation boundaries
- local codebase conventions and reusable code discovered during context gathering

**Robust code (enforced — grade 10 only):** follow
`.cursor/skills/rareangels-perfection/SKILL.md` and
`.cursor/rules/perfection-standard.mdc`. No stubs. No light/closeout. Loop
Writer→Judge until **10**, then overall WO perfection pass.

### 6. Review and verify (Judge + perfection pass)

After implementation, run the perfection Judge (`Task` `subagent_type=review`,
blind: paths + AC only). `APPROVED` **only if `code_grade == 10`**. Otherwise
refine and re-judge — no iteration cap.

Then Overseer **perfection pass** on the whole WO. If anything remains in-repo,
Writer again → Judge again.

Gates (all required before handoff):

- `validate_sf_checklist.py --wo <n>` exit 0
- `validate_code_quality_gate.py --min-grade 10 --wo <n> --paths …` exit 0
- `review-log.md` has `APPROVED` + `code_grade: 10`

**Reflect to SF:** on Judge APPROVED at 10, call `edit_work_order(... status=in_review)` +
`add_comment(... code_grade=10 ...)`.

### 7. Complete the handoff

Before handoff, confirm checklist certifications, plan, review-log APPROVED@10,
both validators exit 0, perfection pass clean.

**Reflect to SF (completed gate):** add_comment (files/tests/commands + code_grade 10)
FIRST, then `edit_work_order(... status=completed)`.

Then commit + safe push `origin`/`main`.

## Multiple Work Orders

Use this section when the user's request references more than one Work Order, for example:

- "implement WO-1740, WO-1741, WO-1742"
- "execute WO-1740 through WO-1758"
- "move all Work Orders in phase 23 to review"
- "run the epic for feature X" after listing its Work Orders

Batch execution is sequential by default. Expand ranges or phase/epic references into an ordered list before starting. If ordering is ambiguous, resolve by explicit dependency first, then phase/order metadata, then Work Order number or creation order.

For each Work Order in order:

1. Create or update a visible progress item for that Work Order.
2. Execute the Work Order using this file.
3. If the Work Order reaches handoff, record `WO-<number>: COMPLETE - <summary>` and continue.
4. If the Work Order fails permanently, record `WO-<number>: FAILED - <reason>` and stop the queue. The user decides whether to fix, retry, or skip.

Rules:

- One Work Order at a time unless the user explicitly authorizes parallel execution and the tasks are independent.
- Do not batch unrelated Work Orders into one execution directory.
- Do not skip failed Work Orders without user direction.
- Keep each Work Order's checklist, context, plan, and review log separate.

When the queue stops or finishes, report completed, failed, and not-started Work Orders.
