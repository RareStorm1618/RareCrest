export interface ProhibitedClaimScan {
  claims: string[];
}

export interface ClaimScanResult {
  blocked: Array<{ claim: string; reason: string; suggestedRewrite: string }>;
  allowed: string[];
}

const prohibitedPatterns: Array<{ pattern: RegExp; reason: string; rewrite: string }> = [
  {
    pattern: /\bguaranteed\b/i,
    reason: "absolute guarantee claim",
    rewrite: "replace with probability-based language and conditions",
  },
  {
    pattern: /\brisk[- ]?free\b/i,
    reason: "risk-free claim",
    rewrite: "describe known risks and mitigations explicitly",
  },
  {
    pattern: /\b100%\b/i,
    reason: "absolute certainty percentage",
    rewrite: "use observed confidence range with evidence source",
  },
];

export function scanProhibitedClaims(input: ProhibitedClaimScan): ClaimScanResult {
  const blocked: ClaimScanResult["blocked"] = [];
  const allowed: string[] = [];
  for (const claim of input.claims) {
    const hit = prohibitedPatterns.find((rule) => rule.pattern.test(claim));
    if (hit) {
      blocked.push({
        claim,
        reason: hit.reason,
        suggestedRewrite: hit.rewrite,
      });
      continue;
    }
    allowed.push(claim);
  }
  return { blocked, allowed };
}
