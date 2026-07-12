import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ObjectStoreClient } from "./index.js";

describe("ObjectStoreClient (WO-5)", () => {
  const config = {
    endpoint: "http://localhost:9000",
    accessKey: "test-key",
    secretKey: "test-secret",
    bucket: "rarecrest-exports",
  };

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns stored object metadata on successful put", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 200 }));
    const client = new ObjectStoreClient(config);
    const body = Buffer.from("export-data");
    const stored = await client.putObject("reports/summary.pdf", body, "application/pdf");
    expect(stored.key).toBe("reports/summary.pdf");
    expect(stored.size).toBe(body.length);
    expect(stored.contentType).toBe("application/pdf");
  });

  it("throws when put fails in strict mode", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 500 }));
    const client = new ObjectStoreClient({ ...config, strictMode: true });
    await expect(
      client.putObject("reports/fail.pdf", Buffer.from("x"), "application/pdf"),
    ).rejects.toThrow("Object store put failed");
  });

  it("builds public object URL", async () => {
    const client = new ObjectStoreClient(config);
    expect(await client.getObjectUrl("a/b.json")).toBe(
      "http://localhost:9000/rarecrest-exports/a/b.json",
    );
  });
});
