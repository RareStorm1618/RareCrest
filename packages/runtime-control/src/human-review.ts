/** WO-72: Human review queue helpers */

export interface HeldActionRelease {
  action: string;
  payload: { reviewId: string; heldAction: Record<string, unknown> };
}

export function buildHeldActionRelease(
  reviewId: string,
  heldAction: Record<string, unknown>,
): HeldActionRelease | null {
  if (!heldAction || Object.keys(heldAction).length === 0) return null;
  return {
    action: String(heldAction.action ?? "held_action_released"),
    payload: { reviewId, heldAction },
  };
}

export function shouldReleaseHeldAction(approved: boolean, heldAction: Record<string, unknown>): boolean {
  return approved && !!heldAction && Object.keys(heldAction).length > 0;
}
