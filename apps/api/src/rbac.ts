/** Wave 4: multi-director RBAC action matrix — a single source of truth for role gates. */

export type AppRole =
  | "director"
  | "operator"
  | "compliance_officer"
  | "clinician"
  | "agent"
  | "human"
  | "admin";

export type GatedAction = "kill_switch" | "phi_decrypt" | "vault_package" | "promote" | "export";

const ACTION_ROLES: Record<GatedAction, ReadonlySet<AppRole>> = {
  kill_switch: new Set(["director", "operator", "admin"]),
  phi_decrypt: new Set(["director", "clinician", "compliance_officer"]),
  vault_package: new Set(["director"]),
  promote: new Set(["director", "admin"]),
  export: new Set(["director", "operator", "compliance_officer", "admin"]),
};

const KNOWN_ROLES = new Set<AppRole>([
  "director",
  "operator",
  "compliance_officer",
  "clinician",
  "agent",
  "human",
  "admin",
]);

export function isKnownAppRole(role: string | undefined): role is AppRole {
  return typeof role === "string" && KNOWN_ROLES.has(role as AppRole);
}

/**
 * Fail-closed action gate: unknown/missing roles are always denied. `isVerifiedDirector`
 * remains the stronger, trust-mode-aware check for cross-vertical director scope — callers
 * should combine both (`roleAllows(...) || isVerifiedDirector(...)`) rather than replace it.
 */
export function roleAllows(role: string | undefined, action: GatedAction): boolean {
  if (!role) return false;
  const allowed = ACTION_ROLES[action];
  return allowed.has(role as AppRole);
}
