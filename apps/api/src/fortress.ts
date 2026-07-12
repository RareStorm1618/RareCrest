import { readFileSync } from "node:fs";
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

/** Reads INTERNAL_SERVICE_TOKEN, or INTERNAL_SERVICE_TOKEN_FILE (Docker/K8s secrets pattern). */
export function readInternalServiceToken(): string | undefined {
  const filePath = process.env.INTERNAL_SERVICE_TOKEN_FILE;
  if (filePath) {
    try {
      const value = readFileSync(filePath, "utf8").trim();
      if (value.length > 0) return value;
    } catch {
      // fall through to direct env var
    }
  }
  const direct = process.env.INTERNAL_SERVICE_TOKEN;
  return direct && direct.length > 0 ? direct : undefined;
}

/**
 * Fail-closed internal RPC gate: non-loopback binds and strict trust mode both
 * require a non-empty INTERNAL_SERVICE_TOKEN (or _FILE) — no silent open RPC.
 */
export function requireInternalServiceTokenOrDie(host: string): void {
  const needsToken = !isLoopbackHost(host) || trustMode() === "strict";
  if (!needsToken) return;
  const token = readInternalServiceToken();
  if (!token) {
    throw new Error(
      "Private Canon Fortress refused to start: INTERNAL_SERVICE_TOKEN (or INTERNAL_SERVICE_TOKEN_FILE) " +
        "is required when API_HOST is not loopback or AUTH_TRUST_MODE=strict.",
    );
  }
}

/**
 * Fail-closed private deployment gate for LAN/VPN (and future private VPS).
 * Non-loopback binds require AUTH_TRUST_MODE=strict, an explicit CORS allowlist,
 * and a non-empty INTERNAL_SERVICE_TOKEN for internal RPC.
 */
export function assertPrivateDeploymentOrDie(host: string): void {
  if (isLoopbackHost(host)) {
    requireInternalServiceTokenOrDie(host);
    return;
  }

  const issues: string[] = [];
  if (trustMode() !== "strict") {
    issues.push("AUTH_TRUST_MODE must be 'strict' when API_HOST is not loopback");
  }
  const origins = parseCorsAllowlist();
  if (!origins || origins.length === 0) {
    issues.push("CORS_ALLOWED_ORIGINS must be set (comma-separated) when API_HOST is not loopback");
  }
  if (!readInternalServiceToken()) {
    issues.push(
      "INTERNAL_SERVICE_TOKEN (or INTERNAL_SERVICE_TOKEN_FILE) must be set when API_HOST is not loopback",
    );
  }
  if (issues.length > 0) {
    throw new Error(
      `Private Canon Fortress refused to start on ${host}:\n- ${issues.join("\n- ")}\n` +
        `Bind to 127.0.0.1 for local-only, or set strict auth + CORS + internal token for LAN/VPN/VPS.`,
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
