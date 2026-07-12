export interface MvisSignal {
  name: string;
  weight: number;
  score: number;
}

export interface MvisResult {
  score: number;
  status: "green" | "yellow" | "red";
  gaps: string[];
}

export function evaluateMvis(signals: MvisSignal[]): MvisResult {
  const weightedTotal = signals.reduce((sum, signal) => sum + signal.weight * signal.score, 0);
  const maxPossible = signals.reduce((sum, signal) => sum + signal.weight * 10, 0);
  const normalized = maxPossible === 0 ? 0 : Number(((weightedTotal / maxPossible) * 100).toFixed(2));
  const status: MvisResult["status"] = normalized >= 75 ? "green" : normalized >= 55 ? "yellow" : "red";
  const gaps = signals.filter((signal) => signal.score < 6).map((signal) => signal.name);
  return { score: normalized, status, gaps };
}
