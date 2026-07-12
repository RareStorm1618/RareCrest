import { createHash } from "node:crypto";
import { scrubSecretsAndPhi } from "./scrub.js";

export interface DecisionTraceForWiki {
  id: string;
  entityId?: string | null;
  vertical: string;
  action: string;
  verdict: "allow" | "deny";
  payload: Record<string, unknown>;
  retentionRegime?: string;
  createdAt: string;
}

const PAYLOAD_ALLOW = new Set([
  "reason",
  "verdict",
  "action",
  "entityId",
  "instructionId",
  "humanInstructionId",
  "status",
  "code",
  "hardRuleClear",
  "source",
]);

/** Redact decision-trace payloads before wiki persistence — allowlist only. */
export function redactTracePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload ?? {})) {
    if (!PAYLOAD_ALLOW.has(k)) continue;
    if (typeof v === "string") {
      out[k] = scrubSecretsAndPhi(v).text.slice(0, 500);
    } else if (typeof v === "boolean" || typeof v === "number") {
      out[k] = v;
    } else if (v == null) {
      out[k] = null;
    } else {
      out[k] = "[redacted_object]";
    }
  }
  out._redacted = true;
  return out;
}

/**
 * Format an append-only decision_traces row into immutable wiki raw source text.
 * Content hash is keyed by trace id so re-ingest is idempotent.
 */
export function formatDecisionTraceForWiki(trace: DecisionTraceForWiki): {
  title: string;
  body: string;
  contentHash: string;
  slug: string;
} {
  const title = `Decision: ${trace.action} (${trace.verdict})`;
  const payloadJson = JSON.stringify(redactTracePayload(trace.payload ?? {}), null, 2);
  const body = [
    `# ${title}`,
    ``,
    `> Source: decision_traces · id \`${trace.id}\``,
    ``,
    `- **Vertical:** ${trace.vertical}`,
    `- **Entity:** ${trace.entityId ?? "_none_"}`,
    `- **Action:** ${trace.action}`,
    `- **Verdict:** ${trace.verdict}`,
    `- **Retention:** ${trace.retentionRegime ?? "standard"}`,
    `- **Created:** ${trace.createdAt}`,
    ``,
    `## Payload (redacted allowlist)`,
    ``,
    "```json",
    payloadJson,
    "```",
    ``,
  ].join("\n");

  const contentHash = createHash("sha256").update(`decision-trace:${trace.id}`).digest("hex");
  const slug = `decision-${trace.id.slice(0, 8)}-${trace.action}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 200);

  return { title, body, contentHash, slug };
}
