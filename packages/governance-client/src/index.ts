import type { HardRuleCheckRequest, HardRuleVerdict, ActivationRequest, ActivationVerdict } from "@rarecrest/contracts";

export interface GovernanceClientConfig {
  baseUrl: string;
  timeoutMs?: number;
  /** Shared secret for internal RPC. Sent as x-internal-service-token when set. */
  internalServiceToken?: string;
}

export class GovernanceClient {
  private baseUrl: string;
  private timeoutMs: number;
  private internalServiceToken?: string;

  constructor(config: GovernanceClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.timeoutMs = config.timeoutMs ?? 5000;
    this.internalServiceToken = config.internalServiceToken;
  }

  async checkHardRules(request: HardRuleCheckRequest): Promise<HardRuleVerdict> {
    return this.postJson("/rpc/hard-rule-check", request);
  }

  async evaluateActivation(request: ActivationRequest): Promise<ActivationVerdict> {
    return this.postJson("/rpc/runtime/activate", request);
  }

  async armKillSwitch(request: {
    entityId: string;
    actorId: string;
    reason: string;
  }): Promise<Record<string, unknown>> {
    return this.postJson("/rpc/kill-switch/arm", request);
  }

  async triggerKillSwitch(request: {
    entityId: string;
    actorId: string;
    reason: string;
  }): Promise<Record<string, unknown>> {
    return this.postJson("/rpc/kill-switch/trigger", request);
  }

  async disarmKillSwitch(request: {
    entityId: string;
    actorId: string;
    reason: string;
  }): Promise<Record<string, unknown>> {
    return this.postJson("/rpc/kill-switch/disarm", request);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (this.internalServiceToken) {
        headers["x-internal-service-token"] = this.internalServiceToken;
      }
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new GovernanceRpcError(`Governance RPC failed: ${response.status}`, response.status);
      }
      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
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
