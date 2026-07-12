import { useCallback, useEffect, useState } from "react";
import { ENTITY_TYPES, type RegulatoryProfileView } from "@rarecrest/portfolio";
import type { EntityType } from "@rarecrest/contracts";

interface RegulatoryProfilePanelProps {
  entityId: string;
  apiBase: string;
  headers: Record<string, string>;
}

export function RegulatoryProfilePanel({ entityId, apiBase, headers }: RegulatoryProfilePanelProps) {
  const [profile, setProfile] = useState<RegulatoryProfileView | null>(null);
  const [newRegime, setNewRegime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`${apiBase}/api/v1/entities/${entityId}/regulatory-profile`, { headers });
    if (!res.ok) throw new Error("Failed to load regulatory profile");
    setProfile(await res.json());
  }, [apiBase, entityId, headers]);

  useEffect(() => {
    load().catch((e) => setError((e as Error).message));
  }, [load]);

  const setType = async (entityType: EntityType) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/entities/${entityId}/entity-type`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ entityType }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? "Set type failed");
      }
      setProfile(await res.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const addRegime = async () => {
    if (!newRegime.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/entities/${entityId}/regulatory-profile/regimes`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ regime: newRegime.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? "Add regime failed");
      }
      setProfile(await res.json());
      setNewRegime("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const removeRegime = async (regime: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `${apiBase}/api/v1/entities/${entityId}/regulatory-profile/regimes/${encodeURIComponent(regime)}`,
        { method: "DELETE", headers },
      );
      if (!res.ok) throw new Error("Remove regime failed");
      setProfile(await res.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!profile && !error) return <p>Loading regulatory profile…</p>;

  return (
    <section className="regulatory-profile-panel" data-testid="regulatory-profile">
      <h3>Regulatory profile</h3>
      {profile?.incomplete && (
        <p className="profile-incomplete" role="alert">
          Regulatory profile incomplete — set entity type to attach default regimes.
        </p>
      )}
      {profile?.holdingCrossCutting && (
        <p className="holding-note">Holding entity — cross-cutting hard rules and shared agentic stack.</p>
      )}
      <label>
        Entity type
        <select
          value={profile?.entityType ?? ""}
          disabled={busy}
          onChange={(e) => setType(e.target.value as EntityType)}
        >
          <option value="">— unset —</option>
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
          ))}
        </select>
      </label>
      <ul className="regime-list">
        {profile?.regimes.map((regime) => (
          <li key={regime}>
            {regime}
            <button type="button" onClick={() => removeRegime(regime)} disabled={busy}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <div className="add-regime">
        <input
          placeholder="Add regime"
          value={newRegime}
          onChange={(e) => setNewRegime(e.target.value)}
          disabled={busy || profile?.incomplete}
        />
        <button type="button" onClick={addRegime} disabled={busy || profile?.incomplete}>
          Add regime
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
