#!/usr/bin/env node
/** Cross-service smoke checks for CI and local stack verification */
import { spawn } from "node:child_process";
import { DatabaseClient } from "../packages/db/dist/index.js";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

async function checkDatabase() {
  const db = new DatabaseClient({ connectionString: DATABASE_URL });
  const healthy = await db.healthCheck();
  if (!healthy) throw new Error("database health check failed");

  const migrations = await db.query(
    "SELECT COUNT(*)::text AS count FROM rarecrest.schema_migrations",
  );
  const count = Number(migrations.rows[0]?.count ?? 0);
  if (count < 1) throw new Error(`expected migrations applied, found ${count}`);

  const entities = await db.query(
    "SELECT COUNT(*)::int AS count FROM rarecrest.entities WHERE deleted_at IS NULL",
  );
  console.log(`PASS database (${count} migrations, ${entities.rows[0]?.count ?? 0} entities)`);
  await db.close();
}

async function waitForHealth(url, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`timeout waiting for ${url}`);
}

async function checkGovernanceRpc() {
  const port = 3011;
  const bin = process.env.GOVERNANCE_BIN;
  const child = bin
    ? spawn(bin, [], {
        env: { ...process.env, GOVERNANCE_PORT: String(port) },
        stdio: "ignore",
      })
    : spawn("cargo", ["run", "-p", "governance-engine"], {
        env: { ...process.env, GOVERNANCE_PORT: String(port) },
        stdio: "ignore",
      });

  try {
    await waitForHealth(`http://127.0.0.1:${port}/health`);

    const verdict = await fetch(`http://127.0.0.1:${port}/rpc/hard-rule-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_id: "smoke-agent",
        entity_id: "00000000-0000-4000-8000-000000000099",
        vertical: "rareangels",
        requested_rights: ["sensitive_data"],
        touches_phi: false,
        touches_financial: false,
        encryption_layer_present: true,
      }),
    });
    if (!verdict.ok) throw new Error(`hard-rule-check ${verdict.status}`);
    const body = await verdict.json();
    if (!body.allowed) throw new Error("expected allowed hard-rule verdict in smoke test");
    console.log("PASS governance-engine RPC");
  } finally {
    child.kill("SIGTERM");
  }
}

async function main() {
  await checkDatabase();
  await checkGovernanceRpc();
  console.log("All stack smoke checks passed");
}

main().catch((err) => {
  console.error("FAIL stack smoke:", err.message);
  process.exit(1);
});
