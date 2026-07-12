/** WO-18: SkillCompanionService with RAG context retrieval */
import { z } from "zod";
import { evaluateGuard, type EntityContext, type RequestKind } from "@rarecrest/skill-companion";
import type { VectorStoreClient } from "@rarecrest/vector-store";
import type { ModelRouter } from "./model-router.js";

export const structuredResponseSchema = z.object({
  summary: z.string().min(1),
  recommendations: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  sources: z.array(z.string()),
});

export type StructuredResponse = z.infer<typeof structuredResponseSchema>;

export interface SkillQuery {
  entityId: string;
  vertical: string;
  question: string;
  context?: string[];
  requestKind?: RequestKind;
  entityContext?: EntityContext | null;
  /** Optional embedding vector for framework-canon retrieval */
  queryVector?: number[];
}

export class SkillCompanionService {
  constructor(
    private router: ModelRouter,
    private vectorStore?: VectorStoreClient,
  ) {}

  async retrieveContext(query: SkillQuery): Promise<string[]> {
    const base = query.context ?? [];
    if (!this.vectorStore || !query.queryVector?.length) {
      return base;
    }
    const hits = await this.vectorStore.search(query.queryVector, 3);
    const retrieved = hits
      .map((hit) => String(hit.payload.summary ?? hit.payload.title ?? hit.id))
      .filter(Boolean);
    return [...base, ...retrieved];
  }

  async *stream(query: SkillQuery): AsyncGenerator<string> {
    const context = await this.retrieveContext(query);
    const prompt = this.buildPrompt({ ...query, context });
    const response = await this.router.route({ prompt, maxTokens: 1024 });
    const chunks = response.content.match(/.{1,20}/g) ?? [response.content];
    for (const chunk of chunks) {
      yield chunk;
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  async complete(query: SkillQuery): Promise<StructuredResponse & { guard?: ReturnType<typeof evaluateGuard> }> {
    const guard = evaluateGuard(query.requestKind ?? "substantive", query.entityContext ?? null);
    if (!guard.allowed) {
      return {
        summary: guard.reason ?? "Request blocked by FramingRuleGuard",
        recommendations: guard.redirectTo ? [`Redirect: ${guard.redirectTo}`] : [],
        confidence: 1,
        sources: ["framing-rule-guard"],
        guard,
      };
    }
    const context = await this.retrieveContext(query);
    const prompt = this.buildPrompt({ ...query, context });
    const response = await this.router.route({ prompt, maxTokens: 1024 });

    const candidate: StructuredResponse = {
      summary: response.content.slice(0, 500),
      recommendations: context.length
        ? context.slice(0, 2).map((c) => `Review: ${c}`)
        : ["Review governance pillar maturity", "Complete readiness assessment"],
      confidence: context.length ? 0.9 : 0.85,
      sources: context.length ? context : ["framework-canon"],
    };

    return { ...structuredResponseSchema.parse(candidate), guard };
  }

  evaluateGuard(kind: RequestKind, context: EntityContext | null) {
    return evaluateGuard(kind, context);
  }

  private buildPrompt(query: SkillQuery & { context?: string[] }): string {
    const ctx = (query.context ?? []).join("\n");
    return `Vertical: ${query.vertical}\nEntity: ${query.entityId}\nContext:\n${ctx}\nQuestion: ${query.question}`;
  }
}
