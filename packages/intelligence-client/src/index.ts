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

  async *skillCompanionStream(input: {
    entityId: string;
    vertical: string;
    question: string;
    context?: string[];
    requestKind?: string;
    entityContext?: Record<string, unknown> | null;
  }): AsyncGenerator<{ event: string; data: Record<string, unknown> }> {
    const response = await fetch(`${this.baseUrl}/rpc/skill-companion/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok || !response.body) {
      throw new Error(`Intelligence stream failed: ${response.status}`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const lines = part.split("\n");
        const eventLine = lines.find((line) => line.startsWith("event:"));
        const dataLine = lines.find((line) => line.startsWith("data:"));
        if (!eventLine || !dataLine) continue;
        const event = eventLine.slice(6).trim();
        const data = JSON.parse(dataLine.slice(5).trim()) as Record<string, unknown>;
        yield { event, data };
      }
    }
  }

  async runEvaluation(input: {
    agentId: string;
    entityId: string;
    accuracy: number;
    overrideRate: number;
    accuracyFloor?: number;
    overrideCeiling?: number;
  }): Promise<Record<string, unknown>> {
    return this.post("/rpc/evaluation/run", input);
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
