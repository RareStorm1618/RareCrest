# Mobile Director Console

RareCrest's Expo app (`apps/mobile`) is a **director operating console**, not a
status viewer. It talks to the same fail-closed APIs as the web Command Center.

## Auth

Prefer a bearer token in production:

```
EXPO_PUBLIC_API_URL=https://rarecrest.internal
EXPO_PUBLIC_API_BEARER_TOKEN=<director JWT with role=director>
```

Dev loopback falls back to `x-user-id` / `x-user-role=director` / `x-vertical=holding`
headers (rejected when `AUTH_TRUST_MODE=strict`).

## Actions

| Surface | API | Notes |
|---------|-----|-------|
| Refresh | `GET /api/v1/command/dashboard` + portfolio status | Pull-to-refresh |
| Resolve attention | `POST /api/v1/entities/:id/attention-flags/:flagId/resolve` | Confirm dialog |
| Seal parliament | `POST /api/v1/parliament/:id/seal` | `financial_release` → `time_lock`; else `immediate` |
| Kill switch | arm / trigger / disarm under `/api/v1/runtime/kill-switch/:entityId/*` | Reason required; confirm dialogs |

Helpers live in `apps/mobile/src/director-api.ts` (unit-tested).

## Still out of scope

- Push notifications / offline cache
- Biometric device-bound auth
- Deep links into wiki/runtime tabs
- Executing due time-lock seals from the phone (night-shift / `POST /api/v1/seals/due/execute` remains ops/cron)

See `docs/EXO-GAPS.md` for the honest remaining mobile gaps.
