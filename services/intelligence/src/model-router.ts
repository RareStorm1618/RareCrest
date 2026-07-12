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
  /** When set, only providers whose id appears here are ever routable — an unlisted
   * provider is rejected even if `enabled: true`. Fail-closed allowlist, not a denylist. */
  allowlist?: string[];
}

const DEFAULT_PROVIDER_ALLOWLIST = ["primary", "fallback", "mock"];

/** Parse `MODEL_PROVIDERS` (comma-separated provider ids) into an allowlist.
 * Defaults to `primary,fallback,mock` when unset/blank. */
export function parseProviderAllowlist(raw: string | undefined): string[] {
  const value = raw?.trim();
  if (!value) return [...DEFAULT_PROVIDER_ALLOWLIST];
  const ids = value
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return ids.length > 0 ? ids : [...DEFAULT_PROVIDER_ALLOWLIST];
}

/** Parse `MODEL_PROVIDER_ENDPOINTS` (JSON map of provider id -> endpoint URL).
 * Malformed/non-object JSON fails closed to an empty map rather than throwing. */
export function parseProviderEndpoints(raw: string | undefined): Record<string, string> {
  if (!raw || !raw.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const endpoints: Record<string, string> = {};
    for (const [id, endpoint] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof endpoint === "string" && endpoint.length > 0) endpoints[id] = endpoint;
    }
    return endpoints;
  } catch {
    return {};
  }
}

/** Apply an id -> endpoint override map onto a provider list (unmatched providers unchanged). */
export function applyProviderEndpoints(
  providers: ModelProvider[],
  endpoints: Record<string, string>,
): ModelProvider[] {
  return providers.map((provider) =>
    endpoints[provider.id] ? { ...provider, endpoint: endpoints[provider.id] } : provider,
  );
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
    const allowlist = this.policy.allowlist;
    return [...this.policy.providers]
      .filter((p) => p.enabled && (!allowlist || allowlist.includes(p.id)))
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
    const httpEndpoint = process.env.LLM_HTTP_ENDPOINT;
    if (httpEndpoint) {
      return callLlmHttpEndpoint(httpEndpoint, provider, request);
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

/**
 * `LLM_HTTP_ENDPOINT` extension point: when set (and no explicit `ProviderCaller`
 * is wired), ModelRouter POSTs `{ prompt, provider, maxTokens?, temperature? }`
 * to this URL and treats the JSON `{ text }` (or `{ content }`) field, or a
 * plain-text body, as the model's response — replacing the deterministic stub
 * with a real backing model without any router/caller code changes. See
 * docs/TRUST.md and docs/SOLO-ORGANISM.md for the operational contract.
 */
export async function callLlmHttpEndpoint(
  endpoint: string,
  provider: ModelProvider,
  request: ModelRequest,
): Promise<ModelResponse> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: request.prompt,
      provider: provider.id,
      maxTokens: request.maxTokens,
      temperature: request.temperature,
    }),
  });
  if (!response.ok) {
    throw new ModelRouterError(`LLM_HTTP_ENDPOINT request failed: ${response.status} ${response.statusText}`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  let content: string;
  if (contentType.includes("application/json")) {
    const data = (await response.json()) as { text?: string; content?: string };
    content = data.text ?? data.content ?? "";
  } else {
    content = await response.text();
  }
  return {
    providerId: provider.id,
    content,
    tokensUsed: Math.ceil(content.length / 4),
  };
}
