import { SkillCompanionView } from "./SkillCompanionView.js";

interface CompanionPageProps {
  entityId: string;
  entityName: string;
  apiBase: string;
  headers: Record<string, string>;
  band?: string | null;
  governanceStatus?: string | null;
  attentionFlagCount?: number;
  clearForAgentDeployment?: boolean;
}

export function CompanionPage({
  entityId,
  entityName,
  apiBase,
  headers,
  band,
  governanceStatus,
  attentionFlagCount,
  clearForAgentDeployment,
}: CompanionPageProps) {
  return (
    <section className="companion-page" data-testid="companion-page">
      <header className="page-header">
        <h2>Skill Companion</h2>
        <p>
          Framing-guarded, streaming, canon-grounded guidance for <strong>{entityName}</strong>.
          Server owns verdicts; this surface has zero authority.
        </p>
      </header>
      <SkillCompanionView
        entityId={entityId}
        entityName={entityName}
        apiBase={apiBase}
        headers={headers}
        band={band}
        governanceStatus={governanceStatus}
        attentionFlagCount={attentionFlagCount}
        clearForAgentDeployment={clearForAgentDeployment}
      />
    </section>
  );
}
