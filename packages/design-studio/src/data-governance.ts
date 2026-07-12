export type DataSensitivity = "public" | "internal" | "restricted" | "phi";

export interface DataAsset {
  id: string;
  name: string;
  sensitivity: DataSensitivity;
  encryptedAtRest: boolean;
}

export interface GovernanceBinder {
  assets: DataAsset[];
  policyFlags: string[];
  compliant: boolean;
}

export function bindDataGovernance(assets: DataAsset[]): GovernanceBinder {
  const policyFlags: string[] = [];

  for (const asset of assets) {
    if ((asset.sensitivity === "restricted" || asset.sensitivity === "phi") && !asset.encryptedAtRest) {
      policyFlags.push(`${asset.name} requires encrypt-before-access`);
    }
  }

  return {
    assets,
    policyFlags,
    compliant: policyFlags.length === 0,
  };
}
