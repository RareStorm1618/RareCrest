import { lookup } from "node:dns/promises";
import { loadSecret } from "../secrets.js";
import {
  isBlockedFetchUrl,
  isBlockedIpAddress,
  rankSearchHits,
  type WebSearchHit,
} from "@rarecrest/wiki";

export interface WebSearchProvider {
  readonly name: string;
  search(query: string, opts?: { limit?: number }): Promise<WebSearchHit[]>;
  fetchPage(url: string, opts?: { maxBytes?: number }): Promise<{ html: string; finalUrl: string }>;
}

const DEFAULT_MAX_BYTES = 200_000;

/** Resolve hostname and refuse private/reserved IPs (DNS rebinding guard). */
async function assertPublicResolvedHost(url: string): Promise<void> {
  if (isBlockedFetchUrl(url)) {
    throw new Error(`Blocked URL: ${url}`);
  }
  let hostname: string;
  try {
    hostname = new URL(url).hostname.replace(/^\[|\]$/g, "");
  } catch {
    throw new Error(`Blocked URL: ${url}`);
  }
  // Literal IP in URL — check directly
  if (isBlockedIpAddress(hostname)) {
    throw new Error(`Blocked resolved host: ${hostname}`);
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.includes(":")) {
    return; // public literal IP already passed isBlockedIpAddress
  }
  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    for (const rec of records) {
      if (isBlockedIpAddress(rec.address)) {
        throw new Error(`Blocked resolved host: ${hostname} → ${rec.address}`);
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Blocked")) throw err;
    throw new Error(`DNS resolution failed for ${hostname}`);
  }
}

async function fetchText(url: string, headers: Record<string, string> = {}, maxBytes = DEFAULT_MAX_BYTES): Promise<{ text: string; finalUrl: string }> {
  await assertPublicResolvedHost(url);
  const res = await fetch(url, {
    headers: { "User-Agent": "RareCrestWikiBot/1.0 (+autoresearch)", ...headers },
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const finalUrl = res.url || url;
  await assertPublicResolvedHost(finalUrl);
  const buf = new Uint8Array(await res.arrayBuffer());
  const slice = buf.slice(0, maxBytes);
  return { text: new TextDecoder("utf-8", { fatal: false }).decode(slice), finalUrl };
}

/** Brave Search API — https://api.search.brave.com/res/v1/web/search */
export class BraveWebSearchProvider implements WebSearchProvider {
  readonly name = "brave";
  constructor(private apiKey: string) {}

  async search(query: string, opts?: { limit?: number }): Promise<WebSearchHit[]> {
    const limit = opts?.limit ?? 5;
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(Math.min(limit, 10)));
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": this.apiKey,
        "User-Agent": "RareCrestWikiBot/1.0",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Brave search failed: HTTP ${res.status}`);
    const data = (await res.json()) as {
      web?: { results?: Array<{ url: string; title: string; description?: string }> };
    };
    return (data.web?.results ?? []).slice(0, limit).map((r) => ({
      url: r.url,
      title: r.title,
      snippet: r.description ?? "",
    }));
  }

  async fetchPage(url: string, opts?: { maxBytes?: number }) {
    const { text, finalUrl } = await fetchText(url, {}, opts?.maxBytes);
    return { html: text, finalUrl };
  }
}

/** Tavily Search API */
export class TavilyWebSearchProvider implements WebSearchProvider {
  readonly name = "tavily";
  constructor(private apiKey: string) {}

  async search(query: string, opts?: { limit?: number }): Promise<WebSearchHit[]> {
    const limit = opts?.limit ?? 5;
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: this.apiKey,
        query,
        max_results: Math.min(limit, 10),
        include_answer: false,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Tavily search failed: HTTP ${res.status}`);
    const data = (await res.json()) as {
      results?: Array<{ url: string; title: string; content?: string }>;
    };
    return (data.results ?? []).slice(0, limit).map((r) => ({
      url: r.url,
      title: r.title,
      snippet: r.content ?? "",
    }));
  }

  async fetchPage(url: string, opts?: { maxBytes?: number }) {
    const { text, finalUrl } = await fetchText(url, {}, opts?.maxBytes);
    return { html: text, finalUrl };
  }
}

/**
 * DuckDuckGo Instant Answer API — only when WEB_SEARCH_PROVIDER=duckduckgo is set explicitly.
 * Never used as a silent default (Private Canon Fortress).
 */
export class DuckDuckGoWebSearchProvider implements WebSearchProvider {
  readonly name = "duckduckgo";

  async search(query: string, opts?: { limit?: number }): Promise<WebSearchHit[]> {
    const limit = opts?.limit ?? 5;
    const url = new URL("https://api.duckduckgo.com/");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("no_html", "1");
    url.searchParams.set("skip_disambig", "1");
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json", "User-Agent": "RareCrestWikiBot/1.0" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`DuckDuckGo search failed: HTTP ${res.status}`);
    const data = (await res.json()) as {
      AbstractURL?: string;
      AbstractText?: string;
      Heading?: string;
      RelatedTopics?: Array<{ FirstURL?: string; Text?: string; Topics?: Array<{ FirstURL?: string; Text?: string }> }>;
    };
    const hits: WebSearchHit[] = [];
    if (data.AbstractURL) {
      hits.push({
        url: data.AbstractURL,
        title: data.Heading || query,
        snippet: data.AbstractText || "",
      });
    }
    const flatten = (items: typeof data.RelatedTopics = []) => {
      for (const item of items) {
        if (item.FirstURL && item.Text) {
          hits.push({ url: item.FirstURL, title: item.Text.slice(0, 120), snippet: item.Text });
        }
        if (item.Topics) flatten(item.Topics);
      }
    };
    flatten(data.RelatedTopics);
    return rankSearchHits(hits, query, limit);
  }

  async fetchPage(url: string, opts?: { maxBytes?: number }) {
    const { text, finalUrl } = await fetchText(url, {}, opts?.maxBytes);
    return { html: text, finalUrl };
  }
}

/** Injectable provider for unit tests. */
export class MockWebSearchProvider implements WebSearchProvider {
  readonly name = "mock";
  constructor(private hits: WebSearchHit[] = []) {}

  async search(_query: string, opts?: { limit?: number }): Promise<WebSearchHit[]> {
    return this.hits.slice(0, opts?.limit ?? 5);
  }

  async fetchPage(url: string) {
    if (isBlockedFetchUrl(url)) throw new Error(`Blocked URL: ${url}`);
    return {
      html: `<html><h1>Mock</h1><p>Content for ${url}</p></html>`,
      finalUrl: url,
    };
  }
}

export function createWebSearchFromEnv(): WebSearchProvider {
  if ((process.env.WIKI_AUTORESEARCH_ENABLED ?? "false").toLowerCase() !== "true") {
    return new MockWebSearchProvider();
  }
  const provider = (process.env.WEB_SEARCH_PROVIDER ?? "").toLowerCase();
  const apiKey = loadSecret("WEB_SEARCH_API_KEY");

  if (provider === "mock" || provider === "") {
    // Explicit empty provider with enable flag still refuses silent public default
    if (provider === "") {
      throw new Error(
        "WIKI_AUTORESEARCH_ENABLED=true requires WEB_SEARCH_PROVIDER=brave|tavily|duckduckgo|mock",
      );
    }
    return new MockWebSearchProvider();
  }
  if (provider === "brave") {
    if (!apiKey) throw new Error("WEB_SEARCH_API_KEY required for Brave provider");
    return new BraveWebSearchProvider(apiKey);
  }
  if (provider === "tavily") {
    if (!apiKey) throw new Error("WEB_SEARCH_API_KEY required for Tavily provider");
    return new TavilyWebSearchProvider(apiKey);
  }
  if (provider === "duckduckgo") {
    return new DuckDuckGoWebSearchProvider();
  }
  throw new Error(`Unknown WEB_SEARCH_PROVIDER: ${provider}`);
}
