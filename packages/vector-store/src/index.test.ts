import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { VectorStoreClient } from "./index.js";

describe("VectorStoreClient (WO-5)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates collection when missing", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const client = new VectorStoreClient({ url: "http://localhost:6333", collection: "framework-canon" });
    await client.ensureCollection(384);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("maps search results", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          result: [{ id: "doc-1", score: 0.92, payload: { title: "Canon" } }],
        }),
        { status: 200 },
      ),
    );
    const client = new VectorStoreClient({ url: "http://localhost:6333", collection: "framework-canon" });
    const hits = await client.search([0.1, 0.2, 0.3]);
    expect(hits).toEqual([{ id: "doc-1", score: 0.92, payload: { title: "Canon" } }]);
  });

  it("returns empty array when search fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 500 }));
    const client = new VectorStoreClient({ url: "http://localhost:6333", collection: "framework-canon" });
    await expect(client.search([0.1])).resolves.toEqual([]);
  });
});
