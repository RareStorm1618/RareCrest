import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseClient } from "./client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "migrations");

function checksum(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function migrationChecksum(content: string): string {
  return checksum(content);
}

export function verifyMigrationChecksum(stored: string, content: string): boolean {
  return stored === checksum(content);
}

export async function runMigrations(db: DatabaseClient): Promise<string[]> {
  const applied: string[] = [];
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const version = file.replace(".sql", "");
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
    const digest = checksum(sql);
    const existing = await db.query<{ version: string; checksum: string }>(
      "SELECT version, checksum FROM rarecrest.schema_migrations WHERE version = $1",
      [version],
    );
    if (existing.rows.length > 0) {
      if (!verifyMigrationChecksum(existing.rows[0].checksum, sql)) {
        throw new Error(`Migration checksum mismatch for ${version}`);
      }
      continue;
    }

    await db.query("BEGIN");
    try {
      await db.query(sql);
      await db.query(
        "INSERT INTO rarecrest.schema_migrations (version, checksum) VALUES ($1, $2)",
        [version, digest],
      );
      await db.query("COMMIT");
      applied.push(version);
    } catch (err) {
      await db.query("ROLLBACK");
      throw err;
    }
  }
  return applied;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }
  const db = new DatabaseClient({ connectionString: url });
  const applied = await runMigrations(db);
  console.log(`Applied migrations: ${applied.join(", ") || "none (up to date)"}`);
  await db.close();
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
