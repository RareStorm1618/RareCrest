const LAST_ENTITY_KEY = "rarecrest.director.lastEntity";

export interface RememberedEntity {
  id: string;
  name: string;
}

export function rememberEntity(entity: RememberedEntity): void {
  try {
    sessionStorage.setItem(LAST_ENTITY_KEY, JSON.stringify(entity));
  } catch {
    // ignore storage failures
  }
}

export function readRememberedEntity(): RememberedEntity | null {
  try {
    const raw = sessionStorage.getItem(LAST_ENTITY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RememberedEntity;
    if (!parsed?.id || !parsed?.name) return null;
    return parsed;
  } catch {
    return null;
  }
}
