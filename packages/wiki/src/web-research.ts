export interface WebSearchHit {
  url: string;
  title: string;
  snippet: string;
}

export interface WebResearchRound {
  round: number;
  query: string;
  hits: WebSearchHit[];
  fetched: Array<{ url: string; title: string; excerpt: string; blocked?: boolean; error?: string }>;
}

const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /\.internal$/i,
  /\.local$/i,
  /^rarecrest\./i,
  /^metadata\.google/i,
  /^169\.254\./,
];

export function isBlockedFetchUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return true;
    const host = u.hostname.replace(/^\[|\]$/g, "");
    if (host === "::1" || host === "0.0.0.0") return true;
    // Decimal IP tricks e.g. http://2130706433/
    if (/^\d+$/.test(host)) {
      const n = Number(host);
      if (n >= 0 && n <= 0xffffffff) {
        const a = (n >>> 24) & 255;
        const b = (n >>> 16) & 255;
        if (a === 127 || a === 10 || a === 0 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)) {
          return true;
        }
      }
    }
    return BLOCKED_HOST_PATTERNS.some((re) => re.test(host));
  } catch {
    return true;
  }
}

/** Post-DNS private/reserved IP check (call after resolve). */
export function isBlockedIpAddress(ip: string): boolean {
  const h = ip.replace(/^\[|\]$/g, "");
  if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 127 || a === 10 || a === 0 || a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

export function rankSearchHits(hits: WebSearchHit[], topic: string, limit = 5): WebSearchHit[] {
  const terms = topic.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
  return [...hits]
    .map((h) => {
      const hay = `${h.title} ${h.snippet}`.toLowerCase();
      const score = terms.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
      return { hit: h, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.hit);
}

export function synthesizeAutoresearchBody(topic: string, rounds: WebResearchRound[]): string {
  const lines: string[] = [`# Autoresearch: ${topic}`, ``, `## Rounds`, ``];
  for (const round of rounds) {
    lines.push(`### Round ${round.round} — \`${round.query}\``, ``);
    if (round.hits.length === 0) {
      lines.push(`_No live search hits._`, ``);
      continue;
    }
    for (const hit of round.hits) {
      lines.push(`- [${hit.title}](${hit.url}) — ${hit.snippet.slice(0, 240)}`);
    }
    lines.push(``);
    if (round.fetched.length > 0) {
      lines.push(`#### Fetched excerpts`, ``);
      for (const f of round.fetched) {
        if (f.blocked) {
          lines.push(`- Blocked: ${f.url} (${f.error ?? "policy"})`);
          continue;
        }
        if (f.error) {
          lines.push(`- Failed: [${f.title}](${f.url}) — ${f.error}`);
          continue;
        }
        lines.push(`- [${f.title}](${f.url})`, ``, f.excerpt.slice(0, 800), ``);
      }
    }
  }
  lines.push(`## Open gaps`, ``, `- Validate sources with human review`, `- Promote only after dual-control when financial/holding`, ``);
  return lines.join("\n");
}
