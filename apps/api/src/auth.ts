import type { FastifyRequest } from "fastify";
import type { VerticalKey } from "@rarecrest/contracts";

export interface AuthContext {
  userId: string;
  vertical: VerticalKey;
  entityId?: string;
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext;
  }
}

export function extractAuth(request: FastifyRequest): AuthContext {
  const userId = request.headers["x-user-id"];
  const vertical = request.headers["x-vertical"];
  const entityId = request.headers["x-entity-id"];

  if (typeof userId !== "string" || !userId) {
    throw new AuthError("Missing x-user-id header");
  }
  if (typeof vertical !== "string" || !isValidVertical(vertical)) {
    throw new AuthError("Missing or invalid x-vertical header");
  }

  return {
    userId,
    vertical: vertical as VerticalKey,
    entityId: typeof entityId === "string" ? entityId : undefined,
  };
}

const VALID_VERTICALS: VerticalKey[] = [
  "rarestorm",
  "rareangels",
  "rareedge",
  "hopecoin",
  "healkids",
  "holding",
];

function isValidVertical(v: string): v is VerticalKey {
  return (VALID_VERTICALS as string[]).includes(v);
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
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

export class TenancyViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenancyViolationError";
  }
}
