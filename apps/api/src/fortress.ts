import { trustMode } from "./auth.js";

const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK.has(host.trim().toLowerCase());
}

export function parseCorsAllowlist(): string[] | null {
  const raw = process.env.CORS_ALLOWED_ORIGINS?.trim();
  if (!raw) return null;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Fail-closed private deployment gate for LAN/VPN (and future private VPS).
 * Non-loopback binds require AUTH_TRUST_MODE=strict and an explicit CORS allowlist.
 */
export function assertPrivateDeploymentOrDie(host: string): void {
  if (isLoopbackHost(host)) return;

  const issues: string[] = [];
  if (trustMode() !== "strict") {
    issues.push("AUTH_TRUST_MODE must be 'strict' when API_HOST is not loopback");
  }
  const origins = parseCorsAllowlist();
  if (!origins || origins.length === 0) {
    issues.push("CORS_ALLOWED_ORIGINS must be set (comma-separated) when API_HOST is not loopback");
  }
  if (issues.length > 0) {
    throw new Error(
      `Private Canon Fortress refused to start on ${host}:\n- ${issues.join("\n- ")}\n` +
        `Bind to 127.0.0.1 for local-only, or set strict auth + CORS for LAN/VPN/VPS.`,
    );
  }
}

export function corsOriginOption(host: string): true | string[] {
  if (isLoopbackHost(host)) {
    // Dev loopback: reflective CORS is acceptable
    return true;
  }
  return parseCorsAllowlist() ?? [];
}
