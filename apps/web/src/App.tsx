import { useEffect, useState } from "react";
import { RareCrestApiClient } from "@rarecrest/api-client";
import type { PortfolioRollup } from "@rarecrest/contracts";
import { DualTrackView, ZeroAuthorityShell } from "@rarecrest/ui";
import { PortfolioStatusView } from "./components/PortfolioStatusView.js";
import { DiagnosticsWorkspace } from "./components/DiagnosticsWorkspace.js";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
const API_HEADERS = {
  "x-user-id": "director-1",
  "x-user-role": "director",
  "x-vertical": "holding",
};

export function App() {
  const [rollup, setRollup] = useState<PortfolioRollup | null>(null);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState("loading");
  const [selectedEntity, setSelectedEntity] = useState<{ id: string; name: string } | null>(null);

  const client = new RareCrestApiClient({
    baseUrl: API_BASE,
    getHeaders: () => API_HEADERS,
  });

  useEffect(() => {
    client.health().then((h) => setHealth(h.status)).catch(() => setHealth("down"));
    client
      .getPortfolioStatus()
      .then(setRollup)
      .catch(() => setRollup(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <ZeroAuthorityShell>
      <p className="api-health">API: {health}</p>
      {selectedEntity ? (
        <DiagnosticsWorkspace
          entityId={selectedEntity.id}
          entityName={selectedEntity.name}
          apiBase={API_BASE}
          headers={API_HEADERS}
          onBack={() => setSelectedEntity(null)}
        />
      ) : (
        <PortfolioStatusView
          rollup={rollup}
          loading={loading}
          onSelectEntity={(id) => {
            const entity = rollup?.entities.find((e) => e.id === id);
            if (entity) setSelectedEntity({ id, name: entity.name });
          }}
        />
      )}
      <DualTrackView
        title="Director Surface"
        narrative="Portfolio roll-up shows every managed entity's readiness band, governance status, and attention flags. Hard rules enforced server-side."
        schemaPayload={{
          authority: "none",
          portfolioScope: "director",
          features: ["entity-portfolio", "roll-up", "attention-flags"],
        }}
      />
    </ZeroAuthorityShell>
  );
}
