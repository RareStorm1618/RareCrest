# SF State Reflection (MCP Calls)

Reflect Work Order state to Software Factory at every phase boundary.

**MCP Server:** `user-software-factory-exo`

## Phase Boundaries

### 1. Start (after init + plan)

```
edit_work_order(id="<wo-number>", status="in_progress")
add_comment(entity_type="work_order", entity_id="<wo-number>", message="Started. Plan: .sw-factory/WO-<n>/context.md + implementation-plan.md", is_flagged=false)
```

### 2. Review (Judge APPROVED at grade 10)

```
edit_work_order(id="<wo-number>", status="in_review")
add_comment(entity_type="work_order", entity_id="<wo-number>", message="Judge APPROVED code_grade=10. Review log: .sw-factory/WO-<n>/review-log.md", is_flagged=false)
```

### 3. Complete (evidence FIRST, then status)

```
add_comment(entity_type="work_order", entity_id="<wo-number>", message="COMPLETE code_grade=10. Files: <list>. Tests: <commands+results>. Validators: validate_sf_checklist exit 0, validate_code_quality_gate --min-grade 10 exit 0.", is_flagged=false)
edit_work_order(id="<wo-number>", status="completed")
```

**Order matters:** evidence comment BEFORE `completed` status move.

## Blocked

```
edit_work_order(id="<wo-number>", status="blocked")
add_comment(entity_type="work_order", entity_id="<wo-number>", message="BLOCKED: <reason>. Blocked by: WO-<dep>.", is_flagged=true)
```

## Evidence Comment Template

```
COMPLETE code_grade=10
WO: WO-<n> — <title>
Files: <comma-separated owned paths>
Tests: <command> → exit 0
Validators:
  - validate_sf_checklist.py --wo <n> → exit 0
  - validate_code_quality_gate.py --min-grade 10 --wo <n> --paths <files> → exit 0
Review: .sw-factory/WO-<n>/review-log.md (APPROVED, code_grade: 10)
Commit: <sha>
```
