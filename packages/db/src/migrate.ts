import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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
  loadDotEnv();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL required (set env or add it to repo-root .env)");
    process.exit(1);
  }
  const db = new DatabaseClient({ connectionString: url });
  const applied = await runMigrations(db);
  console.log(`Applied migrations: ${applied.join(", ") || "none (up to date)"}`);
  await db.close();
}

/** Load repo-root .env into process.env without overriding existing vars. */
function loadDotEnv(): void {
  const candidates = [
    join(process.cwd(), ".env"),
    join(process.cwd(), "..", "..", ".env"),
    join(__dirname, "..", "..", "..", ".env"),
  ];
  for (const path of candidates) {
    try {
      const text = readFileSync(path, "utf-8");
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (!(key in process.env)) process.env[key] = value;
      }
      return;
    } catch {
      // try next candidate
    }
  }
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
