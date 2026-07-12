# Implementation Plan: WO-32

**Work Order:** WO-32 — Implement MigrationRecommender (API Server)

## Summary

Production MigrationRecommender: captures immune-system strength + headcount, recommends Direct/Edge/Light Edge mode per REQ-DIAG-007, band-consistent on-ramp, maturity ladder reconciliation per REQ-DIAG-006.2, and blocks when DeploymentGateService verdict indicates deployment lock or migration halt.

## Deliverables

- `packages/diagnostics/src/migration.ts` — domain logic + 11 tests
- `apps/api/src/services/migration-recommender.ts` — loads assessment, persists recommendation
- `apps/api/src/routes/migration-routes.ts` — `POST /api/v1/diagnostics/:entityId/migration-recommend`

## Evidence

Validators exit 0; review-log APPROVED code_grade 10.
