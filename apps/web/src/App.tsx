import { useEffect, useMemo, useState } from "react";
import type { PortfolioRollup } from "@rarecrest/contracts";
import { DualTrackView, ZeroAuthorityShell } from "@rarecrest/ui";
import { API_BASE, API_HEADERS, createApiClient } from "./lib/api.js";
import { parseHash, navigate, type AppRoute } from "./lib/routing.js";
import { rememberEntity, readRememberedEntity } from "./lib/entity-memory.js";
import { DirectorNav } from "./components/DirectorNav.js";
import { PortfolioStatusView } from "./components/PortfolioStatusView.js";
import { PortfolioBriefPanel } from "./components/PortfolioBriefPanel.js";
import { DiagnosticsWorkspace } from "./components/DiagnosticsWorkspace.js";
import { DesignStudioPage } from "./components/DesignStudioPage.js";
import { MigrationWorkspacePage } from "./components/MigrationWorkspacePage.js";
import { CompanionPage } from "./components/CompanionPage.js";
import { WikiPage } from "./components/WikiPage.js";
import { CommandPalette } from "./components/CommandPalette.js";

export function App() {
  const [route, setRoute] = useState<AppRoute>(() => parseHash(window.location.hash));
  const [rollup, setRollup] = useState<PortfolioRollup | null>(null);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState("loading");
  const [paletteOpen, setPaletteOpen] = useState(false);

  const client = useMemo(() => createApiClient(), []);

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash(window.location.hash));
    const onOpenPalette = () => setPaletteOpen(true);
    window.addEventListener("hashchange", onHashChange);
    document.addEventListener("rarecrest:open-palette", onOpenPalette);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      document.removeEventListener("rarecrest:open-palette", onOpenPalette);
    };
  }, []);

  useEffect(() => {
    client.health().then((h) => setHealth(h.status)).catch(() => setHealth("down"));
    client
      .getPortfolioStatus()
      .then((data) => {
        setRollup(data);
        if (parseHash(window.location.hash).name === "portfolio") {
          const remembered = readRememberedEntity();
          if (remembered && data.entities.some((entity) => entity.id === remembered.id)) {
            // keep portfolio as landing; remembered entity powers nav enablement via selection later
          }
        }
      })
      .catch(() => setRollup(null))
      .finally(() => setLoading(false));
  }, [client]);

  const entityId = route.name === "portfolio" ? null : route.entityId;
  const selectedEntity =
    entityId && rollup ? rollup.entities.find((entity) => entity.id === entityId) : undefined;
  const entityName = selectedEntity?.name ?? entityId;

  const selectEntity = (id: string) => {
    const entity = rollup?.entities.find((item) => item.id === id);
    if (entity) rememberEntity({ id: entity.id, name: entity.name });
    navigate({ name: "diagnostics", entityId: id });
  };

  return (
    <ZeroAuthorityShell>
      <div className="shell-meta">
        <div className="shell-top">
          <p className="api-health">API: {health}</p>
          <button type="button" className="palette-trigger" onClick={() => setPaletteOpen(true)}>
            Command <kbd>⌘K</kbd>
          </button>
        </div>
        <DirectorNav route={route} entityId={entityId} entityName={entityName} />
      </div>

      {route.name === "portfolio" && (
        <>
          {!loading && rollup && rollup.summary.totalEntities > 0 && (
            <PortfolioBriefPanel rollup={rollup} />
          )}
          <PortfolioStatusView rollup={rollup} loading={loading} onSelectEntity={selectEntity} />
        </>
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
          band={selectedEntity?.band}
          governanceStatus={selectedEntity?.governanceStatus}
          attentionFlagCount={selectedEntity?.attentionFlagCount}
          clearForAgentDeployment={selectedEntity?.clearForAgentDeployment}
        />
      )}

      {route.name === "wiki" && (
        <WikiPage
          entityId={route.entityId}
          entityName={entityName ?? route.entityId}
          vertical={selectedEntity?.vertical ?? "holding"}
          apiBase={API_BASE}
          headers={API_HEADERS}
        />
      )}

      <DualTrackView
        title="Director Surface Contract"
        narrative="Client renders server-owned portfolio, diagnostics, design, migration, companion, and wiki state. Streaming companion and portfolio briefs never grant deployment authority."
        schemaPayload={{
          authority: "none",
          route: route.name,
          entityId,
          features: [
            "portfolio-brief",
            "command-palette",
            "streaming-companion",
            "wiki-companion",
            "diagnostics",
            "design-studio",
            "migration-workspace",
          ],
        }}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        rollup={rollup}
        currentRoute={route}
      />
    </ZeroAuthorityShell>
  );
}
