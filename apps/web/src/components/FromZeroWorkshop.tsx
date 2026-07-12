import { useState } from "react";

interface FromZeroWorkshopProps {
  apiBase: string;
  headers: Record<string, string>;
}

export function FromZeroWorkshop({ apiBase, headers }: FromZeroWorkshopProps) {
  const [weeks, setWeeks] = useState(6);
  const [teamSize, setTeamSize] = useState(8);
  const [tracks, setTracks] = useState("strategy,platform,operations,controls");
  const [plan, setPlan] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/migration/from-zero/workshop`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          weeks,
          teamSize,
          tracks: tracks.split(",").map((value) => value.trim()).filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Failed to generate workshop");
      setPlan(data.plan ?? []);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section className="from-zero-workshop" data-testid="from-zero-workshop">
      <h3>From-Zero Workshop Builder</h3>
      <label>
        Weeks
        <input type="number" min={1} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} />
      </label>
      <label>
        Team size
        <input type="number" min={1} value={teamSize} onChange={(e) => setTeamSize(Number(e.target.value))} />
      </label>
      <label>
        Tracks (comma-separated)
        <input value={tracks} onChange={(e) => setTracks(e.target.value)} />
      </label>
      <button type="button" onClick={generate}>Generate plan</button>
      {plan.length > 0 && <pre>{JSON.stringify(plan, null, 2)}</pre>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
