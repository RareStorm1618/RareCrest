import { readFileSync } from "node:fs";

/**
 * Load a secret from env, or from a file path referenced by *_FILE (Docker/K8s secrets pattern).
 * Example: PHI_KMS_KEK_FILE=/run/secrets/phi_kek
 */
export function loadSecret(envName: string): string | undefined {
  const fileVar = `${envName}_FILE`;
  const filePath = process.env[fileVar];
  if (filePath) {
    return readFileSync(filePath, "utf8").trim();
  }
  const direct = process.env[envName];
  return direct && direct.length > 0 ? direct : undefined;
}

export function requireSecret(envName: string): string {
  const value = loadSecret(envName);
  if (!value) {
    throw new Error(`Missing secret ${envName} (or ${envName}_FILE)`);
  }
  return value;
}
