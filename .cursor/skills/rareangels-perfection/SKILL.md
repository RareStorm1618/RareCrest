# RareAngels Perfection Standard (Grade 10)

## Purpose

Enforce **code_grade 10** — production-ready, fully tested, no stubs, AC-complete implementation traceable to Work Order scope, requirements, and blueprints.

## Non-Negotiable Rules

1. **No stub theater** — no `NotImplementedError`, ellipsis-only bodies, `TODO: implement`, placeholder returns, or mock-only paths in shipped code.
2. **AC-complete** — every acceptance criterion from linked requirements and the Work Order description must have a test or verifiable evidence path.
3. **Blueprint-aligned** — components, contracts, data flow, and boundaries match linked blueprints; drift must be documented and accepted.
4. **Behavior-breaking tests** — tests must fail if AC regresses; import/smoke-only tests are insufficient.
5. **Hard rules structurally enforced** where applicable:
   - Two-of-three rights (sensitive data, code execution, external comms)
   - Encrypt-before-access for PHI
   - No autonomous financial action
6. **No iteration cap** — Writer → blind Judge loop continues until `code_grade: 10`.

## Perfection Loop

```
Overseer owns WO
  → Writer (mechanical) implements scope
  → blind Judge (review) grades paths + AC only
  → if code_grade < 10: Writer refines
  → Overseer perfection pass on whole WO
  → if gaps: Writer → Judge again
  → gates: validate_sf_checklist + validate_code_quality_gate --min-grade 10
  → SF evidence → completed
```

## Judge Grading Rubric (1-10)

| Grade | Meaning |
|-------|---------|
| 1-4 | Major gaps: stubs, missing AC, broken tests, wrong architecture |
| 5-7 | Partial: some AC met, tests weak, minor stubs or drift |
| 8-9 | Near-complete: small gaps, advisory findings only |
| **10** | **APPROVED**: all AC satisfied, no stubs, tests pass, blueprint-aligned |

## Writer Constraints

- Implement **only** Work Order in-scope deliverables
- Follow repo conventions discovered during context gathering
- Add/update tests for every changed behavior
- Update migrations, config, docs where relevant
- Record evidence in checklist and review-log

## Judge Constraints (Blind)

- Receive **only**: changed file paths + acceptance criteria text
- Do **not** receive: writer rationale, implementation plan, or prior round excuses
- Output: `code_grade: N/10`, `what_would_make_it_10`, verdict `APPROVED` (only at 10) or `CHANGES_REQUESTED`

## Gates Before Handoff

```bash
python .cursor/skills/rareangels-light-overnight/scripts/validate_sf_checklist.py --wo <n>
python .cursor/skills/rareangels-light-overnight/scripts/validate_code_quality_gate.py --min-grade 10 --wo <n> --paths <changed-files>
```

Both must exit 0. `review-log.md` must contain `APPROVED` and `code_grade: 10`.
