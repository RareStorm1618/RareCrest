export interface PurposeProtocolInput {
  entityId: string;
  mission: string;
  nonNegotiables: string[];
  successSignals: string[];
}

export interface PurposeProtocol {
  entityId: string;
  mission: string;
  nonNegotiables: string[];
  successSignals: string[];
  checks: {
    missionPresent: boolean;
    hasNonNegotiables: boolean;
    hasSuccessSignals: boolean;
  };
}

function normalizeUnique(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

export function buildPurposeProtocol(input: PurposeProtocolInput): PurposeProtocol {
  const mission = input.mission.trim();
  const nonNegotiables = normalizeUnique(input.nonNegotiables);
  const successSignals = normalizeUnique(input.successSignals);

  return {
    entityId: input.entityId,
    mission,
    nonNegotiables,
    successSignals,
    checks: {
      missionPresent: mission.length > 0,
      hasNonNegotiables: nonNegotiables.length > 0,
      hasSuccessSignals: successSignals.length > 0,
    },
  };
}
