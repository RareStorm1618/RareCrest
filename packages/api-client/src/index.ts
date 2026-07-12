/** WO-20: Shared API client layer for web and mobile */
import type {
  EntityState,
  HardRuleCheckRequest,
  HardRuleVerdict,
  PortfolioRollup,
  ValidationErrorResponse,
} from "@rarecrest/contracts";

export interface ApiClientConfig {
  baseUrl: string;
  getHeaders: () => Record<string, string>;
}

export class RareCrestApiClient {
  constructor(private config: ApiClientConfig) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.config.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...this.config.getHeaders(),
        ...init?.headers,
      },
    });
    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as ValidationErrorResponse;
      throw new ApiClientError(response.status, err.message ?? "Request failed", err.errors);
    }
    return (await response.json()) as T;
  }

  async health(): Promise<{ status: string }> {
    return this.request("/health");
  }

  async listEntities(): Promise<EntityState[]> {
    return this.request("/api/v1/entities");
  }

  async createEntity(body: {
    name: string;
    vertical: string;
    tenancyKey: string;
    mode?: string;
    band?: string;
  }): Promise<EntityState> {
    return this.request("/api/v1/entities", { method: "POST", body: JSON.stringify(body) });
  }

  async checkHardRules(request: HardRuleCheckRequest): Promise<HardRuleVerdict> {
    return this.request("/api/v1/governance/hard-rule-check", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  async getPortfolioStatus(): Promise<PortfolioRollup> {
    return this.request("/api/v1/portfolio/status");
  }

  async registerEntity(body: {
    name: string;
    vertical: string;
    tenancyKey: string;
    entityType: string;
    isHoldingEntity?: boolean;
  }): Promise<EntityState> {
    return this.request("/api/v1/portfolio/entities", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async getEntityDetail(id: string): Promise<EntityState & { attentionFlags: unknown[]; relationships: unknown[] }> {
    return this.request(`/api/v1/portfolio/entities/${id}`);
  }
}

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly fieldErrors?: Array<{ field: string; code: string; message: string }>,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}
