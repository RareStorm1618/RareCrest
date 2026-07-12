import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import { z } from "zod";
import { formatZodErrors } from "../validation.js";
import { isVerifiedHumanOrDirector } from "../trust.js";
import { isValidVertical } from "../auth.js";
import {
  FederationAuthError,
  FederationValidationError,
  ingestFederationEvent,
  listFederationEvents,
} from "../services/vertical-federation.js";

function headerString(headers: Record<string, unknown>, name: string): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Vertical federation ingress — HMAC-authenticated webhooks from product
 * verticals into RareCrest SoR. Ingress routes intentionally do not use
 * director OIDC; signature + delivery-id are the trust boundary.
 */
export function registerFederationRoutes(app: FastifyInstance, db: DatabaseClient) {
  app.post("/api/v1/federation/ingress/:vertical", async (request, reply) => {
    const verticalParam = (request.params as { vertical: string }).vertical;
    if (!isValidVertical(verticalParam)) {
      return reply.status(400).send({ message: `Invalid vertical: ${verticalParam}` });
    }

    const headers = request.headers as Record<string, unknown>;
    const signature =
      headerString(headers, "x-rarecrest-signature") ??
      headerString(headers, "X-RareCrest-Signature");
    const timestamp =
      headerString(headers, "x-rarecrest-timestamp") ??
      headerString(headers, "X-RareCrest-Timestamp");
    const deliveryId =
      headerString(headers, "x-rarecrest-delivery-id") ??
      headerString(headers, "X-RareCrest-Delivery-Id");

    if (!signature || !timestamp || !deliveryId) {
      return reply.status(401).send({
        message:
          "Missing required federation headers: X-RareCrest-Signature, X-RareCrest-Timestamp, X-RareCrest-Delivery-Id",
      });
    }

    // Prefer raw body when Fastify preserved it; otherwise re-serialize parsed JSON.
    const withRaw = request as unknown as { rawBody?: string };
    const rawBody =
      typeof withRaw.rawBody === "string" ? withRaw.rawBody : JSON.stringify(request.body ?? {});

    try {
      const result = await ingestFederationEvent(db, {
        vertical: verticalParam,
        rawBody,
        timestamp,
        deliveryId,
        signatureHeader: signature,
      });
      if (result.event.status === "rejected") {
        return reply.status(422).send(result.event);
      }
      return reply.status(result.created ? 201 : 200).send(result.event);
    } catch (err) {
      if (err instanceof FederationAuthError) {
        return reply.status(err.statusCode).send({ message: err.message });
      }
      if (err instanceof FederationValidationError) {
        return reply.status(err.statusCode).send({ message: err.message });
      }
      throw err;
    }
  });

  app.get("/api/v1/federation/events", async (request, reply) => {
    if (!isVerifiedHumanOrDirector(request.auth, request.headers as Record<string, unknown>)) {
      return reply.status(403).send({
        message: "Listing federation events requires role=director or a verified human",
      });
    }
    const schema = z.object({
      vertical: z.string().min(1).max(50).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(25),
    });
    try {
      const query = schema.parse(request.query);
      if (query.vertical && !isValidVertical(query.vertical)) {
        return reply.status(400).send({ message: `Invalid vertical: ${query.vertical}` });
      }
      const events = await listFederationEvents(db, {
        vertical: query.vertical,
        limit: query.limit,
      });
      return reply.send({ events });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      throw err;
    }
  });
}
