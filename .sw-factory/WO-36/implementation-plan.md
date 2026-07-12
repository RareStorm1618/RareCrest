# Implementation Plan: WO-36

**Work Order:** WO-36 — Implement AttentionFlagService and entity relationships (API Server)

## Summary

Production AttentionFlagService: shared AttentionItem signal set, open decisions with resolution clearing flags, conflict tracking, unverified-claim consumption from Legal & Compliance, entity relationships with constraints, and deployment-clearance in portfolio roll-up.

## Deliverables

- `packages/portfolio/src/attention.ts` — domain logic + 5 tests
- `packages/db/migrations/006_attention_items.sql` — open decisions, conflicts, unverified claims
- `apps/api/src/services/attention-flag.ts` + `attention-flag-routes.ts`
- `apps/web/src/components/AttentionFlagsPanel.tsx` + portfolio deploy-clearance column

## Evidence

Validators exit 0; review-log APPROVED code_grade 10.
