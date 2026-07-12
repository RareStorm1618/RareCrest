import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertPrivateDeploymentOrDie,
  corsOriginOption,
  isLoopbackHost,
  readInternalServiceToken,
  requireInternalServiceTokenOrDie,
} from "./fortress.js";

describe("fortress posture", () => {
  afterEach(() => {
    process.env.AUTH_TRUST_MODE = "dev";
    delete process.env.CORS_ALLOWED_ORIGINS;
    delete process.env.INTERNAL_SERVICE_TOKEN;
    delete process.env.INTERNAL_SERVICE_TOKEN_FILE;
  });

  it("allows loopback without strict", () => {
    process.env.AUTH_TRUST_MODE = "dev";
    delete process.env.CORS_ALLOWED_ORIGINS;
    expect(() => assertPrivateDeploymentOrDie("127.0.0.1")).not.toThrow();
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(corsOriginOption("127.0.0.1")).toBe(true);
  });

  it("refuses non-loopback without strict+CORS", () => {
    process.env.AUTH_TRUST_MODE = "dev";
    delete process.env.CORS_ALLOWED_ORIGINS;
    expect(() => assertPrivateDeploymentOrDie("0.0.0.0")).toThrow(/Private Canon Fortress/);
  });

  it("refuses non-loopback with strict+CORS but no INTERNAL_SERVICE_TOKEN", () => {
    process.env.AUTH_TRUST_MODE = "strict";
    process.env.CORS_ALLOWED_ORIGINS = "http://192.168.1.10:5173";
    delete process.env.INTERNAL_SERVICE_TOKEN;
    expect(() => assertPrivateDeploymentOrDie("0.0.0.0")).toThrow(/INTERNAL_SERVICE_TOKEN/);
  });

  it("allows non-loopback with strict, CORS allowlist, and INTERNAL_SERVICE_TOKEN", () => {
    process.env.AUTH_TRUST_MODE = "strict";
    process.env.CORS_ALLOWED_ORIGINS = "http://192.168.1.10:5173,http://10.0.0.2:5173";
    process.env.INTERNAL_SERVICE_TOKEN = "test-token";
    expect(() => assertPrivateDeploymentOrDie("0.0.0.0")).not.toThrow();
    expect(corsOriginOption("0.0.0.0")).toEqual([
      "http://192.168.1.10:5173",
      "http://10.0.0.2:5173",
    ]);
  });

  it("requires INTERNAL_SERVICE_TOKEN on loopback when AUTH_TRUST_MODE=strict", () => {
    process.env.AUTH_TRUST_MODE = "strict";
    delete process.env.INTERNAL_SERVICE_TOKEN;
    expect(() => requireInternalServiceTokenOrDie("127.0.0.1")).toThrow(/INTERNAL_SERVICE_TOKEN/);
    process.env.INTERNAL_SERVICE_TOKEN = "test-token";
    expect(() => requireInternalServiceTokenOrDie("127.0.0.1")).not.toThrow();
  });

  it("does not require INTERNAL_SERVICE_TOKEN on loopback in dev mode", () => {
    process.env.AUTH_TRUST_MODE = "dev";
    delete process.env.INTERNAL_SERVICE_TOKEN;
    expect(() => requireInternalServiceTokenOrDie("127.0.0.1")).not.toThrow();
  });

  it("reads INTERNAL_SERVICE_TOKEN from *_FILE when present", () => {
    const file = join(tmpdir(), `internal-token-${Date.now()}.txt`);
    writeFileSync(file, "file-token\n");
    process.env.INTERNAL_SERVICE_TOKEN_FILE = file;
    expect(readInternalServiceToken()).toBe("file-token");
    unlinkSync(file);
  });
});
