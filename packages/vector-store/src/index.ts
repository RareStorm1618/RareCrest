/** WO-5: Vector store client (Qdrant) for framework-canon embeddings */

export interface VectorStoreConfig {
  url: string;
  collection: string;
}

export interface VectorPoint {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
}

export interface SearchResult {
  id: string;
  score: number;
  payload: Record<string, unknown>;
}

export class VectorStoreClient {
  constructor(private config: VectorStoreConfig) {}

  async ensureCollection(vectorSize = 384): Promise<void> {
    const url = `${this.config.url}/collections/${this.config.collection}`;
    const check = await fetch(url);
    if (check.ok) return;

    await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vectors: { size: vectorSize, distance: "Cosine" },
      }),
    });
  }

  async upsert(points: VectorPoint[]): Promise<void> {
    await this.ensureCollection();
    await fetch(`${this.config.url}/collections/${this.config.collection}/points`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points }),
    });
  }

  async search(vector: number[], limit = 5): Promise<SearchResult[]> {
    const response = await fetch(
      `${this.config.url}/collections/${this.config.collection}/points/search`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vector, limit, with_payload: true }),
      },
    );
    if (!response.ok) return [];
    const data = (await response.json()) as { result: Array<{ id: string; score: number; payload: Record<string, unknown> }> };
    return data.result.map((r) => ({ id: String(r.id), score: r.score, payload: r.payload }));
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.url}/healthz`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

export function createVectorStoreFromEnv(): VectorStoreClient {
  return new VectorStoreClient({
    url: process.env.VECTOR_STORE_URL ?? "http://localhost:6333",
    collection: process.env.VECTOR_STORE_COLLECTION ?? "framework-canon",
  });
}
