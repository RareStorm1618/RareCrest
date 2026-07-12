/** WO-18 + WO-37: SkillCompanionService with FramingRuleGuard */
import { z } from "zod";
import { evaluateGuard, type EntityContext, type RequestKind } from "@rarecrest/skill-companion";
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
}

export class SkillCompanionService {
  constructor(private router: ModelRouter) {}

  async *stream(query: SkillQuery): AsyncGenerator<string> {
    const prompt = this.buildPrompt(query);
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
    const prompt = this.buildPrompt(query);
    const response = await this.router.route({ prompt, maxTokens: 1024 });

    const candidate: StructuredResponse = {
      summary: response.content.slice(0, 500),
      recommendations: ["Review governance pillar maturity", "Complete readiness assessment"],
      confidence: 0.85,
      sources: query.context ?? ["framework-canon"],
    };

    return { ...structuredResponseSchema.parse(candidate), guard };
  }

  evaluateGuard(kind: RequestKind, context: EntityContext | null) {
    return evaluateGuard(kind, context);
  }

  private buildPrompt(query: SkillQuery): string {
    const ctx = (query.context ?? []).join("\n");
    return `Vertical: ${query.vertical}\nEntity: ${query.entityId}\nContext:\n${ctx}\nQuestion: ${query.question}`;
  }
}
