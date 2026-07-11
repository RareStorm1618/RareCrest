import { useEffect, useState } from "react";
import { RareCrestApiClient } from "@rarecrest/api-client";
import type { EntityState } from "@rarecrest/contracts";
import { DualTrackView, FieldErrorDisplay, ZeroAuthorityShell } from "@rarecrest/ui";

const client = new RareCrestApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? "http://localhost:3000",
  getHeaders: () => ({
    "x-user-id": "director-1",
    "x-vertical": "rarestorm",
  }),
});

export function App() {
  const [entities, setEntities] = useState<EntityState[]>([]);
  const [error, setError] = useState<Array<{ field: string; code: string; message: string }>>([]);
  const [health, setHealth] = useState("loading");

  useEffect(() => {
    client.health().then((h) => setHealth(h.status)).catch(() => setHealth("down"));
    client.listEntities().then(setEntities).catch((e) => {
      if (e.fieldErrors) setError(e.fieldErrors);
    });
  }, []);

  return (
    <ZeroAuthorityShell>
      <section>
        <h2>Portfolio Status</h2>
        <p>API: {health}</p>
        <FieldErrorDisplay errors={error} />
        <ul>
          {entities.map((e) => (
            <li key={e.id}>{e.name} — {e.vertical} ({e.mode}/{e.band})</li>
          ))}
        </ul>
      </section>
      <DualTrackView
        title="Entity Overview"
        narrative="RareCrest director surface renders server-owned state. Hard rules enforced server-side."
        schemaPayload={{ authority: "none", surfaces: ["diagnostics", "design", "migration", "portfolio"] }}
      />
    </ZeroAuthorityShell>
  );
}
