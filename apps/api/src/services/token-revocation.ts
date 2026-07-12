import type { DatabaseClient } from "@rarecrest/db";

export interface RevocationInput {
  subject: string;
  jti?: string;
  revokedBy: string;
  reason: string;
  expiresAt?: string | null;
}

export class TokenRevocationService {
  constructor(private db: DatabaseClient) {}

  async revoke(input: RevocationInput): Promise<{ id: string }> {
    if (!input.jti && !input.subject) {
      throw new Error("jti or subject required");
    }
    const result = await this.db.query(
      `INSERT INTO rarecrest.token_revocations (jti, subject, revoked_by, reason, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        input.jti ?? null,
        input.subject,
        input.revokedBy,
        input.reason,
        input.expiresAt ?? null,
      ],
    );
    return { id: result.rows[0].id as string };
  }

  /** True when this exact jti is revoked, or the subject has a blanket revocation still in force. */
  async isRevoked(input: {
    subject: string;
    jti?: string;
    tokenIat?: number;
  }): Promise<{ revoked: boolean; reason?: string }> {
    if (input.jti) {
      const byJti = await this.db.query(
        `SELECT reason FROM rarecrest.token_revocations
         WHERE jti = $1
           AND (expires_at IS NULL OR expires_at > NOW())
         LIMIT 1`,
        [input.jti],
      );
      if (byJti.rows[0]) {
        return { revoked: true, reason: byJti.rows[0].reason as string };
      }
    }

    const bySubject = await this.db.query(
      `SELECT reason, created_at AS "createdAt"
       FROM rarecrest.token_revocations
       WHERE subject = $1 AND jti IS NULL
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at DESC
       LIMIT 1`,
      [input.subject],
    );
    if (bySubject.rows[0]) {
      const createdAt = new Date(bySubject.rows[0].createdAt as string).getTime() / 1000;
      // Blanket subject revocation invalidates tokens issued at or before revocation.
      if (input.tokenIat === undefined || input.tokenIat <= createdAt + 1) {
        return { revoked: true, reason: bySubject.rows[0].reason as string };
      }
    }

    return { revoked: false };
  }
}
