/** WO-62/63: Ownership and title chain validation */

export interface OwnershipTransfer {
  fromOwnerId: string;
  toOwnerId: string;
  transferDate: string;
  instrumentRef: string;
}

export interface OwnershipTitleResult {
  valid: boolean;
  gaps: string[];
  currentOwnerId: string | null;
}

export function verifyOwnershipTitle(chain: OwnershipTransfer[]): OwnershipTitleResult {
  if (chain.length === 0) return { valid: false, gaps: ["empty_chain"], currentOwnerId: null };

  const sorted = [...chain].sort((a, b) => a.transferDate.localeCompare(b.transferDate));
  const gaps: string[] = [];

  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1];
    const current = sorted[i];
    if (previous.toOwnerId !== current.fromOwnerId) {
      gaps.push(`broken_link:${previous.toOwnerId}->${current.fromOwnerId}`);
    }
  }

  const currentOwnerId = sorted[sorted.length - 1]?.toOwnerId ?? null;
  return { valid: gaps.length === 0, gaps, currentOwnerId };
}
