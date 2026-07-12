import { useEffect, useState } from "react";
import { StyleSheet, Text, View, ScrollView, Pressable } from "react-native";
import { RareCrestApiClient } from "@rarecrest/api-client";
import type { PortfolioRollup } from "@rarecrest/contracts";

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
const API_HEADERS: Record<string, string> = (() => {
  const bearer = process.env.EXPO_PUBLIC_API_BEARER_TOKEN;
  if (bearer) return { Authorization: `Bearer ${bearer}` };
  return {
    "x-user-id": "director-1",
    "x-user-role": "director",
    "x-vertical": "holding",
  };
})();

const client = new RareCrestApiClient({
  baseUrl: API_BASE,
  getHeaders: () => API_HEADERS,
});

interface AttentionQueueItem {
  id: string;
  entityId: string;
  entityName?: string;
  signalType: string;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  createdAt: string;
  kind: "decision" | "awareness";
}

async function fetchAttentionQueue(): Promise<{ items: AttentionQueueItem[]; portfolioClear: boolean }> {
  const res = await fetch(`${API_BASE}/api/v1/command/attention-queue`, { headers: API_HEADERS });
  if (!res.ok) throw new Error(`Attention queue request failed: ${res.status}`);
  return (await res.json()) as { items: AttentionQueueItem[]; portfolioClear: boolean };
}

export default function App() {
  const [rollup, setRollup] = useState<PortfolioRollup | null>(null);
  const [attentionItems, setAttentionItems] = useState<AttentionQueueItem[]>([]);
  const [portfolioClear, setPortfolioClear] = useState(true);
  const [attentionError, setAttentionError] = useState<string | null>(null);

  useEffect(() => {
    client.getPortfolioStatus().then(setRollup).catch(() => setRollup(null));
    fetchAttentionQueue()
      .then((data) => {
        setAttentionItems(data.items.slice(0, 5));
        setPortfolioClear(data.portfolioClear);
      })
      .catch((err) => setAttentionError(err instanceof Error ? err.message : "Attention queue unavailable"));
  }, []);

  if (!rollup) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>RareCrest Portfolio</Text>
        <Text style={styles.subtitle}>Loading or no data…</Text>
      </View>
    );
  }

  if (rollup.summary.totalEntities === 0) {
    return (
      <ScrollView style={styles.container}>
        <Text style={styles.title}>RareCrest Portfolio</Text>
        <Text style={styles.empty}>Register your first entity to begin.</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Portfolio Status</Text>
      <Text style={styles.subtitle}>
        {rollup.summary.portfolioClear
          ? "Portfolio clear"
          : `${rollup.summary.attentionFlagCount} attention flags`}
      </Text>

      <Text style={styles.sectionHeading}>Top attention items</Text>
      {attentionError && <Text style={styles.locked}>{attentionError}</Text>}
      {!attentionError && attentionItems.length === 0 && (
        <Text style={styles.empty}>{portfolioClear ? "Portfolio clear — nothing needs attention." : "Loading…"}</Text>
      )}
      {attentionItems.map((item) => (
        <View key={item.id} style={[styles.card, styles.attentionCard, severityStyle(item.severity)]}>
          <Text style={styles.attentionSeverity}>{item.severity.toUpperCase()}</Text>
          <Text style={styles.name}>{item.message}</Text>
          <Text style={styles.meta}>
            {item.entityName ?? item.entityId} · {item.kind}
          </Text>
        </View>
      ))}

      <Text style={styles.sectionHeading}>Entities</Text>
      {rollup.entities.map((entity) => (
        <Pressable key={entity.id} style={[styles.card, entity.attentionFlagCount > 0 && styles.cardFlagged]}>
          {entity.isHoldingEntity && <Text style={styles.holdingBadge}>HOLDING</Text>}
          <Text style={styles.name}>{entity.name}</Text>
          <Text style={styles.meta}>
            {entity.vertical} · {entity.band} · {entity.governanceStatus}
          </Text>
          <Text style={styles.summary}>{entity.stateSummary}</Text>
          {entity.deploymentLocked && <Text style={styles.locked}>Deployment locked</Text>}
        </Pressable>
      ))}
    </ScrollView>
  );
}

function severityStyle(severity: AttentionQueueItem["severity"]) {
  switch (severity) {
    case "critical":
      return styles.severityCritical;
    case "high":
      return styles.severityHigh;
    case "medium":
      return styles.severityMedium;
    default:
      return styles.severityLow;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#0f1117" },
  title: { fontSize: 24, fontWeight: "bold", color: "#e8eaed", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "#888", marginBottom: 16 },
  sectionHeading: { fontSize: 16, fontWeight: "600", color: "#c8cdd6", marginTop: 8, marginBottom: 8 },
  empty: { color: "#888", marginTop: 8, textAlign: "center" },
  card: { backgroundColor: "#1a1d26", padding: 12, borderRadius: 8, marginBottom: 8 },
  cardFlagged: { borderLeftWidth: 3, borderLeftColor: "#f87171" },
  attentionCard: { borderLeftWidth: 3 },
  severityCritical: { borderLeftColor: "#f87171" },
  severityHigh: { borderLeftColor: "#fb923c" },
  severityMedium: { borderLeftColor: "#fbbf24" },
  severityLow: { borderLeftColor: "#4ade80" },
  attentionSeverity: { color: "#9aa3b2", fontSize: 10, fontWeight: "700", marginBottom: 4 },
  holdingBadge: { color: "#7c5cff", fontSize: 10, fontWeight: "700", marginBottom: 4 },
  name: { fontSize: 16, fontWeight: "600", color: "#e8eaed" },
  meta: { fontSize: 13, color: "#888", marginTop: 4 },
  summary: { fontSize: 13, color: "#4a9eff", marginTop: 4 },
  locked: { fontSize: 12, color: "#f87171", marginTop: 4 },
});
