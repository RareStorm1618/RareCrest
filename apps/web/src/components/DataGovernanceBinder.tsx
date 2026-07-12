import { useState } from "react";

interface DataGovernanceBinderProps {
  entityId: string;
  apiBase: string;
  headers: Record<string, string>;
}

export function DataGovernanceBinder({ entityId, apiBase, headers }: DataGovernanceBinderProps) {
  const [assetName, setAssetName] = useState("");
  const [sensitivity, setSensitivity] = useState("internal");
  const [encryptedAtRest, setEncryptedAtRest] = useState(true);
  const [assets, setAssets] = useState<
    Array<{ id: string; name: string; sensitivity: string; encryptedAtRest: boolean }>
  >([]);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const addAsset = () => {
    if (!assetName.trim()) return;
    setAssets((current) => [
      ...current,
      {
        id: `asset-${current.length + 1}`,
        name: assetName.trim(),
        sensitivity,
        encryptedAtRest,
      },
    ]);
    setAssetName("");
    setEncryptedAtRest(true);
  };

  const submit = async () => {
    setError(null);
    const res = await fetch(`${apiBase}/api/v1/design-studio/${entityId}/data-governance`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ assets }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError((body as { message?: string }).message ?? "Data governance binder failed");
      return;
    }
    setResult(body);
  };

  return (
    <section className="data-governance-binder" data-testid="data-governance-binder">
      <h3>Data Governance Binder</h3>
      <label>
        Asset name
        <input value={assetName} onChange={(event) => setAssetName(event.target.value)} />
      </label>
      <label>
        Sensitivity
        <select value={sensitivity} onChange={(event) => setSensitivity(event.target.value)}>
          <option value="public">public</option>
          <option value="internal">internal</option>
          <option value="restricted">restricted</option>
          <option value="phi">phi</option>
        </select>
      </label>
      <label>
        Encrypted at rest
        <input
          type="checkbox"
          checked={encryptedAtRest}
          onChange={(event) => setEncryptedAtRest(event.target.checked)}
        />
      </label>
      <button type="button" onClick={addAsset}>
        Add asset
      </button>
      <button type="button" onClick={submit} disabled={assets.length === 0}>
        Bind governance
      </button>
      {assets.length > 0 && <pre>{JSON.stringify(assets, null, 2)}</pre>}
      {result && <pre>{JSON.stringify(result, null, 2)}</pre>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
