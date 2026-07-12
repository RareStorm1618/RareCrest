# The Solo Organism

RareCrest exists to let **one human director** run a multi-vertical, AI-native organism —
RareStorm, RareAngels, RareEdge, HopeCoin, Heal Kids, and the Holding layer — without a
traditional management chain, while never letting agents accumulate the authority a
traditional org would spread across many humans. "Solo" describes the human at the top, not
the absence of checks: the fewer humans there are, the more the *structure itself* has to
carry the load that a board, a compliance department, and a second signature usually carry.

This document is the map of how that structure works end to end — from a single agent's
day-to-day rights ceiling, up through the moment something consequential enough that a
lone signature (even a director's) is not enough.

## The organs

| Layer | What it is | Where it lives |
| --- | --- | --- |
| Agent passports | Per-agent rights ceiling (`sensitive_data`, `code_execution`, `external_comms`), hard-rule pre-checked before persistence. | `apps/api/src/routes/agent-passport-routes.ts` |
| Officer roles | Named, template-capped roles (`compliance_prep`, `treasury_prep`, `canon_librarian`, `red_team`, …) a director assigns to an agent — each template caps `maxRights`, `phiBlind`, `financialPrepOnly`, `mayExecuteProduction`. | `packages/contracts/src/index.ts` (`OFFICER_ROLE_TEMPLATES`), `apps/api/src/routes/officer-routes.ts` |
| Kill switch | Durable, dual-control reflex arc — arm/trigger/disarm are director-only, disarm requires a *different* human than whoever armed/triggered. | `apps/api/src/services/kill-switch.ts` |
| Human instructions | The durable authorization record behind every financial/held-action release — never a bare client-supplied id, always verified server-side against `rarecrest.human_instructions`. | `apps/api/src/routes/human-instruction-routes.ts` |
| PHI encryption layer | Per-entity, KMS-wrapped envelope custody; agents get blind refs, never plaintext. | `docs/TRUST.md` §"What is fail-closed today" |
| **Parliament + Seal** | The organism's *collective* decision layer: multi-officer, multi-stakeholder-lens deliberation gate in front of the actions above a single director's signature shouldn't carry alone. | This document, §"Parliament + Seal" |
| North Star metrics | Durable, append-only mission events (`capital_routed_usd`, `healing_hours`, `families_supported`, `donation_pct_bps`) feeding a single `dualMissionScore`. | `apps/api/src/services/holding-metrics.ts`, `apps/api/src/routes/holding-metrics-routes.ts`, this document §"North Star metrics" |
| AI spend ledger | Append-only, best-effort durable record of every model call's estimated token cost, independent of the in-memory per-vertical daily budget. | `rarecrest.ai_spend_ledger`, `services/intelligence/src/spend-ledger.ts`, `GET /api/v1/ops/ai-spend` |
| **Autopilot + shadow officers** | Per-entity autonomy ceiling (`off`/`observe`/`draft`/`propose`) and shadow officer passports that may draft/vote but never seal, activate, or kill-switch. | `032_autopilot_shadow.sql`, `apps/api/src/routes/autopilot-routes.ts`, `docs/SOLO-ORGANISM.md` §Autopilot |

Individually, each of these is a local reflex: a rights ceiling, a kill switch, a signed
instruction. None of them requires more than one human to act. Parliament + Seal is what sits
above them — it is where the organism deliberately slows itself down and asks more than one
perspective before an action becomes irreversible.

## Autopilot levels + shadow officers

**Autopilot** is an entity-scoped ceiling for *agent* action classes — never for money, PHI,
seals, or kill-switch (those stay director + Parliament):

| Level | Agents may |
| --- | --- |
| `off` | Nothing autonomous (default) |
| `observe` | Read / trace / metrics |
| `draft` | Observe + draft wiki / skill-companion |
| `propose` | Draft + cast Parliament votes / raise attention |

Director sets via `PATCH /api/v1/runtime/entities/:entityId/autopilot`.

**Shadow officer passports** (`assignmentMode: "shadow"` on assign) bake
`SHADOW_OFFICER_CONSTRAINTS` into the passport. Shadow officers may draft and vote; they
**cannot** seal, activate runtime to `running`, or arm/trigger/disarm kill-switch. Live
assignments remain the default.

## Parliament + Seal

**Stake classes.** Four kinds of action can be gated behind a Parliament session:
`wiki_promote` (promoting a draft into canon), `financial_release` (releasing a held financial
action), `activation` (bringing an agent/runtime live), and `doctrine` (changing a governing
rule itself).

**Sessions and votes.** A director (or an officer acting on their behalf) opens a
`parliament_sessions` row naming a `topic` and one of the four `stake_class` values. Officers —
using the same S2 officer-role vocabulary that assigns passports (`compliance_prep`,
`treasury_prep`, `canon_librarian`, `red_team`, …) — cast a `parliament_votes` row: `aye` /
`nay` / `abstain`, tagged with a `stakeholder_lens` (`lp`, `patient`, `regulator`,
`engineering`, `fiduciary`) and an optional `rationale`. The point of `stakeholder_lens` is
that Parliament is deliberately not "ask one more agent" — it requires *distinct perspectives*
to weigh in, not just more votes from the same angle.

Once distinct `stakeholder_lens` votes on a session reach `PARLIAMENT_MIN_VOTES` (default `2`),
the session auto-advances from `open` to `ready_for_seal`. If any `red_team` officer has an
outstanding `nay` vote, the session's `red_team_nay` flag is set — this never blocks the
session from becoming ready, but it does change what sealing requires next.

**Sealing.** Only a verified director can seal a `ready_for_seal` session
(`POST /api/v1/parliament/:id/seal`), and only in one of two modes:

- `immediate` — the seal executes right away; the gated action may proceed in the same request.
- `time_lock` — the seal records `execute_after` (now + `executeAfterHours`, default `4`), and
  is picked up later by `POST /api/v1/seals/due/execute`. Before `execute_after` elapses, any
  attempt to execute the seal is refused (403) — the cooling-off window is enforced, not
  cosmetic.

If `red_team_nay` is set on the session, sealing is refused (403) unless the director supplies
an explicit `overrideNote` — the override is always written to the human record, never silent.
For `financial_release` and `wiki_promote` stake classes, a director may also supply a
`humanInstructionId`, which is verified server-side (must exist, match the entity, be
unexpired/unrevoked) the same way every other financial release is verified — Parliament does
not replace that check, it sits in front of it.

**Cancellation.** A `time_lock` seal can be cancelled by a director
(`POST /api/v1/seals/:id/cancel`) any time before it executes. Cancelling a seal rejects its
session (`status = 'rejected'`) and permanently blocks that seal from ever executing — the
cooling-off window exists specifically so a second look can still stop something before it
becomes real.

**Wired into the gated actions.** Two existing consequential actions now hold their gate behind
Parliament whenever `parliamentRequired()` is true:

- `POST /api/v1/wiki/promote` — requires `body.parliamentSessionId` pointing at a `sealed` or
  `ready_for_seal` session with `stake_class = wiki_promote` for the promoting request; a
  `ready_for_seal` session is auto-sealed `immediate` inline with the promoting director.
- `POST /api/v1/runtime/human-review/:id/resolve` (financial held-action approval) — requires
  `heldAction.parliamentSessionId` pointing at a `financial_release` session, resolved the same
  way, *in addition to* (not instead of) the existing `humanInstructionId` dual-control check.

**`parliamentRequired()`.** Parliament is required whenever `PARLIAMENT_REQUIRED=true`, or
whenever `AUTH_TRUST_MODE=strict` and `PARLIAMENT_REQUIRED` has not been explicitly set to
`false`. `PARLIAMENT_REQUIRED=false` always wins — this is the dev-loopback / test opt-out, so
a solo developer running the stack locally is never blocked by a governance ceremony meant for
production-consequential actions.

## Night shift

Parliament's `time_lock` seals and async jobs both need an unattended, periodic pass —
nobody should have to remember to click "execute due seals" every few hours. `runNightShift`
(`apps/api/src/worker/night-shift.ts`) does two narrow things: executes any due `time_lock`
seals (reusing `ParliamentService.listDueSeals`/`executeSeal`, so the same fail-closed
time-lock and effect-digest checks apply) and marks `async_jobs` stuck in `pending`/`running`
past a staleness window as `failed`. It deliberately does *not* attempt the
`wiki_promote` side-effect the director-triggered `/api/v1/seals/due/execute` route performs —
that stays a human-triggered action.

`POST /api/v1/ops/night-shift/run` is gated the same way as `/api/v1/seals/due/execute`: a
verified director, or a trusted internal caller presenting `x-internal-service-token`. A
cron-driven scheduler on the host (or any process with the internal service token) can drive
it every 15 minutes:

```
*/15 * * * * curl -s -X POST https://localhost:3000/api/v1/ops/night-shift/run \
  -H "x-internal-service-token: $INTERNAL_SERVICE_TOKEN" -H "x-vertical: holding" -H "x-user-id: night-shift"
```

## North Star metrics

The mission the holding layer exists to serve — routing capital *and* healing people — is
easy to lose sight of one entity at a time. `POST /api/v1/holding/metrics` lets a director or a
verified human record a durable, append-only event (`rarecrest.holding_metric_events`) against
one of four keys: `capital_routed_usd`, `healing_hours`, `families_supported`, and
`donation_pct_bps` (donation percentage in basis points, so `750` = 7.5%). Agents cannot write
these events — this is a human-attested ledger of what actually happened, not a model's guess.

`GET /api/v1/holding/north-star` aggregates the trailing window (30 days by default,
`?days=` to override) into totals plus a single `dualMissionScore` (0-100): each of the four
totals is normalized against a documented target (`NORTH_STAR_TARGETS` in
`apps/api/src/services/holding-metrics.ts` — $1M capital, 10,000 healing hours, 1,000 families,
10,000bps/100% donation ceiling), capped at 1.0, then averaged and scaled to 0-100. It is
deliberately a simple, transparent heuristic rather than a "smart" model — the point is that a
director can read the formula in one pass and know exactly what the number does and does not
mean. The Command Center's North Star card renders this on load.

## Durable AI spend + the model-router extension point

Every skill-companion `complete` response now writes a best-effort row to
`rarecrest.ai_spend_ledger` (`services/intelligence/src/spend-ledger.ts`) — vertical, entity,
provider, a `len/4` token estimate for both the request and the response, and an estimated USD
cost (`AI_SPEND_INPUT_USD_PER_1M` / `AI_SPEND_OUTPUT_USD_PER_1M`, defaulting to a deliberately
rough $0.50/$1.50 per 1M tokens placeholder — documented, not hidden, until real provider
billing is wired in). This is strictly additive: the existing in-memory per-vertical daily
budget in `services/intelligence/src/budgets.ts` stays the fast hot-path gate, and a
missing/unreachable database never blocks a companion response. `GET /api/v1/ops/ai-spend`
(director-only) sums this ledger by vertical over a trailing window (`?days=`, default 7).

`ModelRouter` (`services/intelligence/src/model-router.ts`) still defaults to a deterministic
stub response when no explicit `ProviderCaller` is wired — until a director sets
`LLM_HTTP_ENDPOINT`. When set, every stub-path call instead `POST`s
`{ prompt, provider, maxTokens?, temperature? }` to that URL and treats a JSON `{ text }` (or
`{ content }`) field, or a plain-text body, as the model's response. This is the seam meant for
plugging in a real backing model (self-hosted or gateway) without touching any router/caller
code — see `docs/TRUST.md` for the environment knob.

## Why this shape

A single human director cannot personally review every promote, every financial release, every
activation — that is the entire premise of running an AI-native organism instead of a
traditional company. But "the director reviewed it" and "an agent said it's fine" are both
single points of failure in different directions. Parliament + Seal is the organism's way of
requiring *more than one lens* before something becomes irreversible, while keeping the final
human seal — immediate or time-locked, cancellable until it isn't — as the one signature that
actually matters. See [`TRUST.md`](./TRUST.md) for how this sits alongside the rest of
RareCrest's fail-closed controls, and for what must remain human-owned regardless of how much
of the ceremony above is automated.
