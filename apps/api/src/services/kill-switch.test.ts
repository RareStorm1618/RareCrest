import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { KillSwitchError, KillSwitchService } from "./kill-switch.js";
import type { DatabaseClient } from "@rarecrest/db";

describe("KillSwitchService dual-control", () => {
  beforeEach(() => {
    process.env.AUTH_TRUST_MODE = "strict";
  });
  afterEach(() => {
    delete process.env.AUTH_TRUST_MODE;
  });

  it("rejects same-actor trigger in strict mode", async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FROM rarecrest.kill_switches")) {
          return {
            rows: [
              {
                entityId: "e1",
                state: "armed",
                armedBy: "director-a",
                armedAt: "now",
                armedReason: "watch",
                triggeredBy: null,
                triggeredAt: null,
                triggeredReason: null,
              },
            ],
          };
        }
        return { rows: [], rowCount: 0 };
      }),
    } as unknown as DatabaseClient;

    const service = new KillSwitchService(db);
    await expect(
      service.trigger({ entityId: "e1", actorId: "director-a", reason: "halt" }),
    ).rejects.toBeInstanceOf(KillSwitchError);
  });

  it("allows different-actor trigger in strict mode", async () => {
    let state = "armed";
    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FROM rarecrest.kill_switches") && sql.includes("SELECT")) {
          return {
            rows: [
              {
                entityId: "e1",
                state,
                armedBy: "director-a",
                armedAt: "now",
                armedReason: "watch",
                triggeredBy: state === "triggered" ? "director-b" : null,
                triggeredAt: null,
                triggeredReason: null,
              },
            ],
          };
        }
        if (sql.startsWith("UPDATE rarecrest.kill_switches")) {
          state = "triggered";
          return { rows: [], rowCount: 1 };
        }
        if (sql.startsWith("UPDATE rarecrest.agent_roster")) {
          return { rows: [], rowCount: 2 };
        }
        return { rows: [], rowCount: 1 };
      }),
    } as unknown as DatabaseClient;

    const service = new KillSwitchService(db);
    const result = await service.trigger({
      entityId: "e1",
      actorId: "director-b",
      reason: "halt",
    });
    expect(result.dualControlOk).toBe(true);
    expect(result.agentsHalted).toBe(2);
  });
});
