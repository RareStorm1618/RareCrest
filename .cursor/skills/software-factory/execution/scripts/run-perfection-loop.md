# WO Perfection Loop Runner

Per-WO execution using Overseer + Writer + blind Judge pattern.

## Subagents (Grok 4.5)

| Role | subagent_type | Model |
|------|---------------|-------|
| Overseer | generalPurpose | grok-4.5-fast-xhigh |
| Writer | mechanical | grok-4.5-fast-xhigh |
| Judge | review | grok-4.5-fast-xhigh |
| Verify | verify-lane | grok-4.5-fast-xhigh |

## Automated Artifact Completion

```bash
python scripts/complete_wo.py --wo <n> --title "<title>" --paths <file1> <file2>
python scripts/run_wo_queue.py <start> <end>
```

## Gates (required before SF `completed`)

```bash
python .cursor/skills/rareangels-light-overnight/scripts/validate_sf_checklist.py --wo <n>
python .cursor/skills/rareangels-light-overnight/scripts/validate_code_quality_gate.py --min-grade 10 --wo <n> --paths <files>
```

## SF Reflection (user-software-factory-exo)

1. `edit_work_order(id="<n>", status="in_progress")` + plan comment
2. After Judge APPROVED@10: `edit_work_order(id="<n>", status="in_review")`
3. Evidence comment FIRST, then `edit_work_order(id="<n>", status="completed")`

See `.cursor/skills/rareangels-coding-process/references/sf-state-reflection.md`
