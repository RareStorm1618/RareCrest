/** WO-52: EdgeTwinPlanner */

export const EDGE_TWIN_PHASES = ["shadow", "compare", "cutover"] as const;

export interface EdgeTwinPlan {
  entityId: string;
  parallelRunWeeks: number;
  phases: typeof EDGE_TWIN_PHASES;
  shadowStartWeek: number;
  compareStartWeek: number;
  cutoverWeek: number;
}

export function buildEdgeTwinPlan(entityId: string, parallelRunWeeks: number): EdgeTwinPlan {
  const shadowWeeks = Math.max(1, Math.floor(parallelRunWeeks * 0.4));
  const compareWeeks = Math.max(1, Math.floor(parallelRunWeeks * 0.4));
  return {
    entityId,
    parallelRunWeeks,
    phases: EDGE_TWIN_PHASES,
    shadowStartWeek: 1,
    compareStartWeek: shadowWeeks + 1,
    cutoverWeek: shadowWeeks + compareWeeks + 1,
  };
}
