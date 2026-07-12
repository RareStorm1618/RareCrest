import { useEffect, useMemo, useState } from "react";
import type { PortfolioRollup } from "@rarecrest/contracts";
import { navigate, type AppRoute } from "../lib/routing.js";
import { rememberEntity } from "../lib/entity-memory.js";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  rollup: PortfolioRollup | null;
  currentRoute: AppRoute;
}

interface CommandItem {
  id: string;
  label: string;
  hint: string;
  run: () => void;
}

export function CommandPalette({ open, onClose, rollup, currentRoute }: CommandPaletteProps) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (open) onClose();
        else document.dispatchEvent(new CustomEvent("rarecrest:open-palette"));
      }
      if (event.key === "Escape" && open) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const commands = useMemo(() => {
    const items: CommandItem[] = [
      {
        id: "portfolio",
        label: "Go to Portfolio",
        hint: "Holding roll-up",
        run: () => navigate({ name: "portfolio" }),
      },
    ];

    const entityId = currentRoute.name === "portfolio" ? null : currentRoute.entityId;
    if (entityId) {
      for (const section of ["diagnostics", "design", "migration", "companion"] as const) {
        items.push({
          id: `section-${section}`,
          label: `Open ${section}`,
          hint: "Current entity",
          run: () => navigate({ name: section, entityId }),
        });
      }
    }

    for (const entity of rollup?.entities ?? []) {
      items.push({
        id: `entity-${entity.id}`,
        label: entity.name,
        hint: `${entity.vertical} · ${entity.band} · ${entity.governanceStatus}`,
        run: () => {
          rememberEntity({ id: entity.id, name: entity.name });
          navigate({ name: "diagnostics", entityId: entity.id });
        },
      });
      items.push({
        id: `companion-${entity.id}`,
        label: `Ask Companion about ${entity.name}`,
        hint: "Framing-guarded guidance",
        run: () => {
          rememberEntity({ id: entity.id, name: entity.name });
          navigate({ name: "companion", entityId: entity.id });
        },
      });
    }

    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 12);
    return items.filter(
      (item) => item.label.toLowerCase().includes(q) || item.hint.toLowerCase().includes(q),
    );
  }, [rollup, currentRoute, query]);

  if (!open) return null;

  return (
    <div className="command-palette-backdrop" role="presentation" onClick={onClose}>
      <div
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Director command palette"
        data-testid="command-palette"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Jump to entity, companion, or surface…"
          aria-label="Command search"
        />
        <ul>
          {commands.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => {
                  item.run();
                  onClose();
                }}
              >
                <span>{item.label}</span>
                <small>{item.hint}</small>
              </button>
            </li>
          ))}
          {commands.length === 0 && <li className="empty">No matches</li>}
        </ul>
        <p className="palette-hint">
          <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd> toggle · server owns state
        </p>
      </div>
    </div>
  );
}
