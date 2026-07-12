export interface LearningSignal {
  occurredAt: string;
  delta: number;
  source: "evaluation" | "version_change" | "human_review";
}

export interface LearningVelocity {
  signalCount: number;
  totalDelta: number;
  averageDeltaPerDay: number;
  trend: "improving" | "declining" | "stable";
}

export function computeLearningVelocity(signals: LearningSignal[], windowDays = 30): LearningVelocity {
  if (signals.length === 0) {
    return { signalCount: 0, totalDelta: 0, averageDeltaPerDay: 0, trend: "stable" };
  }

  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const inWindow = signals.filter((signal) => new Date(signal.occurredAt).getTime() >= cutoff);
  const totalDelta = inWindow.reduce((sum, signal) => sum + signal.delta, 0);
  const averageDeltaPerDay = Number((totalDelta / Math.max(windowDays, 1)).toFixed(4));
  const trend: LearningVelocity["trend"] =
    averageDeltaPerDay > 0.02 ? "improving" : averageDeltaPerDay < -0.02 ? "declining" : "stable";

  return {
    signalCount: inWindow.length,
    totalDelta: Number(totalDelta.toFixed(4)),
    averageDeltaPerDay,
    trend,
  };
}
