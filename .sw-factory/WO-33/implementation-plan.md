# Implementation Plan: WO-33

**Work Order:** WO-33 — Implement TaskDecompositionMatrix (API Server)

## Summary

Production TaskDecompositionMatrix: lists roles/tasks per function, categorizes tasks (judgment/pattern/coordination/creation), accepts director-entered agent-readiness scores 1-5, maps to deployment actions, and exports completed matrices. Scoring is director-entered — not routed through ScoringEngine.

## Deliverables

- `packages/diagnostics/src/task-decomposition.ts` — domain logic + 5 tests
- `packages/db/migrations/004_task_decomposition.sql` — persistence
- `apps/api/src/services/task-decomposition.ts` + `task-decomposition-routes.ts`
- `apps/web/src/components/TaskDecompositionPanel.tsx`

## Evidence

Validators exit 0; review-log APPROVED code_grade 10.
