/** JSON Canvas 1.0 minimal export (kepano-compatible). */
export interface CanvasNode {
  id: string;
  type: "text" | "file" | "group";
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  file?: string;
  label?: string;
}

export interface CanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
  label?: string;
}

export function buildJsonCanvas(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  return { nodes, edges };
}

export function pagesToCanvas(
  pages: Array<{ id: string; slug: string; title: string }>,
  links: Array<{ fromId: string; toSlug: string }>,
): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  const nodes: CanvasNode[] = pages.map((p, i) => ({
    id: p.id,
    type: "text",
    x: (i % 6) * 280,
    y: Math.floor(i / 6) * 160,
    width: 240,
    height: 100,
    text: `[[${p.title}]]\n${p.slug}`,
  }));
  const slugToId = new Map(pages.map((p) => [p.slug, p.id]));
  const edges: CanvasEdge[] = [];
  let e = 0;
  for (const link of links) {
    const toId = slugToId.get(link.toSlug);
    if (!toId) continue;
    edges.push({ id: `e${e++}`, fromNode: link.fromId, toNode: toId });
  }
  return buildJsonCanvas(nodes, edges);
}

/** Obsidian Bases-like YAML view definition. */
export function buildBasesView(opts: {
  name: string;
  filters?: string[];
  formulas?: Record<string, string>;
}): string {
  const filters = (opts.filters ?? []).map((f) => `  - ${f}`).join("\n");
  const formulas = Object.entries(opts.formulas ?? {})
    .map(([k, v]) => `  ${k}: ${v}`)
    .join("\n");
  return `name: ${opts.name}\nfilters:\n${filters || "  []"}\nformulas:\n${formulas || "  {}"}\n`;
}

/** Defuddle-lite: strip scripts/styles/nav chrome from HTML → markdown-ish text. */
export function defuddleHtml(html: string): string {
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "");
  text = text.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level, inner) => {
    const hashes = "#".repeat(Number(level));
    return `\n${hashes} ${inner.replace(/<[^>]+>/g, "").trim()}\n`;
  });
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, inner) => `- ${inner.replace(/<[^>]+>/g, "").trim()}\n`);
  text = text.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, inner) => `\n${inner.replace(/<[^>]+>/g, "").trim()}\n`);
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<[^>]+>/g, "");
  text = text.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

/** 10-principle thinking loop scaffold (AgriciDaniel /think). */
export const THINKING_PRINCIPLES = [
  "Clarify the goal and non-goals",
  "List constraints (tenancy, PHI, financial, legal)",
  "Enumerate options with failure modes",
  "Seek contradictory evidence",
  "Identify second-order effects across verticals",
  "Assign ownership and dual-control needs",
  "Define measurable success criteria",
  "Specify kill-switch / rollback",
  "Write the decision into the wiki",
  "Schedule a lint/review of related pages",
] as const;

export function renderThinkingSession(topic: string, notes: string[]): string {
  const steps = THINKING_PRINCIPLES.map((p, i) => `## ${i + 1}. ${p}\n\n${notes[i] ?? "_pending_"}\n`).join("\n");
  return `# Thinking Session: ${topic}\n\n${steps}\n`;
}
