/**
 * AI / agent verb bounds for Federated Canon Wiki.
 * Agents may draft and query; humans/directors own promotion, research egress, and Obsidian packages.
 */

export type WikiPrincipalKind = "agent" | "human" | "director" | "unknown";

export type WikiVerb =
  | "ingest"
  | "query"
  | "lint"
  | "lock"
  | "doctor"
  | "export_metadata"
  | "promote"
  | "autoresearch"
  | "ingest_decision_traces"
  | "vault_package"
  | "bridges"
  | "think"
  | "contradictions";

const HUMAN_ROLES = new Set(["director", "admin", "human", "operator"]);
const AGENT_ROLES = new Set(["agent", "service", "bot", "automation", "system"]);

export function classifyWikiPrincipal(input: {
  role?: string | null;
  userId?: string | null;
  authMethod?: string | null;
}): WikiPrincipalKind {
  const role = (input.role ?? "").toLowerCase().trim();
  const userId = (input.userId ?? "").toLowerCase();
  if (role === "director") return "director";
  if (HUMAN_ROLES.has(role)) return "human";
  if (AGENT_ROLES.has(role) || userId.startsWith("agent-") || userId.startsWith("svc-")) return "agent";
  if (role) return "unknown";
  // No role: treat as unknown (fail closed under strict bounds)
  return "unknown";
}

/** Verbs agents may perform when vertically scoped. */
const AGENT_ALLOWED = new Set<WikiVerb>([
  "ingest",
  "query",
  "lint",
  "lock",
  "doctor",
  "export_metadata",
  "contradictions",
]);

export function agentBoundsMode(): "off" | "strict" {
  const raw = (process.env.WIKI_AGENT_BOUNDS ?? "").toLowerCase();
  if (raw === "off") return "off";
  if (raw === "strict") return "strict";
  // Default: strict when AUTH_TRUST_MODE=strict or API not loopback-ish
  const trust = (process.env.AUTH_TRUST_MODE ?? "dev").toLowerCase();
  const host = process.env.API_HOST ?? "0.0.0.0";
  if (trust === "strict") return "strict";
  if (host === "127.0.0.1" || host === "::1" || host === "localhost") return "off";
  return "strict";
}

export function assertWikiVerbAllowed(
  verb: WikiVerb,
  principal: WikiPrincipalKind,
  opts?: { verifiedDirector?: boolean },
): void {
  const mode = agentBoundsMode();
  if (mode === "off") return;

  if (principal === "agent" || (principal === "unknown" && mode === "strict")) {
    if (!AGENT_ALLOWED.has(verb)) {
      throw Object.assign(new Error(`Wiki verb '${verb}' denied for agents (WIKI_AGENT_BOUNDS=strict)`), {
        statusCode: 403,
        code: "WIKI_AGENT_BOUND",
      });
    }
  }

  if (verb === "vault_package" || verb === "bridges" || verb === "autoresearch") {
    if (!opts?.verifiedDirector && principal !== "director") {
      throw Object.assign(new Error(`Wiki verb '${verb}' requires verified director`), {
        statusCode: 403,
        code: "WIKI_DIRECTOR_REQUIRED",
      });
    }
  }

  if (verb === "promote" || verb === "ingest_decision_traces" || verb === "think") {
    if (principal === "agent" || (principal === "unknown" && mode === "strict")) {
      throw Object.assign(new Error(`Wiki verb '${verb}' requires human or director`), {
        statusCode: 403,
        code: "WIKI_HUMAN_REQUIRED",
      });
    }
  }
}
