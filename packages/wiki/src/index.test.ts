import { describe, expect, it } from "vitest";
import { VERTICAL_CHARTERS, slugify, namespaceForVertical } from "./charter.js";
import { extractWikiLinks, extractSections, injectContradictionCallout } from "./markdown.js";
import { personalizedPageRank, buildAdjacency, rankPages, analyseGraph } from "./pagerank.js";
import { lintWiki } from "./lint.js";
import { compileIngest, hybridRank, lexicalScore, bagEmbedding } from "./ingest.js";
import { defuddleHtml, pagesToCanvas, renderThinkingSession, THINKING_PRINCIPLES } from "./export.js";
import { formatDecisionTraceForWiki } from "./decision-trace-ingest.js";
import { isBlockedFetchUrl, synthesizeAutoresearchBody, rankSearchHits } from "./web-research.js";
import {
  isDirectorObsidianNamespace,
  filterObsidianSyncPages,
  isObsidianSyncSafeSensitivity,
  buildObsidianSyncToken,
} from "./obsidian-sync.js";
import {
  buildVaultPackagePlain,
  encryptVaultPackage,
  decryptVaultPackage,
  vaultPackageToTree,
} from "./vault-package.js";
import { classifyWikiPrincipal, assertWikiVerbAllowed } from "./ai-bounds.js";
import { isBlockedIpAddress } from "./web-research.js";
import { looksLikePhiOrSecret, sanitizeAutoresearchTopic, isAutoresearchEnabled } from "./scrub.js";

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
    expect(result.pages[0].body).toContain("[REDACTED_SSN]");
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

describe("decision-trace ingest", () => {
  it("formats stable content hash by trace id", () => {
    const a = formatDecisionTraceForWiki({
      id: "11111111-1111-1111-1111-111111111111",
      entityId: "22222222-2222-2222-2222-222222222222",
      vertical: "holding",
      action: "runtime_activation",
      verdict: "allow",
      payload: { reason: "ok" },
      createdAt: "2026-07-12T00:00:00.000Z",
    });
    const b = formatDecisionTraceForWiki({
      id: "11111111-1111-1111-1111-111111111111",
      entityId: "22222222-2222-2222-2222-222222222222",
      vertical: "holding",
      action: "runtime_activation",
      verdict: "allow",
      payload: { reason: "changed payload still same hash key" },
      createdAt: "2026-07-12T00:00:00.000Z",
    });
    expect(a.contentHash).toBe(b.contentHash);
    expect(a.body).toContain("runtime_activation");
    expect(a.body).toContain("```json");
    const compiled = compileIngest({
      title: a.title,
      body: a.body,
      sourceKind: "decision_trace",
      sensitivity: "internal",
      phiBlind: false,
      contentHashOverride: a.contentHash,
    });
    expect(compiled.contentHash).toBe(a.contentHash);
    expect(compiled.pages[0].pageType).toBe("decision");
  });
});

describe("web research helpers", () => {
  it("blocks internal and private hosts", () => {
    expect(isBlockedFetchUrl("http://localhost/x")).toBe(true);
    expect(isBlockedFetchUrl("https://10.0.0.2/a")).toBe(true);
    expect(isBlockedFetchUrl("https://example.com/a")).toBe(false);
  });

  it("ranks and synthesizes autoresearch body", () => {
    const ranked = rankSearchHits(
      [
        { url: "https://a.example/x", title: "Other", snippet: "n/a" },
        { url: "https://b.example/y", title: "Liquidity pools", snippet: "deep liquidity" },
      ],
      "liquidity",
      2,
    );
    expect(ranked[0].title).toContain("Liquidity");
    const body = synthesizeAutoresearchBody("liquidity", [
      {
        round: 1,
        query: "liquidity",
        hits: ranked,
        fetched: [{ url: ranked[0].url, title: ranked[0].title, excerpt: "Deep pools." }],
      },
    ]);
    expect(body).toContain("Autoresearch: liquidity");
    expect(body).toContain("Deep pools.");
  });
});

describe("obsidian sync policy", () => {
  it("allows only director vault namespaces and safe sensitivity", () => {
    expect(isDirectorObsidianNamespace("holding/canon")).toBe(true);
    expect(isDirectorObsidianNamespace("bridges/rareangels__holding")).toBe(true);
    expect(isDirectorObsidianNamespace("entity/x/working")).toBe(false);
    expect(isObsidianSyncSafeSensitivity("internal")).toBe(true);
    expect(isObsidianSyncSafeSensitivity("phi_ref")).toBe(false);
    expect(isObsidianSyncSafeSensitivity("financial")).toBe(false);
    const filtered = filterObsidianSyncPages(
      [
        { sensitivity: "internal", updatedAt: "2026-07-12T10:00:00.000Z", slug: "a" },
        { sensitivity: "phi_ref", updatedAt: "2026-07-12T11:00:00.000Z", slug: "b" },
        { sensitivity: "financial", updatedAt: "2026-07-12T12:00:00.000Z", slug: "c" },
        { sensitivity: "public", updatedAt: "2026-07-11T00:00:00.000Z", slug: "d" },
      ],
      "2026-07-12T00:00:00.000Z",
    );
    expect(filtered.map((p) => p.slug)).toEqual(["a"]);
    expect(buildObsidianSyncToken("holding/canon", filtered)).toHaveLength(32);
  });
});

describe("vault package crypto", () => {
  it("encrypts and decrypts roundtrip with HMAC", () => {
    const plain = buildVaultPackagePlain({
      namespace: "holding/canon",
      pages: [
        {
          slug: "hello",
          title: "Hello",
          pageType: "concept",
          body: "# Hello\n\nWorld",
          sensitivity: "internal",
        },
        {
          slug: "secret",
          title: "Secret",
          pageType: "source",
          body: "nope",
          sensitivity: "phi_ref",
        },
      ],
    });
    expect(plain.files).toHaveLength(1);
    const enc = encryptVaultPackage(plain, "test-passphrase-fortress", "hmac-key");
    const dec = decryptVaultPackage(enc, "test-passphrase-fortress", "hmac-key");
    expect(dec.files[0].path).toContain("hello");
    expect(vaultPackageToTree(dec)["wiki/concept/hello.md"]).toContain("Hello");
  });
});

describe("ai bounds", () => {
  it("denies promote for agents under strict bounds", () => {
    process.env.WIKI_AGENT_BOUNDS = "strict";
    expect(classifyWikiPrincipal({ role: "agent", userId: "agent-1" })).toBe("agent");
    expect(() => assertWikiVerbAllowed("promote", "agent")).toThrow(/denied/);
    expect(() => assertWikiVerbAllowed("ingest", "agent")).not.toThrow();
    process.env.WIKI_AGENT_BOUNDS = "off";
  });
});

describe("scrub + SSRF helpers", () => {
  it("detects PHI-like content and blocks private IPs", () => {
    expect(looksLikePhiOrSecret("Patient SSN 123-45-6789")).toBe(true);
    const sanitized = sanitizeAutoresearchTopic("api_key=sk-abcdefghijklmnopqrstuvwxyz");
    expect(sanitized.ok).toBe(false);
    expect(isBlockedIpAddress("10.0.0.1")).toBe(true);
    expect(isBlockedIpAddress("8.8.8.8")).toBe(false);
    process.env.WIKI_AUTORESEARCH_ENABLED = "false";
    expect(isAutoresearchEnabled()).toBe(false);
  });
});
