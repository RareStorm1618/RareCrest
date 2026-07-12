/** LP-grade board pack — evidence bundle assembled from SoR snapshots (pure). */
import { createHash } from "node:crypto";

export interface BoardPackSection {
  title: string;
  body: string;
}

export interface BoardPackResult {
  kind: "board_pack";
  scope: "portfolio";
  format: "markdown";
  sections: BoardPackSection[];
  generatedAt: string;
  contentHash: string;
}

export interface BoardPackInput {
  windowDays: number;
  northStar: {
    capitalRoutedUsd: number;
    healingHours: number;
    familiesSupported: number;
    donationPctBpsAvg: number;
    dualMissionScore: number;
  };
  parliament: {
    openSessions: number;
    readyForSeal: number;
    sealedInWindow: number;
    recentSeals: Array<{
      sessionId: string;
      stakeClass: string;
      mode: string;
      sealedAt: string;
      effectDigest: string | null;
    }>;
  };
  killSwitches: Array<{ entityId: string; entityName: string; state: string }>;
  attentionOpen: number;
  federation: {
    acceptedInWindow: number;
    rejectedInWindow: number;
    recent: Array<{ vertical: string; eventType: string; status: string; receivedAt: string }>;
  };
  provenance: {
    latestRootId: string | null;
    latestMerkleRoot: string | null;
    latestRootAt: string | null;
    entityHeads: number;
    metricHeads: number;
  };
  traceVerifySample: Array<{ entityId: string; entityName: string; valid: boolean; checked: number }>;
}

export function assembleBoardPack(input: BoardPackInput): BoardPackResult {
  const sealLines =
    input.parliament.recentSeals
      .map(
        (s) =>
          `- ${s.sealedAt} · ${s.stakeClass} · ${s.mode}` +
          (s.effectDigest ? ` · digest=${s.effectDigest.slice(0, 12)}…` : ""),
      )
      .join("\n") || "None in window";

  const ksLines =
    input.killSwitches.map((k) => `- ${k.entityName} (${k.entityId}): ${k.state}`).join("\n") || "None";

  const fedLines =
    input.federation.recent
      .map((e) => `- ${e.receivedAt} · ${e.vertical} · ${e.eventType} · ${e.status}`)
      .join("\n") || "None";

  const verifyLines =
    input.traceVerifySample
      .map((t) => `- ${t.entityName}: ${t.valid ? "VALID" : "INVALID"} (${t.checked} traces)`)
      .join("\n") || "No entities sampled";

  const sections: BoardPackSection[] = [
    {
      title: "North Star",
      body: [
        `Window: ${input.windowDays}d`,
        `Capital routed: $${input.northStar.capitalRoutedUsd.toLocaleString()}`,
        `Healing hours: ${input.northStar.healingHours.toLocaleString()}`,
        `Families supported: ${input.northStar.familiesSupported.toLocaleString()}`,
        `Avg donation: ${(input.northStar.donationPctBpsAvg / 100).toFixed(2)}%`,
        `Dual-mission score: ${input.northStar.dualMissionScore}/100`,
      ].join("\n"),
    },
    {
      title: "Parliament & seals",
      body: [
        `Open: ${input.parliament.openSessions}`,
        `Ready for seal: ${input.parliament.readyForSeal}`,
        `Sealed in window: ${input.parliament.sealedInWindow}`,
        "",
        sealLines,
      ].join("\n"),
    },
    { title: "Kill switches", body: ksLines },
    {
      title: "Attention",
      body: `Open attention flags: ${input.attentionOpen}`,
    },
    {
      title: "Vertical federation",
      body: [
        `Accepted in window: ${input.federation.acceptedInWindow}`,
        `Rejected in window: ${input.federation.rejectedInWindow}`,
        "",
        fedLines,
      ].join("\n"),
    },
    {
      title: "Provenance root",
      body: [
        `Latest root id: ${input.provenance.latestRootId ?? "none"}`,
        `Merkle root: ${input.provenance.latestMerkleRoot ?? "none"}`,
        `Anchored at: ${input.provenance.latestRootAt ?? "n/a"}`,
        `Entity heads: ${input.provenance.entityHeads}`,
        `Metric heads: ${input.provenance.metricHeads}`,
      ].join("\n"),
    },
    { title: "Decision-trace verify sample", body: verifyLines },
  ];

  const content = sections.map((s) => `## ${s.title}\n${s.body}`).join("\n\n");

  return {
    kind: "board_pack",
    scope: "portfolio",
    format: "markdown",
    sections,
    generatedAt: new Date().toISOString(),
    contentHash: createHash("sha256").update(content).digest("hex"),
  };
}
