import { describe, expect, it } from "vitest";
import {
  assembleBoardPack,
  buildMerkleRoot,
  computeMetricContentHash,
  computeTraceContentHash,
  verifyMetricChain,
  verifyTraceChain,
} from "./index.js";

describe("verifyTraceChain", () => {
  it("accepts an empty chain", () => {
    expect(verifyTraceChain([])).toEqual({ valid: true, checked: 0, headHash: null });
  });

  it("detects a tampered content hash", () => {
    const payload = { x: 1 };
    const hash = computeTraceContentHash("e1", "act", payload);
    const result = verifyTraceChain([
      {
        id: "t1",
        entityId: "e1",
        action: "act",
        payload,
        prevHash: null,
        contentHash: hash.slice(0, -1) + "0",
        createdAt: "2026-01-01T00:00:00Z",
      },
    ]);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("content_hash mismatch");
  });

  it("accepts a two-link valid chain", () => {
    const p1 = { a: 1 };
    const h1 = computeTraceContentHash("e1", "one", p1);
    const p2 = { a: 2 };
    const h2 = computeTraceContentHash("e1", "two", p2);
    const result = verifyTraceChain([
      {
        id: "t1",
        entityId: "e1",
        action: "one",
        payload: p1,
        prevHash: null,
        contentHash: h1,
        createdAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "t2",
        entityId: "e1",
        action: "two",
        payload: p2,
        prevHash: h1,
        contentHash: h2,
        createdAt: "2026-01-01T01:00:00Z",
      },
    ]);
    expect(result).toEqual({ valid: true, checked: 2, headHash: h2 });
  });
});

describe("verifyMetricChain / buildMerkleRoot", () => {
  it("chains metrics per key", () => {
    const m1 = {
      vertical: "rareedge",
      metricKey: "capital_routed_usd",
      value: 100,
      entityId: null as string | null,
      sourceRef: null as string | null,
      actorId: "director-1",
    };
    const h1 = computeMetricContentHash(m1);
    const m2 = { ...m1, value: 50 };
    const h2 = computeMetricContentHash(m2);
    expect(
      verifyMetricChain([
        {
          id: "1",
          metricKey: m1.metricKey,
          prevHash: null,
          contentHash: h1,
          vertical: m1.vertical,
          value: m1.value,
          entityId: m1.entityId,
          sourceRef: m1.sourceRef,
          actorId: m1.actorId,
        },
        {
          id: "2",
          metricKey: m2.metricKey,
          prevHash: h1,
          contentHash: h2,
          vertical: m2.vertical,
          value: m2.value,
          entityId: m2.entityId,
          sourceRef: m2.sourceRef,
          actorId: m2.actorId,
        },
      ]).valid,
    ).toBe(true);
  });

  it("builds a deterministic merkle root", () => {
    const a = buildMerkleRoot(["bb", "aa"]);
    const b = buildMerkleRoot(["aa", "bb"]);
    expect(a).toBe(b);
    expect(buildMerkleRoot([])).toHaveLength(64);
  });
});

describe("assembleBoardPack", () => {
  it("includes all LP evidence sections and a stable content hash", () => {
    const input = {
      windowDays: 30,
      northStar: {
        capitalRoutedUsd: 1000,
        healingHours: 10,
        familiesSupported: 2,
        donationPctBpsAvg: 500,
        dualMissionScore: 12.5,
      },
      parliament: {
        openSessions: 1,
        readyForSeal: 0,
        sealedInWindow: 1,
        recentSeals: [
          {
            sessionId: "s1",
            stakeClass: "activation",
            mode: "immediate",
            sealedAt: "2026-07-01T00:00:00Z",
            effectDigest: "abc123digest",
          },
        ],
      },
      killSwitches: [{ entityId: "e1", entityName: "Entity", state: "idle" }],
      attentionOpen: 3,
      federation: {
        acceptedInWindow: 2,
        rejectedInWindow: 0,
        recent: [
          {
            vertical: "rareedge",
            eventType: "heartbeat",
            status: "accepted",
            receivedAt: "2026-07-01T00:00:00Z",
          },
        ],
      },
      provenance: {
        latestRootId: "root-1",
        latestMerkleRoot: "deadbeef",
        latestRootAt: "2026-07-01T00:00:00Z",
        entityHeads: 1,
        metricHeads: 1,
      },
      traceVerifySample: [{ entityId: "e1", entityName: "Entity", valid: true, checked: 2 }],
    };
    const pack = assembleBoardPack(input);
    expect(pack.kind).toBe("board_pack");
    expect(pack.sections.map((s) => s.title)).toEqual([
      "North Star",
      "Parliament & seals",
      "Kill switches",
      "Attention",
      "Vertical federation",
      "Provenance root",
      "Decision-trace verify sample",
    ]);
    expect(pack.contentHash).toHaveLength(64);
    expect(assembleBoardPack(input).contentHash).toBe(pack.contentHash);
  });
});
