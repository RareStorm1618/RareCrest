---
name: software-factory
description: "Cursor-native 8090 Software Factory skill — the spine of RareAngels code dev. Requirements, blueprints, work orders, and structured work-order execution with implementation plans, review, verification, and bidirectional SF state reflection (edit_work_order + add_comment at every phase boundary). Use this skill when the user asks to run, implement, review, or execute RareAngels work orders from Cursor, or when any Cursor agent needs the per-WO code-dev methodology. PowerShell-native scripts; Cursor MCP server; Grok 4.5 only."
---

# Software Factory (Cursor-native — the spine)

Software Factory is an AI-native SDLC method for connecting product intent,
technical intent, and implementation work in one traceable workflow. In
RareAngels, SF is the **spine**: the live source of truth for intent
(Requirements + Blueprints) and state (WO status + `blocked_by` + evidence
comments). The repo is the source of truth for implementation; this skill is
the sync layer that reflects every state change back to SF.

This skill is Cursor-native:
1. **Init / context scripts are PowerShell** (`init-wo-execution.ps1`, `update-context-index.ps1`) — Windows + PowerShell is the operator environment.
2. **MCP access** uses the `user-software-factory-rare-angels` MCP server registered in `.cursor/mcp.json` — the spine for `list_work_orders`, `read_work_order`, `edit_work_order`, `add_comment`.
3. **Browser verification** uses Cursor's built-in browser/preview when available; otherwise the `chrome-devtools-mcp` fallback documented in `execution/review-phase.md`.
4. **Subagent delegation** uses Cursor's `Task` tool with vendor-neutral `subagent_type` from `.cursor/agents/` (`mechanical`, `review`, `verify-lane`), all on Grok 4.5.

When project tools are available, use them; otherwise, use the files and templates in this skill as the execution system of record.

## Records

### Requirements

Requirements describe the system from an external perspective.

- Product Overview Documents capture durable product-wide why and what: business problem, current state, product description, success metrics, technical requirements, and other framing.
- Feature Requirements Documents capture localized feature intent with user stories and acceptance criteria. User stories state who needs what and why; acceptance criteria define testable behavior.

Read [guides/requirements-writing-guide.md](guides/requirements-writing-guide.md) when writing or revising requirements.

### Blueprints

Blueprints describe the system from an internal perspective.

- Container Blueprints document separately deployable or runnable units and their runtime boundaries.
- Component Blueprints document reusable system capabilities. Structured `component` blocks define runtime nodes; relationship paragraphs describe data, contracts, and control flow.
- Feature Blueprints compose Component Blueprints and feature-specific components to satisfy a Feature Requirements Document.

Read [guides/blueprint-writing-guide.md](guides/blueprint-writing-guide.md) when writing or revising blueprints. During implementation, follow referenced Blueprints—including `@…` mentions **and links** resolved via MCP—before coding so the full component graph is understood.

### Delivery

Work Orders describe delivery intent: implementable scope, exclusions, connected requirements, connected blueprints, and acceptance-test expectations.

Read [guides/work-order-writing-guide.md](guides/work-order-writing-guide.md) when creating or updating Work Orders.

## Routing

| Task                                            | Read                                                                                   |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| Executing one Work Order                        | [execution/execute-work-order.md](execution/execute-work-order.md)                     |
| Executing multiple Work Orders                  | [execution/execute-work-order.md](execution/execute-work-order.md)                     |
| Writing an implementation plan during execution | [execution/writing-implementation-plans.md](execution/writing-implementation-plans.md) |
| Running the review phase                        | [execution/review-phase.md](execution/review-phase.md)                                 |
| Initializing an execution directory (PowerShell)| [execution/scripts/init-wo-execution.ps1](execution/scripts/init-wo-execution.ps1)     |
| Updating execution context (PowerShell)         | [execution/scripts/update-context-index.ps1](execution/scripts/update-context-index.ps1) |
| Writing or revising requirements                | [guides/requirements-writing-guide.md](guides/requirements-writing-guide.md)           |
| Writing or revising blueprints                  | [guides/blueprint-writing-guide.md](guides/blueprint-writing-guide.md)                 |
| Creating or updating Work Orders                | [guides/work-order-writing-guide.md](guides/work-order-writing-guide.md)               |

## Work Order Execution

**Work Order executions must follow the execution process every time. Every checklist item must be checked complete with `[x]` or explicitly marked `[SKIP]` with a skip reason. Do not treat an unchecked item as implied, optional, or complete.**

Follow [execution/execute-work-order.md](execution/execute-work-order.md) for single Work Orders and multi-Work-Order queues. Read the related files in `execution/` when that guide routes to them.

The checklist is intentionally a living harness-engineering artifact. Teams should evolve it with the exact commands, checks, screenshots, migrations, fixtures, seed data, CI gates, and review rituals that make agentic programming reliable in their codebase.

### RareAngels-specific checklist enforcement

RareAngels adds two enforcement layers on top of the base SF checklist (see `.cursor/rules/software-factory-checklist.mdc`):

- **Full template required** — never a 5-line summary checklist. Use `execution/scripts/checklist-template.md` (or the mirror at `.cursor/skills/rareangels-light-overnight/references/checklist-template.md`).
- **Validator gate** — `python .cursor/skills/rareangels-light-overnight/scripts/validate_sf_checklist.py --wo <n>` must exit 0 before the `completed` status move. `remediate_sf_checklist.py` can repair abbreviated/missing artifacts.
- **SF state-reflection gate** — reflect state to SF at every phase boundary (`edit_work_order` status move + `add_comment` evidence per `../rareangels-coding-process/references/sf-state-reflection.md`). The `completed` move is gated by the Verification Addendum evidence comment (post the comment FIRST, then move status).
- **Safe commit + push (mandatory after every WO run)** — stage only owned paths → commit → `git push origin main`. Never `--force` / `--force-with-lease` / `--no-verify`. Non-ff → `git pull --ff-only origin main` then push again; if that fails, stop and report. A closeout without the push is incomplete. Do not open a PR or merge unless the operator asks.

## Public Docs

- Requirements Writing Guide: https://8090.ai/docs/opinions/requirements-writing-guide
- Blueprint Writing Guide: https://8090.ai/docs/opinions/blueprint-writing-guide
- Work Orders: https://8090.ai/docs/modules/work-orders
