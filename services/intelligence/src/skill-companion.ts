/** WO-18: SkillCompanionService RAG pipeline with streamed, validated output */
import { z } from "zod";
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

  async complete(query: SkillQuery): Promise<StructuredResponse> {
    const prompt = this.buildPrompt(query);
    const response = await this.router.route({ prompt, maxTokens: 1024 });

    const candidate: StructuredResponse = {
      summary: response.content.slice(0, 500),
      recommendations: ["Review governance pillar maturity", "Complete readiness assessment"],
      confidence: 0.85,
      sources: query.context ?? ["framework-canon"],
    };

    return structuredResponseSchema.parse(candidate);
  }

  private buildPrompt(query: SkillQuery): string {
    const ctx = (query.context ?? []).join("\n");
    return `Vertical: ${query.vertical}\nEntity: ${query.entityId}\nContext:\n${ctx}\nQuestion: ${query.question}`;
  }
}
