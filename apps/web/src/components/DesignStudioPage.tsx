import { PurposeProtocolEditor } from "./PurposeProtocolEditor.js";
import { DriveShapeScorecards } from "./DriveShapeScorecards.js";
import { IntelligenceStackModeler } from "./IntelligenceStackModeler.js";
import { AgentBlueprintForm } from "./AgentBlueprintForm.js";
import { DataGovernanceBinder } from "./DataGovernanceBinder.js";
import { DecisionTraceTemplateEditor } from "./DecisionTraceTemplateEditor.js";

interface DesignStudioPageProps {
  entityId: string;
  entityName: string;
  apiBase: string;
  headers: Record<string, string>;
}

export function DesignStudioPage({
  entityId,
  entityName,
  apiBase,
  headers,
}: DesignStudioPageProps) {
  return (
    <section className="design-studio-page" data-testid="design-studio-page">
      <header className="page-header">
        <h2>Design Studio</h2>
        <p>
          Purpose, DRIVE/SHAPE, intelligence stack, agent blueprint, data governance, and decision
          traces for <strong>{entityName}</strong>.
        </p>
      </header>
      <div className="tool-stack">
        <PurposeProtocolEditor entityId={entityId} apiBase={apiBase} headers={headers} />
        <DriveShapeScorecards entityId={entityId} apiBase={apiBase} headers={headers} />
        <IntelligenceStackModeler entityId={entityId} apiBase={apiBase} headers={headers} />
        <AgentBlueprintForm entityId={entityId} apiBase={apiBase} headers={headers} />
        <DataGovernanceBinder entityId={entityId} apiBase={apiBase} headers={headers} />
        <DecisionTraceTemplateEditor entityId={entityId} apiBase={apiBase} headers={headers} />
      </div>
    </section>
  );
}
