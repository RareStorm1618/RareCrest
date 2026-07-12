import { useState } from "react";
import { ResultCard } from "./ResultCard.js";

interface FromZeroWorkshopProps {
  apiBase: string;
  headers: Record<string, string>;
}

interface WorkshopWeek {
  week: number;
  track: string;
  ownerCount: number;
  objective: string;
}

export function FromZeroWorkshop({ apiBase, headers }: FromZeroWorkshopProps) {
  const [weeks, setWeeks] = useState(6);
  const [teamSize, setTeamSize] = useState(8);
  const [tracks, setTracks] = useState("strategy,platform,operations,controls");
  const [plan, setPlan] = useState<WorkshopWeek[]>([]);
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
      {plan.length > 0 && (
        <ResultCard
          title="From-Zero Workshop Plan"
          metrics={[
            { label: "Weeks", value: plan.length },
            { label: "Tracks", value: new Set(plan.map((p) => p.track)).size },
          ]}
          raw={plan}
        >
          <table className="from-zero-plan-table">
            <thead>
              <tr>
                <th>Week</th>
                <th>Track</th>
                <th>Owners</th>
                <th>Objective</th>
              </tr>
            </thead>
            <tbody>
              {plan.map((item) => (
                <tr key={item.week}>
                  <td>{item.week}</td>
                  <td>{item.track}</td>
                  <td>{item.ownerCount}</td>
                  <td>{item.objective}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResultCard>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
