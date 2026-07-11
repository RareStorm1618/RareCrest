import type { HardRuleCheckRequest, HardRuleVerdict } from "@rarecrest/contracts";

export interface GovernanceClientConfig {
  baseUrl: string;
  timeoutMs?: number;
}

export class GovernanceClient {
  private baseUrl: string;
  private timeoutMs: number;

  constructor(config: GovernanceClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.timeoutMs = config.timeoutMs ?? 5000;
  }

  async checkHardRules(request: HardRuleCheckRequest): Promise<HardRuleVerdict> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/rpc/hard-rule-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new GovernanceRpcError(`Governance RPC failed: ${response.status}`, response.status);
      }
      return (await response.json()) as HardRuleVerdict;
    } finally {
      clearTimeout(timeout);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

export class GovernanceRpcError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "GovernanceRpcError";
  }
}

export { GovernanceClient as default };
