import { useState, type FormEvent } from "react";
import { ENTITY_TYPES } from "@rarecrest/portfolio";
import type { EntityType, VerticalKey } from "@rarecrest/contracts";

interface EntityRegisterPanelProps {
  apiBase: string;
  headers: Record<string, string>;
  onRegistered: () => void;
}

const VERTICALS: VerticalKey[] = ["rarestorm", "rareangels", "rareedge", "hopecoin", "healkids", "holding"];

export function EntityRegisterPanel({ apiBase, headers, onRegistered }: EntityRegisterPanelProps) {
  const [name, setName] = useState("");
  const [vertical, setVertical] = useState<VerticalKey>("holding");
  const [entityType, setEntityType] = useState<EntityType>("nonprofit");
  const [tenancyKey, setTenancyKey] = useState("");
  const [isHoldingEntity, setIsHoldingEntity] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [fromEntityId, setFromEntityId] = useState("");
  const [toEntityId, setToEntityId] = useState("");
  const [relationshipType, setRelationshipType] = useState("");

  const jsonHeaders = { ...headers, "Content-Type": "application/json" };

  const registerEntity = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !tenancyKey.trim()) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/portfolio/entities`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          name: name.trim(),
          vertical,
          tenancyKey: tenancyKey.trim(),
          entityType,
          isHoldingEntity,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? "Register entity failed");
      }
      const created = (await res.json()) as { name: string };
      setStatus(`Registered ${created.name}`);
      setName("");
      setTenancyKey("");
      setIsHoldingEntity(false);
      onRegistered();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Register entity failed");
    } finally {
      setBusy(false);
    }
  };

  const addRelationship = async (event: FormEvent) => {
    event.preventDefault();
    if (!fromEntityId.trim() || !toEntityId.trim() || !relationshipType.trim()) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/portfolio/relationships`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          fromEntityId: fromEntityId.trim(),
          toEntityId: toEntityId.trim(),
          relationshipType: relationshipType.trim(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? "Add relationship failed");
      }
      setStatus("Relationship recorded");
      setFromEntityId("");
      setToEntityId("");
      setRelationshipType("");
      onRegistered();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Add relationship failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="entity-register-panel" data-testid="entity-register-panel">
      <h3>Register entity</h3>
      <form className="entity-register-form" onSubmit={registerEntity}>
        <label>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            placeholder="Entity legal name"
          />
        </label>
        <label>
          Vertical
          <select value={vertical} onChange={(e) => setVertical(e.target.value as VerticalKey)} disabled={busy}>
            {VERTICALS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Entity type
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value as EntityType)}
            disabled={busy}
          >
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tenancy key
          <input
            value={tenancyKey}
            onChange={(e) => setTenancyKey(e.target.value)}
            disabled={busy}
            placeholder="Unique tenancy key"
          />
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={isHoldingEntity}
            onChange={(e) => setIsHoldingEntity(e.target.checked)}
            disabled={busy}
          />
          Holding entity
        </label>
        <button type="submit" disabled={busy || !name.trim() || !tenancyKey.trim()}>
          Register entity
        </button>
      </form>

      <h3>Add relationship</h3>
      <form className="entity-register-form" onSubmit={addRelationship}>
        <label>
          From entity ID
          <input
            value={fromEntityId}
            onChange={(e) => setFromEntityId(e.target.value)}
            disabled={busy}
            placeholder="UUID"
          />
        </label>
        <label>
          To entity ID
          <input
            value={toEntityId}
            onChange={(e) => setToEntityId(e.target.value)}
            disabled={busy}
            placeholder="UUID"
          />
        </label>
        <label>
          Relationship type
          <input
            value={relationshipType}
            onChange={(e) => setRelationshipType(e.target.value)}
            disabled={busy}
            placeholder="e.g. subsidiary_of"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !fromEntityId.trim() || !toEntityId.trim() || !relationshipType.trim()}
        >
          Add relationship
        </button>
      </form>

      {status && <p className="wiki-status">{status}</p>}
      {error && (
        <p className="wiki-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
