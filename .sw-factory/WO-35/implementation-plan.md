# Implementation Plan: WO-35

**Work Order:** WO-35 — Implement RegulatoryProfileService (API Server)

## Summary

Production RegulatoryProfileService: entity types, type+domain default regimes, regime add/remove with audit trail, incomplete profile flagging, holding-entity cross-cutting representation, and profile surfaced in portfolio + entity views.

## Deliverables

- `packages/portfolio/src/regulatory-profile.ts` — domain logic + 5 tests
- `packages/db/migrations/005_regulatory_profile.sql` — nullable entity_type + audit table
- `apps/api/src/services/regulatory-profile.ts` + `regulatory-profile-routes.ts`
- `apps/web/src/components/RegulatoryProfilePanel.tsx` + portfolio table regimes column

## Evidence

Validators exit 0; review-log APPROVED code_grade 10.
