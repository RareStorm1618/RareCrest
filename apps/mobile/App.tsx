import { useEffect, useState } from "react";
import { StyleSheet, Text, View, ScrollView, Pressable } from "react-native";
import { RareCrestApiClient } from "@rarecrest/api-client";
import type { PortfolioRollup } from "@rarecrest/contracts";

const client = new RareCrestApiClient({
  baseUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000",
  getHeaders: () => {
    const bearer = process.env.EXPO_PUBLIC_API_BEARER_TOKEN;
    if (bearer) return { Authorization: `Bearer ${bearer}` };
    return {
      "x-user-id": "director-1",
      "x-user-role": "director",
      "x-vertical": "holding",
    };
  },
});

export default function App() {
  const [rollup, setRollup] = useState<PortfolioRollup | null>(null);

  useEffect(() => {
    client.getPortfolioStatus().then(setRollup).catch(() => setRollup(null));
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

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#0f1117" },
  title: { fontSize: 24, fontWeight: "bold", color: "#e8eaed", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "#888", marginBottom: 16 },
  empty: { color: "#888", marginTop: 32, textAlign: "center" },
  card: { backgroundColor: "#1a1d26", padding: 12, borderRadius: 8, marginBottom: 8 },
  cardFlagged: { borderLeftWidth: 3, borderLeftColor: "#f87171" },
  holdingBadge: { color: "#7c5cff", fontSize: 10, fontWeight: "700", marginBottom: 4 },
  name: { fontSize: 16, fontWeight: "600", color: "#e8eaed" },
  meta: { fontSize: 13, color: "#888", marginTop: 4 },
  summary: { fontSize: 13, color: "#4a9eff", marginTop: 4 },
  locked: { fontSize: 12, color: "#f87171", marginTop: 4 },
});
