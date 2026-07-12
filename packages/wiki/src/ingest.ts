import { createHash } from "node:crypto";
import { extractSections } from "./markdown.js";
import { slugify, type WikiSensitivity } from "./charter.js";
import { scrubSecretsAndPhi } from "./scrub.js";

export interface IngestCompileInput {
  title: string;
  body: string;
  sourceKind: string;
  sensitivity: WikiSensitivity;
  phiBlind: boolean;
  /** When set, used as content_hash (e.g. stable decision-trace id hash). */
  contentHashOverride?: string;
}

export interface CompiledWikiPage {
  slug: string;
  title: string;
  pageType: "source" | "entity" | "concept" | "decision";
  body: string;
  frontmatter: Record<string, unknown>;
  sensitivity: WikiSensitivity;
}

/**
 * Deterministic compile step (Tier-B + heuristics).
 * Intelligence/LLM can enrich later; this always produces a valid wiki seed.
 */
export function compileIngest(input: IngestCompileInput): {
  contentHash: string;
  pages: CompiledWikiPage[];
  summary: string;
} {
  let body = input.body;
  let sensitivity = input.sensitivity;

  // Always scrub secrets; escalate care charters to phi_ref
  {
    const scrubbed = scrubSecretsAndPhi(body);
    body = scrubbed.text;
  }
  if (input.phiBlind || sensitivity === "phi_ref") {
    sensitivity = "phi_ref";
  }

  const contentHash =
    input.contentHashOverride ?? createHash("sha256").update(`${input.title}\n${body}`).digest("hex");
  const sourceSlug = slugify(`source-${input.title}`);
  const sections = extractSections(body);
  const primaryType: CompiledWikiPage["pageType"] =
    input.sourceKind === "decision_trace" ? "decision" : "source";
  const pages: CompiledWikiPage[] = [
    {
      slug: sourceSlug,
      title: input.title,
      pageType: primaryType,
      body: `# ${input.title}\n\n${body}\n\n## Sections\n\n${sections.map((s) => `- [[${s.heading}]]`).join("\n")}\n`,
      frontmatter: {
        tags: [primaryType === "decision" ? "decision" : "source", input.sourceKind],
        sourceKind: input.sourceKind,
        sensitivity,
      },
      sensitivity,
    },
  ];

  // Concept pages from H2 headings (skip for decision_trace — payload JSON is not concepts)
  if (input.sourceKind !== "decision_trace") {
    for (const section of sections.filter((s) => s.heading !== "preamble").slice(0, 8)) {
      const conceptSlug = slugify(section.heading);
      pages.push({
        slug: conceptSlug,
        title: section.heading,
        pageType: "concept",
        body: `# ${section.heading}\n\n${section.content.trim()}\n\nSee also: [[${input.title}]]\n`,
        frontmatter: { tags: ["concept"], sourcedFrom: sourceSlug },
        sensitivity,
      });
    }
  }

  // Entity heuristic: lines like "Entity: Name" or "**Name** (org)"
  if (input.sourceKind !== "decision_trace") {
    const entityMatches = body.match(/(?:Entity|Organization|Company|Person):\s*(.+)/gi) ?? [];
    for (const line of entityMatches.slice(0, 5)) {
      const name = line.split(":").slice(1).join(":").trim();
      if (!name) continue;
      pages.push({
        slug: slugify(name),
        title: name,
        pageType: "entity",
        body: `# ${name}\n\nMentioned in [[${input.title}]].\n`,
        frontmatter: { tags: ["entity"], sourcedFrom: sourceSlug },
        sensitivity,
      });
    }
  }

  const summary = `Compiled ${pages.length} pages from '${input.title}' (${sensitivity})`;
  return { contentHash, pages, summary };
}

/** Simple BM25-ish lexical score for hybrid retrieval Tier-2. */
export function lexicalScore(query: string, text: string): number {
  const terms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
  if (terms.length === 0) return 0;
  const hay = text.toLowerCase();
  let score = 0;
  for (const t of terms) {
    const re = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
    const matches = hay.match(re);
    if (matches) score += matches.length;
  }
  return score / terms.length;
}

/** Deterministic bag-of-tokens embedding for optional Qdrant hybrid (no external model). */
export function bagEmbedding(text: string, dim = 384): number[] {
  const v = new Array<number>(dim).fill(0);
  for (const token of text.toLowerCase().split(/\W+/).filter((t) => t.length > 1)) {
    let h = 2166136261;
    for (let i = 0; i < token.length; i++) h = Math.imul(h ^ token.charCodeAt(i), 16777619);
    v[Math.abs(h) % dim] += 1;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

export function hybridRank(
  query: string,
  pages: Array<{
    id: string;
    slug: string;
    title: string;
    body: string;
    graphScore?: number;
    vectorScore?: number;
  }>,
  limit = 10,
): Array<{ id: string; slug: string; title: string; score: number }> {
  return pages
    .map((p) => {
      const lex = lexicalScore(query, `${p.title}\n${p.body}`);
      const graph = p.graphScore ?? 0;
      const vector = p.vectorScore ?? 0;
      // BM25-ish + PageRank + optional vector (weights sum to 1)
      const score = vector > 0 ? lex * 0.4 + graph * 0.35 + vector * 0.25 : lex * 0.55 + graph * 0.45;
      return { id: p.id, slug: p.slug, title: p.title, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
