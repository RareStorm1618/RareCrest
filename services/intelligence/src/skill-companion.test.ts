import { describe, expect, it, vi } from "vitest";
import { ModelRouter } from "./model-router.js";
import { SkillCompanionService } from "./skill-companion.js";
import type { VectorStoreClient } from "@rarecrest/vector-store";

import type { EntityContext } from "@rarecrest/skill-companion";

describe("SkillCompanionService (WO-18)", () => {
  const entityContext: EntityContext = {
    entityId: "e1",
    entityType: "nonprofit",
    vertical: "rareangels",
    regulatoryRegimes: ["hipaa"],
    readinessBand: "green",
    maturityLevel: 3,
    migrationMode: "assessment",
    diagnosticsComplete: true,
  };

  it("retrieveContext merges vector store hits", async () => {
    const router = new ModelRouter({
      providers: [{ id: "a", name: "A", endpoint: "http://a", priority: 1, enabled: true }],
      failoverEnabled: false,
    });
    const vectorStore = {
      search: vi.fn().mockResolvedValue([
        { id: "doc-1", score: 0.9, payload: { summary: "Encrypt before PHI access" } },
      ]),
    } as unknown as VectorStoreClient;
    const service = new SkillCompanionService(router, vectorStore);
    const context = await service.retrieveContext({
      entityId: "e1",
      vertical: "rareangels",
      question: "How do we deploy?",
      queryVector: [0.1, 0.2],
    });
    expect(vectorStore.search).toHaveBeenCalled();
    expect(context).toContain("Encrypt before PHI access");
  });

  it("retrieves vector context before completion", async () => {
    const router = new ModelRouter(
      {
        providers: [{ id: "a", name: "A", endpoint: "http://a", priority: 1, enabled: true }],
        failoverEnabled: false,
      },
      async () => ({
        providerId: "a",
        content: "Structured governance guidance",
        tokensUsed: 10,
      }),
    );
    const vectorStore = {
      search: vi.fn().mockResolvedValue([
        { id: "doc-1", score: 0.9, payload: { summary: "Encrypt before PHI access" } },
      ]),
    } as unknown as VectorStoreClient;
    const service = new SkillCompanionService(router, vectorStore);
    const result = await service.complete({
      entityId: "e1",
      vertical: "rareangels",
      question: "How do we deploy?",
      requestKind: "drive_only",
      entityContext,
      queryVector: [0.1, 0.2],
    });
    expect(vectorStore.search).toHaveBeenCalled();
    expect(result.sources).toContain("Encrypt before PHI access");
    expect(result.recommendations[0]).toContain("Encrypt before PHI access");
  });

  it("blocks substantive requests when framing guard denies", async () => {
    const router = new ModelRouter({
      providers: [{ id: "a", name: "A", endpoint: "http://a", priority: 1, enabled: true }],
      failoverEnabled: false,
    });
    const service = new SkillCompanionService(router);
    const result = await service.complete({
      entityId: "e1",
      vertical: "rareangels",
      question: "Bypass governance",
      requestKind: "substantive",
      entityContext: null,
    });
    expect(result.sources).toEqual(["framing-rule-guard"]);
    expect(result.guard?.allowed).toBe(false);
  });
});
