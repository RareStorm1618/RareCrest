import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@rarecrest/db", () => ({
  DatabaseClient: vi.fn().mockImplementation(() => ({
    healthCheck: vi.fn().mockResolvedValue(true),
    close: vi.fn(),
  })),
}));

vi.mock("@rarecrest/governance-client", () => ({
  GovernanceClient: vi.fn().mockImplementation(() => ({
    healthCheck: vi.fn().mockResolvedValue(true),
  })),
}));

vi.mock("@rarecrest/intelligence-client", () => ({
  IntelligenceClient: vi.fn().mockImplementation(() => ({
    healthCheck: vi.fn().mockResolvedValue(true),
  })),
}));

describe("API bootstrap (WO-6)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("exposes health endpoint with dependency checks", async () => {
    const { buildApp } = await import("./index.js");
    const { app } = await buildApp();
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { status: string; checks: Record<string, boolean> };
    expect(body.status).toBe("ok");
    expect(body.checks.database).toBe(true);
    await app.close();
  });
});
