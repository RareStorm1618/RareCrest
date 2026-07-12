/** Extract [[wikilinks]] from Obsidian-flavored markdown. */
export function extractWikiLinks(body: string): string[] {
  const links = new Set<string>();
  const re = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    const target = match[1].trim();
    if (target) links.add(target);
  }
  return [...links];
}

export function toSlugFromLink(linkText: string): string {
  return linkText
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Tier-B zero-LLM section extraction — split on markdown headings. */
export function extractSections(body: string): Array<{ heading: string; content: string }> {
  const lines = body.split(/\r?\n/);
  const sections: Array<{ heading: string; content: string }> = [];
  let current = { heading: "preamble", content: "" };
  for (const line of lines) {
    const h = /^(#{1,6})\s+(.+)$/.exec(line);
    if (h) {
      // Keep empty non-preamble headings; drop empty preamble only.
      if (current.heading !== "preamble" || current.content.trim()) {
        sections.push(current);
      }
      current = { heading: h[2].trim(), content: "" };
    } else {
      current.content += `${line}\n`;
    }
  }
  if (current.heading !== "preamble" || current.content.trim()) {
    sections.push(current);
  }
  return sections;
}

export function renderFrontmatter(meta: Record<string, unknown>): string {
  const lines = Object.entries(meta).map(([k, v]) => {
    if (typeof v === "string") return `${k}: ${JSON.stringify(v)}`;
    if (typeof v === "boolean" || typeof v === "number") return `${k}: ${v}`;
    return `${k}: ${JSON.stringify(v)}`;
  });
  return `---\n${lines.join("\n")}\n---\n`;
}

export function stripFrontmatter(body: string): { meta: Record<string, string>; body: string } {
  if (!body.startsWith("---")) return { meta: {}, body };
  const end = body.indexOf("\n---", 3);
  if (end < 0) return { meta: {}, body };
  const block = body.slice(4, end);
  const meta: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/^"|"$/g, "");
  }
  return { meta, body: body.slice(end + 4).replace(/^\n/, "") };
}

/** Detect simple contradiction callout markers. */
export function hasContradictionCallout(body: string): boolean {
  return />\s*\[!contradiction\]/i.test(body);
}

export function injectContradictionCallout(body: string, otherPage: string, note: string): string {
  const callout = `\n\n> [!contradiction]\n> Conflicts with [[${otherPage}]]: ${note}\n`;
  if (hasContradictionCallout(body)) return body;
  return `${body.trimEnd()}${callout}`;
}
