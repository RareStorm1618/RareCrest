/** Mobile director API — thin fetch wrappers over Command / Parliament / Kill-switch. */

export interface AttentionQueueItem {
  id: string;
  entityId: string;
  entityName?: string;
  signalType: string;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  createdAt: string;
  kind: "decision" | "awareness";
  linkPath?: string | null;
}

export interface GovernanceQueueSession {
  id: string;
  entityId: string;
  entityName: string;
  topic: string;
  stakeClass: string;
  status: string;
  createdAt: string;
}

export interface GovernanceQueueSealDue {
  id: string;
  sessionId: string;
  entityId: string;
  entityName: string;
  executeAfter: string;
}

export interface GovernanceQueue {
  openSessions: GovernanceQueueSession[];
  readyForSeal: GovernanceQueueSession[];
  sealsDue: GovernanceQueueSealDue[];
}

export interface DirectorDashboard {
  queue: AttentionQueueItem[];
  portfolioClear: boolean;
  governanceQueue: GovernanceQueue;
}

export interface KillSwitchState {
  entityId: string;
  state: string;
  armedBy?: string | null;
  triggeredBy?: string | null;
  armedReason?: string | null;
  triggeredReason?: string | null;
  updatedAt?: string;
}

export interface DirectorApiConfig {
  baseUrl: string;
  headers: Record<string, string>;
  fetchImpl?: typeof fetch;
}

export class DirectorApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "DirectorApiError";
  }
}

/** financial_release always cools off; other stake classes seal immediately on mobile. */
export function defaultSealMode(stakeClass: string): "immediate" | "time_lock" {
  return stakeClass === "financial_release" ? "time_lock" : "immediate";
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string };
    return body.message ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export function createDirectorApi(config: DirectorApiConfig) {
  const fetchFn = config.fetchImpl ?? fetch;
  const jsonHeaders = {
    "Content-Type": "application/json",
    ...config.headers,
  };

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetchFn(`${config.baseUrl}${path}`, {
      ...init,
      headers: { ...jsonHeaders, ...init?.headers },
    });
    if (!res.ok) throw new DirectorApiError(res.status, await parseError(res));
    return (await res.json()) as T;
  }

  return {
    async loadDashboard(): Promise<DirectorDashboard> {
      const data = await request<{
        queue?: AttentionQueueItem[];
        portfolioClear?: boolean;
        governanceQueue?: GovernanceQueue;
      }>("/api/v1/command/dashboard");
      return {
        queue: data.queue ?? [],
        portfolioClear: data.portfolioClear ?? true,
        governanceQueue: data.governanceQueue ?? {
          openSessions: [],
          readyForSeal: [],
          sealsDue: [],
        },
      };
    },

    async resolveAttention(entityId: string, flagId: string): Promise<void> {
      await request(`/api/v1/entities/${entityId}/attention-flags/${flagId}/resolve`, {
        method: "POST",
        body: "{}",
      });
    },

    async sealParliament(
      sessionId: string,
      stakeClass: string,
      opts: { effectDigest?: string } = {},
    ): Promise<unknown> {
      const mode = defaultSealMode(stakeClass);
      return request(`/api/v1/parliament/${sessionId}/seal`, {
        method: "POST",
        body: JSON.stringify({
          mode,
          payload: { source: "mobile_director" },
          effectDigest: opts.effectDigest ?? `mobile-seal:${sessionId}:${Date.now()}`,
        }),
      });
    },

    async getKillSwitch(entityId: string): Promise<KillSwitchState> {
      return request(`/api/v1/runtime/kill-switch/${entityId}`);
    },

    async armKillSwitch(entityId: string, reason: string): Promise<KillSwitchState> {
      return request(`/api/v1/runtime/kill-switch/${entityId}/arm`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
    },

    async triggerKillSwitch(entityId: string, reason: string): Promise<unknown> {
      return request(`/api/v1/runtime/kill-switch/${entityId}/trigger`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
    },

    async disarmKillSwitch(entityId: string, reason: string): Promise<KillSwitchState> {
      return request(`/api/v1/runtime/kill-switch/${entityId}/disarm`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
    },
  };
}

export type DirectorApi = ReturnType<typeof createDirectorApi>;
