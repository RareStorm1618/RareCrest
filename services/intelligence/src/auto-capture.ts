/** WO-67: Automatic evidence capture scoring */

export interface AutoCaptureInput {
  entityId: string;
  vertical: string;
  source: string;
  signalType: "policy_violation" | "accuracy_drop" | "override_spike" | "new_regulation" | "operator_note";
  confidence: number;
  payload: Record<string, unknown>;
}

export interface AutoCaptureResult {
  accepted: boolean;
  score: number;
  reason: string;
  dedupeKey: string;
  captureKind: "critical_alert" | "compliance_event" | "quality_signal" | "operator_context";
}

const SIGNAL_BASE_SCORE: Record<AutoCaptureInput["signalType"], number> = {
  policy_violation: 0.95,
  accuracy_drop: 0.75,
  override_spike: 0.7,
  new_regulation: 0.8,
  operator_note: 0.4,
};

const CAPTURE_KIND: Record<AutoCaptureInput["signalType"], AutoCaptureResult["captureKind"]> = {
  policy_violation: "critical_alert",
  accuracy_drop: "quality_signal",
  override_spike: "quality_signal",
  new_regulation: "compliance_event",
  operator_note: "operator_context",
};

export class AutoCaptureService {
  private recentKeys = new Map<string, number>();

  constructor(
    private options: {
      minScore?: number;
      dedupeWindowMs?: number;
      now?: () => number;
    } = {},
  ) {}

  evaluate(input: AutoCaptureInput): AutoCaptureResult {
    const now = this.options.now?.() ?? Date.now();
    const minScore = this.options.minScore ?? 0.68;
    const dedupeWindowMs = this.options.dedupeWindowMs ?? 5 * 60 * 1000;
    const base = SIGNAL_BASE_SCORE[input.signalType];
    const score = Number((base * 0.7 + input.confidence * 0.3).toFixed(4));
    const dedupeKey = `${input.entityId}:${input.signalType}:${input.source}`;
    const previous = this.recentKeys.get(dedupeKey);

    if (previous && now - previous < dedupeWindowMs) {
      return {
        accepted: false,
        score,
        reason: "duplicate_window",
        dedupeKey,
        captureKind: CAPTURE_KIND[input.signalType],
      };
    }

    if (score < minScore) {
      return {
        accepted: false,
        score,
        reason: "below_threshold",
        dedupeKey,
        captureKind: CAPTURE_KIND[input.signalType],
      };
    }

    this.recentKeys.set(dedupeKey, now);
    this.gc(now, dedupeWindowMs);
    return {
      accepted: true,
      score,
      reason: "accepted",
      dedupeKey,
      captureKind: CAPTURE_KIND[input.signalType],
    };
  }

  private gc(now: number, windowMs: number): void {
    for (const [key, ts] of this.recentKeys.entries()) {
      if (now - ts > windowMs) this.recentKeys.delete(key);
    }
  }
}
