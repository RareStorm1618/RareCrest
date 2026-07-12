export interface InversionSource {
  streamId: string;
  piiClass: "none" | "limited" | "high";
  lineageComplete: boolean;
  reversible: boolean;
}

export interface InversionChecklist {
  ready: boolean;
  checklist: Array<{ item: string; passed: boolean }>;
  blockers: string[];
}

export function evaluateDataPlaneInversion(sources: InversionSource[]): InversionChecklist {
  const checklist = [
    {
      item: "all_streams_have_lineage",
      passed: sources.every((source) => source.lineageComplete),
    },
    {
      item: "all_streams_reversible",
      passed: sources.every((source) => source.reversible),
    },
    {
      item: "no_high_pii_without_controls",
      passed: sources.every((source) => source.piiClass !== "high" || (source.lineageComplete && source.reversible)),
    },
  ];
  const blockers = checklist.filter((item) => !item.passed).map((item) => item.item);
  return { ready: blockers.length === 0, checklist, blockers };
}
