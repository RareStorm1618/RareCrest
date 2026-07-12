/**
 * Personalized PageRank over a wikilink graph (green-dalii / KarpathyWiki Tier A).
 * Zero embedding cost — retrieval from link structure alone.
 */

export interface GraphNode {
  id: string;
  slug: string;
  title: string;
}

export interface GraphEdge {
  fromId: string;
  toSlug: string;
  toId?: string | null;
}

export function buildAdjacency(
  nodes: GraphNode[],
  edges: GraphEdge[],
): Map<string, string[]> {
  const slugToId = new Map(nodes.map((n) => [n.slug, n.id]));
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    const toId = e.toId ?? slugToId.get(e.toSlug);
    if (!toId || !adj.has(e.fromId)) continue;
    // Directed wikilink edges — Personalized PageRank seeds stay authoritative.
    adj.get(e.fromId)!.push(toId);
  }
  return adj;
}

export function personalizedPageRank(
  adj: Map<string, string[]>,
  seedIds: string[],
  opts: { damping?: number; iterations?: number } = {},
): Map<string, number> {
  const damping = opts.damping ?? 0.85;
  const iterations = opts.iterations ?? 30;
  const nodes = [...adj.keys()];
  if (nodes.length === 0) return new Map();

  const seedSet = new Set(seedIds.filter((id) => adj.has(id)));
  if (seedSet.size === 0) {
    // Uniform if no valid seeds
    const u = 1 / nodes.length;
    return new Map(nodes.map((id) => [id, u]));
  }

  let scores = new Map<string, number>();
  const seedMass = 1 / seedSet.size;
  for (const id of nodes) scores.set(id, seedSet.has(id) ? seedMass : 0);

  for (let i = 0; i < iterations; i++) {
    const next = new Map<string, number>();
    for (const id of nodes) next.set(id, (1 - damping) * (seedSet.has(id) ? seedMass : 0));
    for (const [id, neighbors] of adj) {
      const score = scores.get(id) ?? 0;
      if (neighbors.length === 0) {
        // Distribute to seeds
        for (const s of seedSet) next.set(s, (next.get(s) ?? 0) + damping * score * seedMass);
        continue;
      }
      const share = (damping * score) / neighbors.length;
      for (const n of neighbors) next.set(n, (next.get(n) ?? 0) + share);
    }
    scores = next;
  }
  return scores;
}

export function rankPages(
  nodes: GraphNode[],
  edges: GraphEdge[],
  querySeeds: string[],
  limit = 10,
): Array<GraphNode & { score: number }> {
  const adj = buildAdjacency(nodes, edges);
  const seedIds = nodes.filter((n) => querySeeds.includes(n.id) || querySeeds.includes(n.slug)).map((n) => n.id);
  // Also seed by title/slug token overlap
  const q = querySeeds.join(" ").toLowerCase();
  for (const n of nodes) {
    if (q && (n.title.toLowerCase().includes(q) || n.slug.includes(q.replace(/\s+/g, "-")))) {
      seedIds.push(n.id);
    }
  }
  const scores = personalizedPageRank(adj, [...new Set(seedIds)]);
  return nodes
    .map((n) => ({ ...n, score: scores.get(n.id) ?? 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function analyseGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
): {
  nodeCount: number;
  edgeCount: number;
  orphans: string[];
  hubs: Array<{ slug: string; degree: number }>;
} {
  const adj = buildAdjacency(nodes, edges);
  const degree = new Map<string, number>();
  for (const [id, ns] of adj) degree.set(id, new Set(ns).size);
  const idToSlug = new Map(nodes.map((n) => [n.id, n.slug]));
  const orphans = nodes.filter((n) => (degree.get(n.id) ?? 0) === 0).map((n) => n.slug);
  const hubs = [...degree.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, d]) => ({ slug: idToSlug.get(id) ?? id, degree: d }));
  return { nodeCount: nodes.length, edgeCount: edges.length, orphans, hubs };
}
