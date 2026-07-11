import { describe, it, expect } from "vitest";
import { ModelRouter } from "./model-router.js";

describe("ModelRouter", () => {
  it("routes to first available provider", async () => {
    const router = new ModelRouter({
      providers: [
        { id: "a", name: "A", endpoint: "http://a", priority: 1, enabled: true },
        { id: "b", name: "B", endpoint: "http://b", priority: 2, enabled: true },
      ],
      failoverEnabled: true,
    });
    const result = await router.route({ prompt: "test" });
    expect(result.providerId).toBe("a");
  });

  it("fails when no providers enabled", async () => {
    const router = new ModelRouter({
      providers: [{ id: "a", name: "A", endpoint: "http://a", priority: 1, enabled: false }],
      failoverEnabled: true,
    });
    await expect(router.route({ prompt: "test" })).rejects.toThrow("No enabled model providers");
  });
});
