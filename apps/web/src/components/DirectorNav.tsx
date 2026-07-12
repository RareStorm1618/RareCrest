import type { AppRoute } from "../lib/routing.js";
import { navigate } from "../lib/routing.js";

interface DirectorNavProps {
  route: AppRoute;
  entityId: string | null;
  entityName: string | null;
}

export function DirectorNav({ route, entityId, entityName }: DirectorNavProps) {
  const hasEntity = Boolean(entityId);

  return (
    <nav className="director-nav" aria-label="Director navigation">
      <button
        type="button"
        className={route.name === "portfolio" ? "active" : undefined}
        onClick={() => navigate({ name: "portfolio" })}
      >
        Portfolio
      </button>
      <button
        type="button"
        disabled={!hasEntity}
        className={route.name === "diagnostics" ? "active" : undefined}
        onClick={() => entityId && navigate({ name: "diagnostics", entityId })}
      >
        Diagnostics
      </button>
      <button
        type="button"
        disabled={!hasEntity}
        className={route.name === "design" ? "active" : undefined}
        onClick={() => entityId && navigate({ name: "design", entityId })}
      >
        Design Studio
      </button>
      <button
        type="button"
        disabled={!hasEntity}
        className={route.name === "migration" ? "active" : undefined}
        onClick={() => entityId && navigate({ name: "migration", entityId })}
      >
        Migration
      </button>
      <button
        type="button"
        disabled={!hasEntity}
        className={route.name === "companion" ? "active" : undefined}
        onClick={() => entityId && navigate({ name: "companion", entityId })}
      >
        Companion
      </button>
      {entityName && (
        <span className="nav-entity" data-testid="nav-entity-context">
          Entity: {entityName}
        </span>
      )}
    </nav>
  );
}
