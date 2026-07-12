/** WO-8: Internal RPC client for Intelligence Services */
import type { DecisionTraceEntry } from "@rarecrest/contracts";

export interface IntelligenceClientConfig {
  baseUrl: string;
  timeoutMs?: number;
}

export class IntelligenceClient {
  private baseUrl: string;
  private timeoutMs: number;

  constructor(config: IntelligenceClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.timeoutMs = config.timeoutMs ?? 10000;
  }

  async appendTrace(input: {
    entityId?: string;
    vertical: string;
    action: string;
    verdict: "allow" | "deny";
    payload: Record<string, unknown>;
    retentionRegime?: string;
  }): Promise<DecisionTraceEntry> {
    return this.post("/rpc/decision-trace/append", input);
  }

  async score(input: {
    entityId: string;
    vertical: string;
    dimensions: Array<{ name: string; value: number; weight: number }>;
  }): Promise<Record<string, unknown>> {
    return this.post("/rpc/score", input);
  }

  async skillCompanionComplete(input: {
    entityId: string;
    vertical: string;
    question: string;
    context?: string[];
    requestKind?: string;
    entityContext?: Record<string, unknown> | null;
  }): Promise<Record<string, unknown>> {
    return this.post("/rpc/skill-companion/complete", input);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const r = await fetch(`${this.baseUrl}/health`);
      return r.ok;
    } catch {
      return false;
    }
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Intelligence RPC failed: ${response.status}`);
      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}
