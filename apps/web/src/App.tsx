import { useEffect, useMemo, useState } from "react";
import type { PortfolioRollup } from "@rarecrest/contracts";
import { DualTrackView, ZeroAuthorityShell } from "@rarecrest/ui";
import { API_BASE, API_HEADERS, createApiClient } from "./lib/api.js";
import { parseHash, navigate, type AppRoute } from "./lib/routing.js";
import { DirectorNav } from "./components/DirectorNav.js";
import { PortfolioStatusView } from "./components/PortfolioStatusView.js";
import { DiagnosticsWorkspace } from "./components/DiagnosticsWorkspace.js";
import { DesignStudioPage } from "./components/DesignStudioPage.js";
import { MigrationWorkspacePage } from "./components/MigrationWorkspacePage.js";
import { CompanionPage } from "./components/CompanionPage.js";

export function App() {
  const [route, setRoute] = useState<AppRoute>(() => parseHash(window.location.hash));
  const [rollup, setRollup] = useState<PortfolioRollup | null>(null);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState("loading");

  const client = useMemo(() => createApiClient(), []);

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    client.health().then((h) => setHealth(h.status)).catch(() => setHealth("down"));
    client
      .getPortfolioStatus()
      .then(setRollup)
      .catch(() => setRollup(null))
      .finally(() => setLoading(false));
  }, [client]);

  const entityId = route.name === "portfolio" ? null : route.entityId;
  const entityName =
    entityId && rollup
      ? (rollup.entities.find((entity) => entity.id === entityId)?.name ?? entityId)
      : null;

  const selectEntity = (id: string) => {
    navigate({ name: "diagnostics", entityId: id });
  };

  return (
    <ZeroAuthorityShell>
      <div className="shell-meta">
        <p className="api-health">API: {health}</p>
        <DirectorNav route={route} entityId={entityId} entityName={entityName} />
      </div>

      {route.name === "portfolio" && (
        <PortfolioStatusView rollup={rollup} loading={loading} onSelectEntity={selectEntity} />
      )}

      {route.name === "diagnostics" && (
        <DiagnosticsWorkspace
          entityId={route.entityId}
          entityName={entityName ?? route.entityId}
          apiBase={API_BASE}
          headers={API_HEADERS}
          onBack={() => navigate({ name: "portfolio" })}
        />
      )}

      {route.name === "design" && (
        <DesignStudioPage
          entityId={route.entityId}
          entityName={entityName ?? route.entityId}
          apiBase={API_BASE}
          headers={API_HEADERS}
        />
      )}

      {route.name === "migration" && (
        <MigrationWorkspacePage
          entityId={route.entityId}
          entityName={entityName ?? route.entityId}
          apiBase={API_BASE}
          headers={API_HEADERS}
        />
      )}

      {route.name === "companion" && (
        <CompanionPage
          entityId={route.entityId}
          entityName={entityName ?? route.entityId}
          apiBase={API_BASE}
          headers={API_HEADERS}
        />
      )}

      <DualTrackView
        title="Director Surface Contract"
        narrative="Client renders server-owned portfolio, diagnostics, design, migration, and companion state. Navigation is entity-scoped; hard rules and framing guards stay server-side."
        schemaPayload={{
          authority: "none",
          route: route.name,
          entityId,
          features: [
            "portfolio",
            "diagnostics",
            "design-studio",
            "migration-workspace",
            "skill-companion",
          ],
        }}
      />
    </ZeroAuthorityShell>
  );
}
