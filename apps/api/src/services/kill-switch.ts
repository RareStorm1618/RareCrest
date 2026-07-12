import type { DatabaseClient } from "@rarecrest/db";
import type { GovernanceClient } from "@rarecrest/governance-client";
import { trustMode } from "../auth.js";

export type KillSwitchState = "idle" | "armed" | "triggered";

export interface KillSwitchRow {
  entityId: string;
  state: KillSwitchState;
  armedBy: string | null;
  armedAt: string | null;
  armedReason: string | null;
  triggeredBy: string | null;
  triggeredAt: string | null;
  triggeredReason: string | null;
}

export class KillSwitchService {
  constructor(
    private db: DatabaseClient,
    private governance?: GovernanceClient,
  ) {}

  async get(entityId: string): Promise<KillSwitchRow> {
    const result = await this.db.query(
      `SELECT entity_id AS "entityId", state, armed_by AS "armedBy", armed_at AS "armedAt",
              armed_reason AS "armedReason", triggered_by AS "triggeredBy",
              triggered_at AS "triggeredAt", triggered_reason AS "triggeredReason"
       FROM rarecrest.kill_switches WHERE entity_id = $1`,
      [entityId],
    );
    if (result.rows[0]) return result.rows[0] as KillSwitchRow;
    return {
      entityId,
      state: "idle",
      armedBy: null,
      armedAt: null,
      armedReason: null,
      triggeredBy: null,
      triggeredAt: null,
      triggeredReason: null,
    };
  }

  async arm(input: { entityId: string; actorId: string; reason: string }): Promise<KillSwitchRow> {
    const existing = await this.get(input.entityId);
    if (existing.state === "armed") {
      return existing;
    }
    await this.db.query(
      `INSERT INTO rarecrest.kill_switches
         (entity_id, state, armed_by, armed_at, armed_reason, updated_at)
       VALUES ($1, 'armed', $2, NOW(), $3, NOW())
       ON CONFLICT (entity_id) DO UPDATE SET
         state = 'armed',
         armed_by = EXCLUDED.armed_by,
         armed_at = NOW(),
         armed_reason = EXCLUDED.armed_reason,
         triggered_by = NULL,
         triggered_at = NULL,
         triggered_reason = NULL,
         updated_at = NOW()`,
      [input.entityId, input.actorId, input.reason],
    );
    await this.appendEvent(input.entityId, "arm", input.actorId, input.reason, "armed", false);
    try {
      await this.governance?.armKillSwitch({
        entityId: input.entityId,
        actorId: input.actorId,
        reason: input.reason,
      });
    } catch {
      // Durable store is source of truth; governance cache sync is best-effort.
    }
    return this.get(input.entityId);
  }

  /**
   * Dual-control: trigger actor must differ from armed_by unless AUTH_TRUST_MODE=dev.
   * On success, halts all agents for the entity.
   */
  async trigger(input: {
    entityId: string;
    actorId: string;
    reason: string;
  }): Promise<{ row: KillSwitchRow; dualControlOk: boolean; agentsHalted: number }> {
    const existing = await this.get(input.entityId);
    if (existing.state !== "armed" || !existing.armedBy) {
      throw new KillSwitchError("Kill switch is not armed", 400);
    }

    const dualControlOk = existing.armedBy !== input.actorId;
    if (!dualControlOk && trustMode() === "strict") {
      throw new KillSwitchError(
        "Dual-control required: trigger actor must differ from arm actor",
        403,
      );
    }

    await this.db.query(
      `UPDATE rarecrest.kill_switches
       SET state = 'triggered', triggered_by = $2, triggered_at = NOW(),
           triggered_reason = $3, updated_at = NOW()
       WHERE entity_id = $1`,
      [input.entityId, input.actorId, input.reason],
    );
    await this.appendEvent(
      input.entityId,
      "trigger",
      input.actorId,
      input.reason,
      "triggered",
      dualControlOk,
    );

    const halted = await this.db.query(
      `UPDATE rarecrest.agent_roster
       SET status = 'halted', health = 'critical', updated_at = NOW()
       WHERE entity_id = $1 AND status <> 'halted'`,
      [input.entityId],
    );

    try {
      await this.governance?.triggerKillSwitch({
        entityId: input.entityId,
        actorId: input.actorId,
        reason: input.reason,
      });
    } catch {
      // best-effort
    }

    return {
      row: await this.get(input.entityId),
      dualControlOk,
      agentsHalted: Number(halted.rowCount ?? halted.rows.length ?? 0),
    };
  }

  /**
   * Disarm resets the switch to idle. Dual-control in strict mode: the disarm actor
   * must differ from whoever triggered it (or armed it, if never triggered) — the
   * same human should not both pull and release the brake unwitnessed.
   */
  async disarm(input: { entityId: string; actorId: string; reason: string }): Promise<KillSwitchRow> {
    const existing = await this.get(input.entityId);
    if (existing.state === "idle") {
      return existing;
    }

    const conflictingActor = existing.state === "triggered" ? existing.triggeredBy : existing.armedBy;
    const dualControlOk = !conflictingActor || conflictingActor !== input.actorId;
    if (!dualControlOk && trustMode() === "strict") {
      throw new KillSwitchError(
        "Dual-control required: disarm actor must differ from the actor who armed/triggered",
        403,
      );
    }

    await this.db.query(
      `UPDATE rarecrest.kill_switches
       SET state = 'idle', armed_by = NULL, armed_at = NULL, armed_reason = NULL,
           triggered_by = NULL, triggered_at = NULL, triggered_reason = NULL, updated_at = NOW()
       WHERE entity_id = $1`,
      [input.entityId],
    );
    await this.appendEvent(input.entityId, "disarm", input.actorId, input.reason, "idle", dualControlOk);
    try {
      await this.governance?.disarmKillSwitch({
        entityId: input.entityId,
        actorId: input.actorId,
        reason: input.reason,
      });
    } catch {
      // Durable store is source of truth; governance cache sync is best-effort.
    }
    return this.get(input.entityId);
  }

  private async appendEvent(
    entityId: string,
    action: "arm" | "trigger" | "disarm",
    actorId: string,
    reason: string,
    stateAfter: string,
    dualControlOk: boolean,
  ) {
    await this.db.query(
      `INSERT INTO rarecrest.kill_switch_events
         (entity_id, action, actor_id, reason, state_after, dual_control_ok)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [entityId, action, actorId, reason, stateAfter, dualControlOk],
    );
  }
}

export class KillSwitchError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "KillSwitchError";
  }
}
