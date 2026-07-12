import { extractWikiLinks, toSlugFromLink, hasContradictionCallout } from "./markdown.js";

export type LintCategory =
  | "orphan"
  | "dead_link"
  | "missing_concept"
  | "stale_claim"
  | "frontmatter_gap"
  | "empty_section"
  | "contradiction"
  | "near_duplicate";

export interface LintFinding {
  category: LintCategory;
  severity: "info" | "warn" | "error";
  pageSlug?: string;
  message: string;
}

export interface LintPageInput {
  id: string;
  slug: string;
  title: string;
  body: string;
  pageType: string;
  status: string;
  frontmatter: Record<string, unknown>;
  updatedAt: string;
}

/** 8-category vault lint (AgriciDaniel-inspired). */
export function lintWiki(
  pages: LintPageInput[],
  opts: { staleDays?: number } = {},
): { findings: LintFinding[]; score: number } {
  const staleDays = opts.staleDays ?? 90;
  const findings: LintFinding[] = [];
  const slugSet = new Set(pages.map((p) => p.slug));
  const inbound = new Map<string, number>();
  for (const p of pages) inbound.set(p.slug, 0);

  for (const p of pages) {
    const links = extractWikiLinks(p.body);
    for (const link of links) {
      const slug = toSlugFromLink(link);
      if (!slugSet.has(slug)) {
        findings.push({
          category: "dead_link",
          severity: "warn",
          pageSlug: p.slug,
          message: `Dead link [[${link}]] → missing page '${slug}'`,
        });
      } else {
        inbound.set(slug, (inbound.get(slug) ?? 0) + 1);
      }
    }

    if (!p.frontmatter.tags && p.pageType !== "log" && p.pageType !== "hot") {
      findings.push({
        category: "frontmatter_gap",
        severity: "info",
        pageSlug: p.slug,
        message: "Missing tags in frontmatter",
      });
    }

    if (p.body.trim().length < 40 && !["index", "hot", "log"].includes(p.pageType)) {
      findings.push({
        category: "empty_section",
        severity: "warn",
        pageSlug: p.slug,
        message: "Page body is very short",
      });
    }

    if (hasContradictionCallout(p.body)) {
      findings.push({
        category: "contradiction",
        severity: "error",
        pageSlug: p.slug,
        message: "Contains [!contradiction] callout — needs resolution or accepted tension",
      });
    }

    const ageDays = (Date.now() - new Date(p.updatedAt).getTime()) / 86400000;
    if (ageDays > staleDays && p.status !== "archived") {
      findings.push({
        category: "stale_claim",
        severity: "info",
        pageSlug: p.slug,
        message: `Not updated in ${Math.floor(ageDays)} days`,
      });
    }

    const mentions = p.body.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g) ?? [];
    for (const m of mentions.slice(0, 5)) {
      const slug = toSlugFromLink(m);
      if (!slugSet.has(slug) && m.split(" ").length <= 4) {
        findings.push({
          category: "missing_concept",
          severity: "info",
          pageSlug: p.slug,
          message: `Mentioned concept '${m}' has no wiki page`,
        });
      }
    }
  }

  for (const p of pages) {
    if (["index", "log", "hot", "overview"].includes(p.pageType)) continue;
    if ((inbound.get(p.slug) ?? 0) === 0) {
      findings.push({
        category: "orphan",
        severity: "warn",
        pageSlug: p.slug,
        message: "Orphan page — no inbound wikilinks",
      });
    }
  }

  const byNorm = new Map<string, string[]>();
  for (const p of pages) {
    const norm = p.title.toLowerCase().replace(/[^a-z0-9]/g, "");
    const list = byNorm.get(norm) ?? [];
    list.push(p.slug);
    byNorm.set(norm, list);
  }
  for (const [, slugs] of byNorm) {
    if (slugs.length > 1) {
      findings.push({
        category: "near_duplicate",
        severity: "warn",
        message: `Near-duplicate titles: ${slugs.join(", ")}`,
      });
    }
  }

  const errors = findings.filter((f) => f.severity === "error").length;
  const warns = findings.filter((f) => f.severity === "warn").length;
  const score = Math.max(0, 100 - errors * 15 - warns * 3);
  return { findings, score };
}
