/** WO-27: ExportController — projections, not recomputations */

import { createHash } from "node:crypto";
import { renderSimplePdf } from "./pdf.js";

export { renderSimplePdf } from "./pdf.js";

export interface OversightPackInput {
  entityId: string;
  entityName: string;
  governancePillars: Record<string, number>;
  killSwitchLastTest: string | null;
  openRedGates: string[];
  hardRuleExceptions: string[];
  attentionFlags: Array<{ type: string; message: string }>;
}

export interface PortfolioEntitySnapshot {
  entityId: string;
  entityName: string;
  readinessBand: string | null;
  governanceStatus: string;
  openFlagCount: number;
}

export interface PortfolioOversightInput {
  vertical: string;
  entities: PortfolioEntitySnapshot[];
  portfolioAttentionFlags: Array<{ type: string; message: string }>;
}

export interface ExportPack {
  kind?: "oversight" | "assessment_summary";
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
    kind: "oversight",
    scope: "entity",
    format,
    sections,
    generatedAt: new Date().toISOString(),
    contentHash: createHash("sha256").update(content).digest("hex"),
  };
}

export function assemblePortfolioOversightPack(input: PortfolioOversightInput, format: "pdf" | "markdown"): ExportPack {
  const entityLines = input.entities.map(
    (e) =>
      `- ${e.entityName}: band=${e.readinessBand ?? "n/a"}, governance=${e.governanceStatus}, openFlags=${e.openFlagCount}`,
  );
  const sections = [
    { title: "Portfolio scope", body: `Vertical: ${input.vertical}\nEntities: ${input.entities.length}` },
    { title: "Entity rollup", body: entityLines.join("\n") || "No entities" },
    {
      title: "Portfolio attention flags",
      body: input.portfolioAttentionFlags.map((f) => `${f.type}: ${f.message}`).join("\n") || "None",
    },
  ];
  const content = sections.map((s) => `## ${s.title}\n${s.body}`).join("\n\n");
  return {
    kind: "oversight",
    scope: "portfolio",
    format,
    sections,
    generatedAt: new Date().toISOString(),
    contentHash: createHash("sha256").update(content).digest("hex"),
  };
}

export function renderMarkdown(pack: ExportPack): string {
  const title = pack.kind === "assessment_summary" ? "Assessment Summary" : "Oversight Pack";
  return `# ${title} (${pack.scope})\n\n${pack.sections.map((s) => `## ${s.title}\n${s.body}`).join("\n\n")}\n`;
}

export function renderExportBody(pack: ExportPack, markdown: string): { body: Buffer; mime: string; extension: string } {
  if (pack.format === "pdf") {
    return { body: renderSimplePdf(markdown), mime: "application/pdf", extension: "pdf" };
  }
  return { body: Buffer.from(markdown, "utf8"), mime: "text/markdown", extension: "md" };
}

export interface AssessmentSummaryInput {
  entityId: string;
  entityName: string;
  readinessTotal: number;
  readinessBand: string;
  maturityLevel: number | null;
  governanceMaturity: number | null;
  completedAt: string;
}

export function assembleAssessmentSummary(input: AssessmentSummaryInput): ExportPack {
  const sections = [
    { title: "Entity", body: `${input.entityName} (${input.entityId})` },
    { title: "Readiness", body: `Total: ${input.readinessTotal} — Band: ${input.readinessBand}` },
    { title: "Maturity", body: `Level ${input.maturityLevel ?? "n/a"} | Governance maturity ${input.governanceMaturity ?? "n/a"}` },
    { title: "Completed", body: input.completedAt },
  ];
  const content = sections.map((s) => `## ${s.title}\n${s.body}`).join("\n\n");
  return {
    kind: "assessment_summary",
    scope: "entity",
    format: "markdown",
    sections,
    generatedAt: new Date().toISOString(),
    contentHash: createHash("sha256").update(content).digest("hex"),
  };
}
