/** WO-27: ExportController — projections, not recomputations */

import { createHash } from "node:crypto";

export interface OversightPackInput {
  entityId: string;
  entityName: string;
  governancePillars: Record<string, number>;
  killSwitchLastTest: string | null;
  openRedGates: string[];
  hardRuleExceptions: string[];
  attentionFlags: Array<{ type: string; message: string }>;
}

export interface ExportPack {
  scope: "entity" | "portfolio";
  format: "pdf" | "markdown";
  sections: Array<{ title: string; body: string }>;
  generatedAt: string;
  contentHash: string;
}

export function assembleOversightPack(input: OversightPackInput, format: "pdf" | "markdown"): ExportPack {
  const sections = [
    { title: "Governance pillars", body: JSON.stringify(input.governancePillars, null, 2) },
    { title: "Kill switch", body: input.killSwitchLastTest ?? "No test recorded" },
    { title: "Open red gates", body: input.openRedGates.join(", ") || "None" },
    { title: "Hard-rule exceptions", body: input.hardRuleExceptions.join(", ") || "None" },
    { title: "Attention flags", body: input.attentionFlags.map((f) => `${f.type}: ${f.message}`).join("\n") || "None" },
  ];
  const content = sections.map((s) => `## ${s.title}\n${s.body}`).join("\n\n");
  return {
    scope: "entity",
    format,
    sections,
    generatedAt: new Date().toISOString(),
    contentHash: createHash("sha256").update(content).digest("hex"),
  };
}

export function renderMarkdown(pack: ExportPack): string {
  return `# Oversight Pack (${pack.scope})\n\n${pack.sections.map((s) => `## ${s.title}\n${s.body}`).join("\n\n")}\n`;
}
