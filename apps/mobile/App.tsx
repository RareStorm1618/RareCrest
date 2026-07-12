import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { RareCrestApiClient } from "@rarecrest/api-client";
import type { PortfolioRollup } from "@rarecrest/contracts";
import {
  createDirectorApi,
  defaultSealMode,
  type AttentionQueueItem,
  type DirectorApi,
  type GovernanceQueue,
  type KillSwitchState,
} from "./src/director-api";

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
const API_HEADERS: Record<string, string> = {};
if (process.env.EXPO_PUBLIC_API_BEARER_TOKEN) {
  API_HEADERS.Authorization = `Bearer ${process.env.EXPO_PUBLIC_API_BEARER_TOKEN}`;
} else {
  API_HEADERS["x-user-id"] = "director-1";
  API_HEADERS["x-user-role"] = "director";
  API_HEADERS["x-vertical"] = "holding";
}

const portfolioClient = new RareCrestApiClient({
  baseUrl: API_BASE,
  getHeaders: () => API_HEADERS,
});

const directorApi: DirectorApi = createDirectorApi({
  baseUrl: API_BASE,
  headers: API_HEADERS,
});

export default function App() {
  const [rollup, setRollup] = useState<PortfolioRollup | null>(null);
  const [queue, setQueue] = useState<AttentionQueueItem[]>([]);
  const [portfolioClear, setPortfolioClear] = useState(true);
  const [governance, setGovernance] = useState<GovernanceQueue>({
    openSessions: [],
    readyForSeal: [],
    sealsDue: [],
  });
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [killSwitch, setKillSwitch] = useState<KillSwitchState | null>(null);
  const [killReason, setKillReason] = useState("Director mobile emergency action");

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [status, dash] = await Promise.all([
        portfolioClient.getPortfolioStatus(),
        directorApi.loadDashboard(),
      ]);
      setRollup(status);
      setQueue(dash.queue);
      setPortfolioClear(dash.portfolioClear);
      setGovernance(dash.governanceQueue);
      setSelectedEntityId((current) => current ?? status.entities[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load director console");
    }
  }, []);

  const refreshKillSwitch = useCallback(async (entityId: string | null) => {
    if (!entityId) {
      setKillSwitch(null);
      return;
    }
    try {
      setKillSwitch(await directorApi.getKillSwitch(entityId));
    } catch {
      setKillSwitch(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void refreshKillSwitch(selectedEntityId);
  }, [selectedEntityId, refreshKillSwitch]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    await refreshKillSwitch(selectedEntityId);
    setRefreshing(false);
  };

  const resolveItem = (item: AttentionQueueItem) => {
    Alert.alert("Resolve attention?", item.message, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Resolve",
        onPress: async () => {
          setBusyId(item.id);
          try {
            await directorApi.resolveAttention(item.entityId, item.id);
            await refresh();
          } catch (err) {
            Alert.alert("Resolve failed", err instanceof Error ? err.message : "Unknown error");
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  const sealSession = (session: GovernanceQueue["readyForSeal"][number]) => {
    const mode = defaultSealMode(session.stakeClass);
    Alert.alert(
      "Seal parliament session?",
      `${session.topic}\n${session.stakeClass} → ${mode}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: mode === "time_lock" ? "Time-lock seal" : "Seal now",
          onPress: async () => {
            setBusyId(session.id);
            try {
              await directorApi.sealParliament(session.id, session.stakeClass);
              await refresh();
            } catch (err) {
              Alert.alert("Seal failed", err instanceof Error ? err.message : "Unknown error");
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  };

  const runKill = (action: "arm" | "trigger" | "disarm") => {
    if (!selectedEntityId) return;
    const reason = killReason.trim();
    if (!reason) {
      Alert.alert("Reason required", "Enter a reason before kill-switch actions.");
      return;
    }
    const labels = {
      arm: "Arm kill switch",
      trigger: "TRIGGER kill switch",
      disarm: "Disarm kill switch",
    } as const;
    Alert.alert(labels[action], `Entity ${selectedEntityId}\n${reason}`, [
      { text: "Cancel", style: "cancel" },
      {
        text: action === "trigger" ? "Trigger" : action === "arm" ? "Arm" : "Disarm",
        style: action === "trigger" ? "destructive" : "default",
        onPress: async () => {
          setBusyId(`kill-${action}`);
          try {
            if (action === "arm") await directorApi.armKillSwitch(selectedEntityId, reason);
            else if (action === "trigger") await directorApi.triggerKillSwitch(selectedEntityId, reason);
            else await directorApi.disarmKillSwitch(selectedEntityId, reason);
            await refreshKillSwitch(selectedEntityId);
            await refresh();
          } catch (err) {
            Alert.alert("Kill-switch failed", err instanceof Error ? err.message : "Unknown error");
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  if (!rollup) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>RareCrest Director</Text>
        <Text style={styles.subtitle}>{error ?? "Loading…"}</Text>
      </View>
    );
  }

  const selected = rollup.entities.find((e) => e.id === selectedEntityId) ?? null;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e8eaed" />}
    >
      <Text style={styles.title}>Director Console</Text>
      <Text style={styles.subtitle}>
        {portfolioClear
          ? "Portfolio clear"
          : `${queue.length} open attention · ${governance.readyForSeal.length} ready to seal`}
      </Text>
      {error && <Text style={styles.error}>{error}</Text>}

      <Text style={styles.sectionHeading}>Attention</Text>
      {queue.length === 0 && <Text style={styles.empty}>Nothing needs attention.</Text>}
      {queue.map((item) => (
        <View key={item.id} style={[styles.card, styles.attentionCard, severityStyle(item.severity)]}>
          <Text style={styles.attentionSeverity}>{item.severity.toUpperCase()}</Text>
          <Text style={styles.name}>{item.message}</Text>
          <Text style={styles.meta}>
            {item.entityName ?? item.entityId} · {item.kind}
          </Text>
          <Pressable
            style={[styles.actionBtn, busyId === item.id && styles.actionBtnBusy]}
            disabled={busyId === item.id}
            onPress={() => resolveItem(item)}
          >
            <Text style={styles.actionBtnText}>{busyId === item.id ? "…" : "Resolve"}</Text>
          </Pressable>
        </View>
      ))}

      <Text style={styles.sectionHeading}>Governance — ready for seal</Text>
      {governance.readyForSeal.length === 0 && <Text style={styles.empty}>No sessions ready to seal.</Text>}
      {governance.readyForSeal.map((session) => (
        <View key={session.id} style={styles.card}>
          <Text style={styles.name}>{session.topic}</Text>
          <Text style={styles.meta}>
            {session.entityName} · {session.stakeClass} · {defaultSealMode(session.stakeClass)}
          </Text>
          <Pressable
            style={[styles.actionBtn, styles.sealBtn, busyId === session.id && styles.actionBtnBusy]}
            disabled={busyId === session.id}
            onPress={() => sealSession(session)}
          >
            <Text style={styles.actionBtnText}>{busyId === session.id ? "…" : "Seal"}</Text>
          </Pressable>
        </View>
      ))}

      {governance.sealsDue.length > 0 && (
        <>
          <Text style={styles.sectionHeading}>Seals due (time-lock)</Text>
          {governance.sealsDue.map((seal) => (
            <View key={seal.id} style={styles.card}>
              <Text style={styles.name}>{seal.entityName}</Text>
              <Text style={styles.meta}>due {new Date(seal.executeAfter).toLocaleString()}</Text>
            </View>
          ))}
        </>
      )}

      <Text style={styles.sectionHeading}>Emergency — kill switch</Text>
      <Text style={styles.hint}>Select an entity, enter a reason, then arm → trigger. Disarm requires a second actor in dual-control deployments.</Text>
      <TextInput
        style={styles.input}
        value={killReason}
        onChangeText={setKillReason}
        placeholder="Reason (required)"
        placeholderTextColor="#666"
      />
      {rollup.entities.map((entity) => (
        <Pressable
          key={entity.id}
          style={[styles.card, selectedEntityId === entity.id && styles.cardSelected]}
          onPress={() => setSelectedEntityId(entity.id)}
        >
          {entity.isHoldingEntity && <Text style={styles.holdingBadge}>HOLDING</Text>}
          <Text style={styles.name}>{entity.name}</Text>
          <Text style={styles.meta}>
            {entity.vertical} · {entity.band}
            {entity.deploymentLocked ? " · LOCKED" : ""}
          </Text>
        </Pressable>
      ))}
      {selected && (
        <View style={styles.emergencyPanel}>
          <Text style={styles.meta}>
            Selected: {selected.name}
            {killSwitch ? ` · state ${killSwitch.state}` : ""}
          </Text>
          <View style={styles.row}>
            <Pressable style={[styles.actionBtn, styles.warnBtn]} onPress={() => runKill("arm")}>
              <Text style={styles.actionBtnText}>Arm</Text>
            </Pressable>
            <Pressable style={[styles.actionBtn, styles.dangerBtn]} onPress={() => runKill("trigger")}>
              <Text style={styles.actionBtnText}>Trigger</Text>
            </Pressable>
            <Pressable style={[styles.actionBtn]} onPress={() => runKill("disarm")}>
              <Text style={styles.actionBtnText}>Disarm</Text>
            </Pressable>
          </View>
        </View>
      )}
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
  subtitle: { fontSize: 14, color: "#888", marginBottom: 12 },
  sectionHeading: { fontSize: 16, fontWeight: "600", color: "#c8cdd6", marginTop: 12, marginBottom: 8 },
  empty: { color: "#888", marginBottom: 8 },
  hint: { color: "#7a8494", fontSize: 12, marginBottom: 8, lineHeight: 18 },
  error: { color: "#f87171", marginBottom: 8 },
  card: { backgroundColor: "#1a1d26", padding: 12, borderRadius: 8, marginBottom: 8 },
  cardSelected: { borderWidth: 1, borderColor: "#7c5cff" },
  attentionCard: { borderLeftWidth: 3 },
  severityCritical: { borderLeftColor: "#f87171" },
  severityHigh: { borderLeftColor: "#fb923c" },
  severityMedium: { borderLeftColor: "#fbbf24" },
  severityLow: { borderLeftColor: "#4ade80" },
  attentionSeverity: { color: "#9aa3b2", fontSize: 10, fontWeight: "700", marginBottom: 4 },
  holdingBadge: { color: "#7c5cff", fontSize: 10, fontWeight: "700", marginBottom: 4 },
  name: { fontSize: 16, fontWeight: "600", color: "#e8eaed" },
  meta: { fontSize: 13, color: "#888", marginTop: 4 },
  input: {
    backgroundColor: "#1a1d26",
    borderRadius: 8,
    padding: 10,
    color: "#e8eaed",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#2a2f3a",
  },
  actionBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    backgroundColor: "#2a3344",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
  actionBtnBusy: { opacity: 0.5 },
  actionBtnText: { color: "#e8eaed", fontWeight: "600", fontSize: 13 },
  sealBtn: { backgroundColor: "#3d3160" },
  warnBtn: { backgroundColor: "#7c4a12" },
  dangerBtn: { backgroundColor: "#7f1d1d" },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 4 },
  emergencyPanel: { marginBottom: 24 },
});
