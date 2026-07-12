import { describe, expect, it } from "vitest";
import { tenancyWhereClause, softDeleteClause } from "./client.js";
import { migrationChecksum, verifyMigrationChecksum } from "./migrate.js";

describe("tenancy helpers (WO-3)", () => {
  it("builds vertical-scoped where clause", () => {
    const { clause, params } = tenancyWhereClause("rareangels");
    expect(clause).toContain("vertical = $1");
    expect(clause).toContain("deleted_at IS NULL");
    expect(params).toEqual(["rareangels"]);
  });

  it("supports table alias in soft delete clause", () => {
    expect(softDeleteClause("entities")).toBe("entities.deleted_at IS NULL");
  });
});

describe("migration checksum (WO-2)", () => {
  it("verifies stable checksum for migration content", () => {
    const sql = "CREATE TABLE demo (id UUID PRIMARY KEY);";
    const digest = migrationChecksum(sql);
    expect(verifyMigrationChecksum(digest, sql)).toBe(true);
    expect(verifyMigrationChecksum(digest, sql + " ")).toBe(false);
  });
});
