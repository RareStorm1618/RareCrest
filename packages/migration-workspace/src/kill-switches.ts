export interface KillSwitchState {
  id: string;
  armed: boolean;
  testedWithinDays: number;
  ownerOnCall: boolean;
}

export interface KillSwitchEvaluation {
  allReady: boolean;
  missing: string[];
}

const TEST_WINDOW_DAYS = 30;

export function evaluateKillSwitches(states: KillSwitchState[]): KillSwitchEvaluation {
  const missing: string[] = [];
  for (const state of states) {
    if (!state.armed) missing.push(`${state.id}:not_armed`);
    if (state.testedWithinDays > TEST_WINDOW_DAYS) missing.push(`${state.id}:stale_test`);
    if (!state.ownerOnCall) missing.push(`${state.id}:no_owner`);
  }
  return { allReady: missing.length === 0, missing };
}
