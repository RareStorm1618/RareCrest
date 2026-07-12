/** WO-64/65/66: Command Surface domain */

import type { AttentionItem } from "@rarecrest/portfolio";

export type QueueItemKind = "decision" | "awareness";

export interface AttentionQueueItem extends AttentionItem {
  sourceFeature: string;
  kind: QueueItemKind;
  entityName?: string;
}

export interface MorningBriefSection {
  type: "new_decisions" | "resolved" | "alerts" | "agent_activity" | "unchanged" | "wiki_health";
  items: Array<{ id: string; label: string; linkPath: string; sourceFeature: string }>;
}

export interface MorningBrief {
  date: string;
  unchanged: boolean;
  sections: MorningBriefSection[];
  generatedAt: string;
}

export interface PriorityItem {
  rank: number;
  itemId: string;
  label: string;
  sourceFeature: string;
  entityId: string;
  score: number;
}

const SEVERITY_SCORE = { critical: 100, high: 75, medium: 50, low: 25 } as const;

/** AC-CMD-002.4 */
export function isPortfolioClear(queue: AttentionQueueItem[]): boolean {
  return queue.length === 0;
}

/** AC-CMD-005.1 */
export function classifyQueueItem(signalType: string): QueueItemKind {
  if (signalType === "pending_high_stakes_decision" || signalType === "hard_rule_exception") {
    return "decision";
  }
  return "awareness";
}

/** AC-CMD-005.2 */
export function filterDecisionItems(queue: AttentionQueueItem[]): AttentionQueueItem[] {
  return queue.filter((q) => q.kind === "decision");
}

/** AC-CMD-001.4 */
export function buildMorningBrief(
  since: Date | null,
  newItems: AttentionQueueItem[],
  resolvedIds: string[],
  alerts: AttentionQueueItem[],
  agentActivity: Array<{ id: string; label: string; linkPath: string; sourceFeature: string }>,
): MorningBrief {
  const unchanged =
    newItems.length === 0 && resolvedIds.length === 0 && alerts.length === 0 && agentActivity.length === 0;
  const sections: MorningBriefSection[] = [];
  if (unchanged) {
    sections.push({ type: "unchanged", items: [{ id: "none", label: "Nothing changed since last session", linkPath: "/command", sourceFeature: "command_surface" }] });
  } else {
    if (newItems.length) {
      sections.push({
        type: "new_decisions",
        items: newItems.map((i) => ({ id: i.id, label: i.message, linkPath: i.linkPath ?? `/entities/${i.entityId}`, sourceFeature: i.sourceFeature })),
      });
    }
    if (resolvedIds.length) {
      sections.push({
        type: "resolved",
        items: resolvedIds.map((id) => ({ id, label: `Resolved item ${id}`, linkPath: `/command/resolved/${id}`, sourceFeature: "command_surface" })),
      });
    }
    if (alerts.length) {
      sections.push({
        type: "alerts",
        items: alerts.map((i) => ({ id: i.id, label: i.message, linkPath: i.linkPath ?? `/entities/${i.entityId}`, sourceFeature: i.sourceFeature })),
      });
    }
    if (agentActivity.length) {
      sections.push({ type: "agent_activity", items: agentActivity });
    }
  }
  return {
    date: new Date().toISOString().split("T")[0],
    unchanged,
    sections,
    generatedAt: new Date().toISOString(),
  };
}

/** WO-65 PriorityRanker */
export function rankPriorityItems(queue: AttentionQueueItem[]): PriorityItem[] {
  return [...queue]
    .map((item) => ({
      rank: 0,
      itemId: item.id,
      label: item.message,
      sourceFeature: item.sourceFeature,
      entityId: item.entityId,
      score:
        SEVERITY_SCORE[item.severity] +
        (item.kind === "decision" ? 50 : 0) +
        (item.signalType === "hard_rule_exception" ? 25 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .map((item, idx) => ({ ...item, rank: idx + 1 }));
}

export interface SharedMemoryRecord {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
}
