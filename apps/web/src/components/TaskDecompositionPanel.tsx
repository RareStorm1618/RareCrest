import { useCallback, useState } from "react";
import { TASK_CATEGORIES, type TaskCategory } from "@rarecrest/diagnostics";

interface TaskDecompositionPanelProps {
  entityId: string;
  apiBase: string;
  headers: Record<string, string>;
}

interface TaskRow {
  id: string;
  title: string;
  category: TaskCategory;
  agentReadinessScore: number;
}

interface RoleRow {
  id: string;
  name: string;
  tasks: TaskRow[];
}

export function TaskDecompositionPanel({ entityId, apiBase, headers }: TaskDecompositionPanelProps) {
  const [functionName, setFunctionName] = useState("");
  const [roles, setRoles] = useState<RoleRow[]>([
    {
      id: "r1",
      name: "",
      tasks: [{ id: "t1", title: "", category: "pattern", agentReadinessScore: 3 }],
    },
  ]);
  const [matrixId, setMatrixId] = useState<string | null>(null);
  const [exportData, setExportData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const saveDraft = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = { functionName, roles };
      const url = matrixId
        ? `${apiBase}/api/v1/diagnostics/${entityId}/task-decomposition/${matrixId}`
        : `${apiBase}/api/v1/diagnostics/${entityId}/task-decomposition`;
      const res = await fetch(url, {
        method: matrixId ? "PATCH" : "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? "Save failed");
      }
      const data = await res.json();
      setMatrixId(data.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [apiBase, entityId, functionName, headers, matrixId, roles]);

  const completeAndExport = async () => {
    setBusy(true);
    setError(null);
    try {
      let id = matrixId;
      if (!id) {
        const payload = { functionName, roles };
        const res = await fetch(`${apiBase}/api/v1/diagnostics/${entityId}/task-decomposition`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { message?: string }).message ?? "Save failed");
        }
        const data = await res.json();
        id = data.id as string;
        setMatrixId(id);
      }
      const completeRes = await fetch(
        `${apiBase}/api/v1/diagnostics/${entityId}/task-decomposition/${id}/complete`,
        { method: "POST", headers },
      );
      if (!completeRes.ok) {
        const body = await completeRes.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? "Complete failed");
      }
      const exportRes = await fetch(
        `${apiBase}/api/v1/diagnostics/${entityId}/task-decomposition/${id}/export`,
        { headers },
      );
      if (!exportRes.ok) throw new Error("Export failed");
      setExportData(await exportRes.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="task-decomposition-panel" data-testid="task-decomposition">
      <h3>Task Decomposition Matrix</h3>
      <label>
        Function name
        <input value={functionName} onChange={(e) => setFunctionName(e.target.value)} />
      </label>
      {roles.map((role, ri) => (
        <fieldset key={role.id}>
          <legend>Role</legend>
          <input
            placeholder="Role name"
            value={role.name}
            onChange={(e) => {
              const next = [...roles];
              next[ri] = { ...role, name: e.target.value };
              setRoles(next);
            }}
          />
          {role.tasks.map((task, ti) => (
            <div key={task.id} className="task-row">
              <input
                placeholder="Task title"
                value={task.title}
                onChange={(e) => {
                  const next = [...roles];
                  const tasks = [...role.tasks];
                  tasks[ti] = { ...task, title: e.target.value };
                  next[ri] = { ...role, tasks };
                  setRoles(next);
                }}
              />
              <select
                value={task.category}
                onChange={(e) => {
                  const next = [...roles];
                  const tasks = [...role.tasks];
                  tasks[ti] = { ...task, category: e.target.value as TaskCategory };
                  next[ri] = { ...role, tasks };
                  setRoles(next);
                }}
              >
                {TASK_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                max={5}
                value={task.agentReadinessScore}
                onChange={(e) => {
                  const next = [...roles];
                  const tasks = [...role.tasks];
                  tasks[ti] = { ...task, agentReadinessScore: Number(e.target.value) };
                  next[ri] = { ...role, tasks };
                  setRoles(next);
                }}
              />
            </div>
          ))}
        </fieldset>
      ))}
      <div className="actions">
        <button type="button" onClick={saveDraft} disabled={busy}>Save matrix</button>
        <button type="button" onClick={completeAndExport} disabled={busy}>Complete &amp; export</button>
      </div>
      {exportData && (
        <pre className="export-preview" data-testid="task-decomposition-export">
          {JSON.stringify(exportData, null, 2)}
        </pre>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
