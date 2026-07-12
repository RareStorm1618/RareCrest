import { describe, expect, it } from "vitest";
import { VERTICAL_CHARTERS, slugify, namespaceForVertical } from "./charter.js";
import { extractWikiLinks, extractSections, injectContradictionCallout } from "./markdown.js";
import { personalizedPageRank, buildAdjacency, rankPages, analyseGraph } from "./pagerank.js";
import { lintWiki } from "./lint.js";
import { compileIngest, hybridRank, lexicalScore, bagEmbedding } from "./ingest.js";
import { defuddleHtml, pagesToCanvas, renderThinkingSession, THINKING_PRINCIPLES } from "./export.js";

describe("charter", () => {
  it("marks care verticals as PHI-blind", () => {
    expect(VERTICAL_CHARTERS.healkids.phiBlind).toBe(true);
    expect(VERTICAL_CHARTERS.rareangels.phiBlind).toBe(true);
    expect(VERTICAL_CHARTERS.holding.mode).toBe("business");
    expect(namespaceForVertical("rarestorm")).toBe("vertical/rarestorm/wiki");
    expect(slugify("Hello World!")).toBe("hello-world");
  });
});

describe("markdown + lint", () => {
  it("extracts wikilinks and sections", () => {
    expect(extractWikiLinks("See [[Alpha]] and [[Beta|display]]")).toEqual(["Alpha", "Beta"]);
    expect(extractSections("# T\n\n## A\n\nx\n\n## B\n\ny").map((s) => s.heading)).toEqual([
      "T",
      "A",
      "B",
    ]);
  });

  it("lints dead links and orphans", () => {
    const { findings, score } = lintWiki([
      {
        id: "1",
        slug: "a",
        title: "A",
        body: "Link to [[Missing Page]]",
        pageType: "concept",
        status: "draft",
        frontmatter: {},
        updatedAt: new Date().toISOString(),
      },
    ]);
    expect(findings.some((f) => f.category === "dead_link")).toBe(true);
    expect(score).toBeLessThan(100);
  });
});

describe("pagerank", () => {
  it("ranks seeded nodes higher", () => {
    const nodes = [
      { id: "1", slug: "a", title: "A" },
      { id: "2", slug: "b", title: "B" },
      { id: "3", slug: "c", title: "C" },
    ];
    const edges = [
      { fromId: "1", toSlug: "b", toId: "2" },
      { fromId: "2", toSlug: "c", toId: "3" },
    ];
    const ranked = rankPages(nodes, edges, ["a"], 3);
    expect(ranked[0].slug).toBe("a");
    const adj = buildAdjacency(nodes, edges);
    const scores = personalizedPageRank(adj, ["1"]);
    expect(scores.get("1") ?? 0).toBeGreaterThan(0);
    expect(analyseGraph(nodes, edges).nodeCount).toBe(3);
  });
});

describe("ingest + hybrid", () => {
  it("compiles source and concept pages", () => {
    const result = compileIngest({
      title: "Market Note",
      body: "# Market Note\n\n## Liquidity\n\nDeep pools.\n\nEntity: RareStorm Holdings\n",
      sourceKind: "document",
      sensitivity: "internal",
      phiBlind: false,
    });
    expect(result.pages.some((p) => p.pageType === "source")).toBe(true);
    expect(result.pages.some((p) => p.pageType === "concept")).toBe(true);
    expect(result.pages.some((p) => p.pageType === "entity")).toBe(true);
  });

  it("redacts PHI-like patterns when phiBlind", () => {
    const result = compileIngest({
      title: "Care note",
      body: "Patient SSN 123-45-6789 and MRN: 999",
      sourceKind: "document",
      sensitivity: "internal",
      phiBlind: true,
    });
    expect(result.pages[0].body).toContain("[REDACTED]");
    expect(result.pages[0].sensitivity).toBe("phi_ref");
  });

  it("hybrid ranks lexical matches", () => {
    expect(lexicalScore("liquidity pools", "Deep liquidity in pools")).toBeGreaterThan(0);
    const ranked = hybridRank("liquidity", [
      { id: "1", slug: "a", title: "Liquidity", body: "pools", graphScore: 0.1 },
      { id: "2", slug: "b", title: "Other", body: "unrelated", graphScore: 0.9 },
    ]);
    expect(ranked[0].slug).toBe("a");
    expect(bagEmbedding("liquidity pools")).toHaveLength(384);
  });
});

describe("export", () => {
  it("defuddles html and builds canvas + thinking scaffold", () => {
    const md = defuddleHtml("<html><nav>x</nav><h1>Hi</h1><p>Hello</p></html>");
    expect(md).toContain("# Hi");
    expect(md).toContain("Hello");
    expect(pagesToCanvas([{ id: "1", slug: "a", title: "A" }], []).nodes).toHaveLength(1);
    expect(THINKING_PRINCIPLES).toHaveLength(10);
    expect(renderThinkingSession("Topic", ["goal"])).toContain("Thinking Session");
    expect(injectContradictionCallout("body", "Other", "clash")).toContain("[!contradiction]");
  });
});
