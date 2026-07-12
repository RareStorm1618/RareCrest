import { createHash } from "node:crypto";

export interface ImmutableLogSourceEvent {
  id: string;
  action: string;
  verdict: "allow" | "deny";
  createdAt: string;
}

export interface ImmutableLogEntry extends ImmutableLogSourceEvent {
  index: number;
  previousHash: string;
  hash: string;
}

function hashLogEntry(index: number, previousHash: string, event: ImmutableLogSourceEvent): string {
  return createHash("sha256")
    .update([index, previousHash, event.id, event.action, event.verdict, event.createdAt].join("|"))
    .digest("hex");
}

export function buildImmutableLog(events: ImmutableLogSourceEvent[]): ImmutableLogEntry[] {
  let previousHash = "GENESIS";
  return events.map((event, index) => {
    const hash = hashLogEntry(index, previousHash, event);
    const entry: ImmutableLogEntry = {
      ...event,
      index,
      previousHash,
      hash,
    };
    previousHash = hash;
    return entry;
  });
}

export function validateImmutableChain(entries: ImmutableLogEntry[]): boolean {
  for (let i = 0; i < entries.length; i += 1) {
    const expectedPrev = i === 0 ? "GENESIS" : entries[i - 1]?.hash;
    const entry = entries[i];
    if (!entry || entry.previousHash !== expectedPrev) return false;
    const expectedHash = hashLogEntry(entry.index, entry.previousHash, entry);
    if (expectedHash !== entry.hash) return false;
  }
  return true;
}
