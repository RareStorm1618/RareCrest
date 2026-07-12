/** Expanded PHI / secret scrubbers before wiki persistence. */

const PATTERNS: Array<{ re: RegExp; replacement: string }> = [
  { re: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: "[REDACTED_SSN]" },
  { re: /\bMRN[:\s]*\d+\b/gi, replacement: "[PHI_REF]" },
  { re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, replacement: "[REDACTED_EMAIL]" },
  { re: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, replacement: "[REDACTED_PHONE]" },
  { re: /\b(?:sk|pk|api|key|token|secret|bearer)[-_]?[a-z0-9]{16,}\b/gi, replacement: "[REDACTED_SECRET]" },
  { re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, replacement: "[REDACTED_AWS_KEY]" },
  { re: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, replacement: "[REDACTED_JWT]" },
];

export function scrubSecretsAndPhi(text: string): { text: string; hits: string[] } {
  let out = text;
  const hits: string[] = [];
  for (const { re, replacement } of PATTERNS) {
    if (re.test(out)) {
      hits.push(replacement);
      out = out.replace(re, replacement);
    }
    // reset lastIndex for global regexes
    re.lastIndex = 0;
  }
  return { text: out, hits };
}

export function looksLikePhiOrSecret(text: string): boolean {
  return scrubSecretsAndPhi(text).hits.length > 0;
}

/** Topics that must never leave the building via autoresearch. */
export function sanitizeAutoresearchTopic(topic: string): { ok: true; topic: string } | { ok: false; reason: string } {
  const t = topic.trim();
  if (t.length < 2) return { ok: false, reason: "topic too short" };
  if (t.length > 200) return { ok: false, reason: "topic too long" };
  const scrubbed = scrubSecretsAndPhi(t);
  if (scrubbed.hits.length > 0) {
    return { ok: false, reason: `topic contains blocked secret/PHI patterns: ${scrubbed.hits.join(",")}` };
  }
  if (/\b(localhost|127\.0\.0\.1|\.internal|\.local)\b/i.test(t)) {
    return { ok: false, reason: "topic references internal hosts" };
  }
  return { ok: true, topic: t };
}

export function isAutoresearchEnabled(): boolean {
  return (process.env.WIKI_AUTORESEARCH_ENABLED ?? "false").toLowerCase() === "true";
}
