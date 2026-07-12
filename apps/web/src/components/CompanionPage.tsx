import { SkillCompanionView } from "./SkillCompanionView.js";

interface CompanionPageProps {
  entityId: string;
  entityName: string;
  apiBase: string;
  headers: Record<string, string>;
}

export function CompanionPage({ entityId, entityName, apiBase, headers }: CompanionPageProps) {
  return (
    <section className="companion-page" data-testid="companion-page">
      <header className="page-header">
        <h2>Skill Companion</h2>
        <p>
          Framing-guarded, canon-grounded guidance for <strong>{entityName}</strong>. Server owns
          verdicts; this surface has zero authority.
        </p>
      </header>
      <SkillCompanionView entityId={entityId} apiBase={apiBase} headers={headers} />
    </section>
  );
}
