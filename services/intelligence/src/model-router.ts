/** WO-15: Provider-agnostic ModelRouter with failover */

export interface ModelProvider {
  id: string;
  name: string;
  endpoint: string;
  priority: number;
  enabled: boolean;
}

export interface ModelRoutingPolicy {
  providers: ModelProvider[];
  failoverEnabled: boolean;
}

export interface ModelRequest {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ModelResponse {
  providerId: string;
  content: string;
  tokensUsed: number;
}

export type ProviderCaller = (
  provider: ModelProvider,
  request: ModelRequest,
) => Promise<ModelResponse>;

export class ModelRouter {
  private policy: ModelRoutingPolicy;

  constructor(
    policy: ModelRoutingPolicy,
    private caller?: ProviderCaller,
  ) {
    this.policy = policy;
  }

  getActiveProviders(): ModelProvider[] {
    return [...this.policy.providers]
      .filter((p) => p.enabled)
      .sort((a, b) => a.priority - b.priority);
  }

  async route(request: ModelRequest): Promise<ModelResponse> {
    const providers = this.getActiveProviders();
    if (providers.length === 0) {
      throw new ModelRouterError("No enabled model providers configured");
    }

    const errors: Error[] = [];
    for (const provider of providers) {
      try {
        return await this.callProvider(provider, request);
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)));
        if (!this.policy.failoverEnabled) break;
      }
    }

    throw new ModelRouterError(
      `All providers failed: ${errors.map((e) => e.message).join("; ")}`,
    );
  }

  private async callProvider(
    provider: ModelProvider,
    request: ModelRequest,
  ): Promise<ModelResponse> {
    if (this.caller) {
      return this.caller(provider, request);
    }
    const content = `[${provider.name}] response to: ${request.prompt.slice(0, 100)}`;
    return {
      providerId: provider.id,
      content,
      tokensUsed: Math.ceil(content.length / 4),
    };
  }

  updatePolicy(policy: ModelRoutingPolicy): void {
    this.policy = policy;
  }
}

export class ModelRouterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelRouterError";
  }
}
