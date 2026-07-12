# Implementation Plan: WO-31

**Work Order:** WO-31 — Build DiagnosticsWorkspace assessment surface (Client App)
**Created At (UTC):** 2026-07-11T17:30:00Z

## Summary

Production-depth DiagnosticsWorkspace: eight-dimension readiness scoring with anchored descriptors, mandatory run order with dependency locking, resumable partial state, band interpretation, governance deployment lock, and migration halt surfacing. Server-owned state via API; zero-authority web surface.

## Code Reuse And Package Structure

- Reuse `@rarecrest/db` for assessment persistence
- Reuse `@rarecrest/contracts` for vertical types
- New `@rarecrest/diagnostics` package for deterministic scoring logic
- Extend `apps/api` with `DiagnosticsService` + routes
- New `DiagnosticsWorkspace` React component in `apps/web`

## Components And Flow

1. Director selects entity from Portfolio → opens DiagnosticsWorkspace
2. `GET /api/v1/diagnostics/:entityId` returns run order, dimensions, partial state
3. `PATCH .../responses` saves partial scores (AC-DIAG-001.5)
4. `POST .../steps/readiness_score/complete` computes band via `@rarecrest/diagnostics`
5. UI renders locked steps, band result, deployment lock, migration halt

## Testing

- `packages/diagnostics`: 10 unit tests (bands, dabbling, token-maxxing, governance min, run order)
- API auth/portfolio tests remain green (13 tests)

## Evidence

- Validators exit 0 for WO-31
- review-log.md: APPROVED code_grade 10
