-- EXO Wave A: seal effect-digest binding (fail-closed action <-> seal match check —
-- see assertEffectDigestConsistent in apps/api/src/services/parliament.ts). Night-shift
-- worker and the doctrine seal-gate route reuse existing parliament_sessions/seals tables
-- and add no new tables of their own.

ALTER TABLE rarecrest.seals
  ADD COLUMN IF NOT EXISTS effect_digest TEXT;
