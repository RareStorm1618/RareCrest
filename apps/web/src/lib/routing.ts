export type AppRoute =
  | { name: "portfolio" }
  | { name: "diagnostics"; entityId: string }
  | { name: "design"; entityId: string }
  | { name: "migration"; entityId: string }
  | { name: "companion"; entityId: string };

export function parseHash(hash: string): AppRoute {
  const path = hash.replace(/^#\/?/, "").replace(/\/$/, "");
  if (!path) return { name: "portfolio" };

  const parts = path.split("/");
  if (parts[0] === "entities" && parts[1]) {
    const entityId = parts[1];
    const section = parts[2] ?? "diagnostics";
    if (section === "design") return { name: "design", entityId };
    if (section === "migration") return { name: "migration", entityId };
    if (section === "companion") return { name: "companion", entityId };
    return { name: "diagnostics", entityId };
  }

  return { name: "portfolio" };
}

export function routeToHash(route: AppRoute): string {
  switch (route.name) {
    case "portfolio":
      return "#/";
    case "diagnostics":
      return `#/entities/${route.entityId}/diagnostics`;
    case "design":
      return `#/entities/${route.entityId}/design`;
    case "migration":
      return `#/entities/${route.entityId}/migration`;
    case "companion":
      return `#/entities/${route.entityId}/companion`;
  }
}

export function navigate(route: AppRoute): void {
  window.location.hash = routeToHash(route);
}
