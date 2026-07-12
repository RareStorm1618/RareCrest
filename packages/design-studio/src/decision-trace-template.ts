export interface DecisionTraceTemplateInput {
  entityId: string;
  decisionType: string;
  requiredEvidence: string[];
}

export interface DecisionTraceTemplate {
  entityId: string;
  decisionType: string;
  sections: Array<{
    key: string;
    label: string;
    required: boolean;
  }>;
  requiredEvidence: string[];
}

function clean(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

export function buildDecisionTraceTemplate(
  input: DecisionTraceTemplateInput,
): DecisionTraceTemplate {
  const requiredEvidence = clean(input.requiredEvidence);
  return {
    entityId: input.entityId,
    decisionType: input.decisionType.trim(),
    requiredEvidence,
    sections: [
      { key: "context", label: "Context", required: true },
      { key: "options", label: "Options Considered", required: true },
      { key: "verdict", label: "Verdict", required: true },
      { key: "evidence", label: "Evidence", required: true },
      { key: "rollback", label: "Rollback Plan", required: true },
    ],
  };
}
