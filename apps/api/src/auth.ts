import type { FastifyRequest } from "fastify";
import type { VerticalKey } from "@rarecrest/contracts";
import type { DatabaseClient } from "@rarecrest/db";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { TokenRevocationService } from "./services/token-revocation.js";

export type AuthMethod = "header" | "oidc";

export interface AuthContext {
  userId: string;
  vertical: VerticalKey;
  entityId?: string;
  role?: string;
  authMethod: AuthMethod;
  jti?: string;
  tokenIat?: number;
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext;
  }
}

const VALID_VERTICALS: VerticalKey[] = [
  "rarestorm",
  "rareangels",
  "rareedge",
  "hopecoin",
  "healkids",
  "holding",
];

export function isValidVertical(v: string): v is VerticalKey {
  return (VALID_VERTICALS as string[]).includes(v);
}

export function trustMode(): "dev" | "strict" {
  return (process.env.AUTH_TRUST_MODE ?? "dev").toLowerCase() === "strict" ? "strict" : "dev";
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export class TenancyViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenancyViolationError";
  }
}

/** Per-query tenancy enforcement — derive from auth, never client-supplied entity alone */
export function enforceTenancy(auth: AuthContext, requestedVertical: VerticalKey): void {
  if (auth.vertical !== requestedVertical) {
    throw new TenancyViolationError(
      `Cross-vertical access denied: auth=${auth.vertical}, requested=${requestedVertical}`,
    );
  }
}

function headerString(headers: Record<string, unknown>, name: string): string | undefined {
  const value = headers[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function bearerToken(headers: Record<string, unknown>): string | undefined {
  const auth = headerString(headers, "authorization") ?? headerString(headers, "Authorization");
  if (!auth) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  return match?.[1]?.trim() || undefined;
}

function claimString(payload: JWTPayload, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

let cachedJwks: ReturnType<typeof createRemoteJWKSet> | undefined;
let cachedJwksUrl: string | undefined;

function jwksFor(url: string) {
  if (cachedJwks && cachedJwksUrl === url) return cachedJwks;
  cachedJwksUrl = url;
  cachedJwks = createRemoteJWKSet(new URL(url));
  return cachedJwks;
}

/**
 * Verify Bearer JWT via OIDC JWKS and/or local HS256 secret (JWT_SECRET).
 * Claims: sub (user), vertical|https://rarecrest.ai/vertical, role|https://rarecrest.ai/role, jti
 */
export async function verifyOidcToken(token: string): Promise<AuthContext> {
  const issuer = process.env.OIDC_ISSUER;
  const audience = process.env.OIDC_AUDIENCE;
  const jwksUrl = process.env.OIDC_JWKS_URL;
  const hsSecret = process.env.JWT_SECRET;

  if (!jwksUrl && !hsSecret) {
    throw new AuthError("OIDC/JWT verification is not configured (set OIDC_JWKS_URL or JWT_SECRET)");
  }

  const verifyOpts: { issuer?: string; audience?: string | string[] } = {};
  if (issuer) verifyOpts.issuer = issuer;
  if (audience) verifyOpts.audience = audience;

  let payload: JWTPayload;
  try {
    if (jwksUrl) {
      const result = await jwtVerify(token, jwksFor(jwksUrl), verifyOpts);
      payload = result.payload;
    } else {
      const key = new TextEncoder().encode(hsSecret);
      const result = await jwtVerify(token, key, verifyOpts);
      payload = result.payload;
    }
  } catch (err) {
    throw new AuthError(`Invalid bearer token: ${(err as Error).message}`);
  }

  const userId = claimString(payload, "sub");
  if (!userId) throw new AuthError("Token missing sub claim");

  const verticalClaim =
    claimString(payload, "vertical", "https://rarecrest.ai/vertical") ??
    claimString(payload, "https://rarecrest.ai/claims/vertical");
  if (!verticalClaim || !isValidVertical(verticalClaim)) {
    throw new AuthError("Token missing or invalid vertical claim");
  }

  const role = claimString(payload, "role", "https://rarecrest.ai/role");
  const entityId = claimString(payload, "entity_id", "entityId", "https://rarecrest.ai/entity_id");
  const jti = claimString(payload, "jti");
  const tokenIat = typeof payload.iat === "number" ? payload.iat : undefined;

  if (trustMode() === "strict" && !jti) {
    throw new AuthError("Token missing jti claim — required for revocation in strict mode");
  }

  return {
    userId,
    vertical: verticalClaim,
    entityId,
    role,
    authMethod: "oidc",
    jti,
    tokenIat,
  };
}

/** Dev-only header shim. Never used when AUTH_TRUST_MODE=strict. */
export function extractAuthFromHeaders(headers: Record<string, unknown>): AuthContext {
  const userId = headerString(headers, "x-user-id");
  const vertical = headerString(headers, "x-vertical");
  const entityId = headerString(headers, "x-entity-id");
  const role = headerString(headers, "x-user-role");

  if (!userId) throw new AuthError("Missing x-user-id header");
  if (!vertical || !isValidVertical(vertical)) {
    throw new AuthError("Missing or invalid x-vertical header");
  }

  return {
    userId,
    vertical,
    entityId,
    role,
    authMethod: "header",
  };
}

export type ResolveAuthOptions = {
  db?: DatabaseClient;
};

/**
 * Resolve auth for a request.
 * - Bearer present → OIDC/JWT path (always), then denylist check when db provided
 * - AUTH_TRUST_MODE=strict → Bearer required (headers alone are rejected)
 * - AUTH_TRUST_MODE=dev → headers allowed for local demos
 */
export async function resolveAuth(
  request: FastifyRequest,
  options: ResolveAuthOptions = {},
): Promise<AuthContext> {
  const headers = request.headers as Record<string, unknown>;
  const token = bearerToken(headers);
  const mode = trustMode();

  let auth: AuthContext;
  if (token) {
    auth = await verifyOidcToken(token);
  } else if (mode === "strict") {
    throw new AuthError("Bearer token required when AUTH_TRUST_MODE=strict");
  } else {
    auth = extractAuthFromHeaders(headers);
  }

  if (options.db && auth.authMethod === "oidc") {
    const revocations = new TokenRevocationService(options.db);
    const check = await revocations.isRevoked({
      subject: auth.userId,
      jti: auth.jti,
      tokenIat: auth.tokenIat,
    });
    if (check.revoked) {
      throw new AuthError(`Token revoked: ${check.reason ?? "session invalidated"}`);
    }
  }

  return auth;
}

/** @deprecated Prefer resolveAuth — sync header-only helper for unit tests/dev. */
export function extractAuth(request: { headers: Record<string, unknown> }): AuthContext {
  if (trustMode() === "strict") {
    throw new AuthError("extractAuth is unavailable when AUTH_TRUST_MODE=strict; use resolveAuth");
  }
  return extractAuthFromHeaders(request.headers);
}
