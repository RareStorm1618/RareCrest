import { createHash } from "node:crypto";

/** Namespaces eligible for director Obsidian satellite sync. */
export const DIRECTOR_OBSIDIAN_NAMESPACE_PREFIXES = ["holding/canon", "bridges/"] as const;

export function isDirectorObsidianNamespace(namespace: string): boolean {
  return DIRECTOR_OBSIDIAN_NAMESPACE_PREFIXES.some(
    (p) => namespace === p || namespace.startsWith(p),
  );
}

export type ObsidianSyncSensitivity = "public" | "internal" | "phi_ref" | "financial";

/** PHI and financial claims never leave RareCrest SoR into Obsidian. */
export function isObsidianSyncSafeSensitivity(sensitivity: string): boolean {
  return sensitivity !== "phi_ref" && sensitivity !== "financial";
}

export interface ObsidianManifestPage {
  slug: string;
  title: string;
  pageType: string;
  status: string;
  sensitivity: string;
  version?: number;
  updatedAt: string;
  body?: string;
}

export function filterObsidianSyncPages<T extends { sensitivity: string; updatedAt: string }>(
  pages: T[],
  since?: string,
): T[] {
  const sinceMs = since ? Date.parse(since) : NaN;
  return pages.filter((p) => {
    if (!isObsidianSyncSafeSensitivity(p.sensitivity)) return false;
    if (!Number.isNaN(sinceMs)) {
      const t = Date.parse(String(p.updatedAt));
      if (!Number.isNaN(t) && t <= sinceMs) return false;
    }
    return true;
  });
}

export function buildObsidianSyncToken(
  namespace: string,
  pages: Array<{ slug: string; updatedAt: string; version?: number }>,
): string {
  const maxUpdated = pages.reduce((m, p) => (p.updatedAt > m ? p.updatedAt : m), "");
  const seed = `${namespace}|${pages.length}|${maxUpdated}|${pages.map((p) => `${p.slug}:${p.version ?? 0}`).join(",")}`;
  return createHash("sha256").update(seed).digest("hex").slice(0, 32);
}

export function toObsidianManifestFiles(pages: ObsidianManifestPage[]) {
  return pages.map((p) => ({
    path: `wiki/${p.pageType}/${p.slug}.md`,
    slug: p.slug,
    title: p.title,
    status: p.status,
    sensitivity: p.sensitivity,
    version: p.version ?? 1,
    updatedAt: p.updatedAt,
    contentHash: p.body
      ? createHash("sha256").update(p.body).digest("hex").slice(0, 16)
      : undefined,
  }));
}
