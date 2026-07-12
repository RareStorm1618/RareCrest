import { describe, expect, it } from "vitest";
import { assertPrivateDeploymentOrDie, corsOriginOption, isLoopbackHost } from "./fortress.js";

describe("fortress posture", () => {
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

  it("allows non-loopback with strict and CORS allowlist", () => {
    process.env.AUTH_TRUST_MODE = "strict";
    process.env.CORS_ALLOWED_ORIGINS = "http://192.168.1.10:5173,http://10.0.0.2:5173";
    expect(() => assertPrivateDeploymentOrDie("0.0.0.0")).not.toThrow();
    expect(corsOriginOption("0.0.0.0")).toEqual([
      "http://192.168.1.10:5173",
      "http://10.0.0.2:5173",
    ]);
    process.env.AUTH_TRUST_MODE = "dev";
    delete process.env.CORS_ALLOWED_ORIGINS;
  });
});
