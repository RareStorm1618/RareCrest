import { ShortcutAssessmentView } from "./ShortcutAssessmentView.js";
import { CapabilityAndAgencyView } from "./CapabilityAndAgencyView.js";
import { InversionChecklistView } from "./InversionChecklistView.js";
import { FromZeroWorkshop } from "./FromZeroWorkshop.js";

interface MigrationWorkspacePageProps {
  entityId: string;
  entityName: string;
  apiBase: string;
  headers: Record<string, string>;
}

export function MigrationWorkspacePage({
  entityId,
  entityName,
  apiBase,
  headers,
}: MigrationWorkspacePageProps) {
  return (
    <section className="migration-workspace-page" data-testid="migration-workspace-page">
      <header className="page-header">
        <h2>Migration Workspace</h2>
        <p>
          Vendor shortcut assessment, capability &amp; agency mapping, data-plane inversion, and
          from-zero workshop for <strong>{entityName}</strong>.
        </p>
      </header>
      <div className="tool-stack">
        <ShortcutAssessmentView entityId={entityId} apiBase={apiBase} headers={headers} />
        <CapabilityAndAgencyView entityId={entityId} apiBase={apiBase} headers={headers} />
        <InversionChecklistView apiBase={apiBase} headers={headers} />
        <FromZeroWorkshop apiBase={apiBase} headers={headers} />
      </div>
    </section>
  );
}
