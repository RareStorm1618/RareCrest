import { useEffect, useState } from "react";
import { RareCrestApiClient } from "@rarecrest/api-client";
import type { PortfolioRollup } from "@rarecrest/contracts";
import { DualTrackView, ZeroAuthorityShell } from "@rarecrest/ui";
import { PortfolioStatusView } from "./components/PortfolioStatusView.js";

const client = new RareCrestApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? "http://localhost:3000",
  getHeaders: () => ({
    "x-user-id": "director-1",
    "x-user-role": "director",
    "x-vertical": "holding",
  }),
});

export function App() {
  const [rollup, setRollup] = useState<PortfolioRollup | null>(null);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState("loading");
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
      <PortfolioStatusView
        rollup={rollup}
        loading={loading}
        onSelectEntity={setSelectedId}
      />
      {selectedId && (
        <p className="selected-entity">Selected entity: {selectedId}</p>
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
