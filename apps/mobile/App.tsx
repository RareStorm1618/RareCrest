import { useEffect, useState } from "react";
import { StyleSheet, Text, View, ScrollView } from "react-native";
import { RareCrestApiClient } from "@rarecrest/api-client";
import type { EntityState } from "@rarecrest/contracts";

const client = new RareCrestApiClient({
  baseUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000",
  getHeaders: () => ({
    "x-user-id": "director-1",
    "x-vertical": "rarestorm",
  }),
});

export default function App() {
  const [entities, setEntities] = useState<EntityState[]>([]);

  useEffect(() => {
    client.listEntities().then(setEntities).catch(() => setEntities([]));
  }, []);

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>RareCrest Portfolio</Text>
      <Text style={styles.subtitle}>Mobile status view — read-only</Text>
      {entities.map((e) => (
        <View key={e.id} style={styles.card}>
          <Text style={styles.name}>{e.name}</Text>
          <Text>{e.vertical} · {e.mode}/{e.band}</Text>
        </View>
      ))}
      {entities.length === 0 && <Text>No entities loaded</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#0f1117" },
  title: { fontSize: 24, fontWeight: "bold", color: "#e8eaed", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "#888", marginBottom: 16 },
  card: { backgroundColor: "#1a1d26", padding: 12, borderRadius: 8, marginBottom: 8 },
  name: { fontSize: 16, fontWeight: "600", color: "#e8eaed" },
});
