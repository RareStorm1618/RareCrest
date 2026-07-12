import { AuthError, TenancyViolationError } from "./auth.js";
import { EntityAccessError } from "./tenancy.js";
import { StepLockedError } from "./services/diagnostics.js";

export interface RouteErrorResponse {
  status: number;
  body: Record<string, unknown>;
}

export function mapRouteError(err: unknown): RouteErrorResponse | null {
  if (err instanceof EntityAccessError) {
    return { status: err.statusCode, body: { message: err.message } };
  }
  if (err instanceof AuthError || err instanceof TenancyViolationError) {
    return { status: 403, body: { message: (err as Error).message } };
  }
  if (err instanceof StepLockedError) {
    return { status: 400, body: { message: err.message, field: "step", code: "STEP_LOCKED" } };
  }
  return null;
}
