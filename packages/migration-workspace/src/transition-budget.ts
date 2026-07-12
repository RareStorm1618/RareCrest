export interface TransitionBudgetInput {
  annualRunCost: number;
  transitionWindowMonths: number;
  contingencyPct: number;
  dualRunMultiplier?: number;
}

export interface TransitionBudget {
  baselineBudget: number;
  contingencyReserve: number;
  dualRunBuffer: number;
  totalBudget: number;
}

export function computeTransitionBudget(input: TransitionBudgetInput): TransitionBudget {
  const dualRunMultiplier = input.dualRunMultiplier ?? 1.25;
  const baselineBudget = Number(((input.annualRunCost / 12) * input.transitionWindowMonths).toFixed(2));
  const contingencyReserve = Number((baselineBudget * (input.contingencyPct / 100)).toFixed(2));
  const dualRunBuffer = Number(((baselineBudget * (dualRunMultiplier - 1)) * 0.5).toFixed(2));
  const totalBudget = Number((baselineBudget + contingencyReserve + dualRunBuffer).toFixed(2));
  return { baselineBudget, contingencyReserve, dualRunBuffer, totalBudget };
}
