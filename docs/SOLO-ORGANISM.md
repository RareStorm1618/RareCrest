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

Individually, each of these is a local reflex: a rights ceiling, a kill switch, a signed
instruction. None of them requires more than one human to act. Parliament + Seal is what sits
above them — it is where the organism deliberately slows itself down and asks more than one
perspective before an action becomes irreversible.

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
