/** WO-62/63: IP asset register domain logic */

export type IpAssetType = "patent" | "trademark" | "copyright" | "trade_secret" | "dataset" | "model";

export interface IpAssetRegistrationInput {
  entityId: string;
  assetType: IpAssetType;
  title: string;
  jurisdiction: string;
  filingDate: string;
  registrationNumber?: string | null;
  ownerId: string;
  beneficialOwnerId?: string | null;
}

export interface IpAssetRecord extends IpAssetRegistrationInput {
  jurisdiction: string;
  title: string;
  chainFingerprint: string;
}

function normalizeJurisdiction(value: string): string {
  return value.trim().toUpperCase();
}

export function buildChainFingerprint(input: Pick<IpAssetRegistrationInput, "entityId" | "ownerId" | "beneficialOwnerId" | "assetType">): string {
  return [
    input.entityId,
    input.assetType,
    input.ownerId,
    input.beneficialOwnerId ?? "none",
  ].join(":");
}

export function registerAsset(input: IpAssetRegistrationInput): IpAssetRecord {
  return {
    ...input,
    title: input.title.trim(),
    jurisdiction: normalizeJurisdiction(input.jurisdiction),
    chainFingerprint: buildChainFingerprint(input),
  };
}
