import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadSecret, requireSecret } from "./secrets.js";

describe("secrets loader", () => {
  const filePath = join(tmpdir(), `rarecrest-secret-${Date.now()}.txt`);

  beforeEach(() => {
    delete process.env.DEMO_SECRET;
    delete process.env.DEMO_SECRET_FILE;
  });

  afterEach(() => {
    delete process.env.DEMO_SECRET;
    delete process.env.DEMO_SECRET_FILE;
    try {
      unlinkSync(filePath);
    } catch {
      // ignore
    }
  });

  it("loads from env", () => {
    process.env.DEMO_SECRET = "from-env";
    expect(loadSecret("DEMO_SECRET")).toBe("from-env");
  });

  it("loads from *_FILE path", () => {
    writeFileSync(filePath, "from-file\n", "utf8");
    process.env.DEMO_SECRET_FILE = filePath;
    expect(loadSecret("DEMO_SECRET")).toBe("from-file");
  });

  it("requireSecret throws when missing", () => {
    expect(() => requireSecret("DEMO_SECRET")).toThrow(/Missing secret/);
  });
});
