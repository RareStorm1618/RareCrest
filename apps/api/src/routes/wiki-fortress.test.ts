import { describe, expect, it } from "vitest";
import { assertWikiVerbAllowed, classifyWikiPrincipal } from "@rarecrest/wiki";

/** Entity working-namespace pattern used by assertWikiAccess (wiki-routes). */
const ENTITY_NS =
  /^entity\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/working$/i;

describe("wiki fortress route contracts", () => {
  it("parses entity uuid from working namespace for IDOR gate", () => {
    const ns = "entity/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/working";
    const m = ENTITY_NS.exec(ns);
    expect(m?.[1]).toBe("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    expect(ENTITY_NS.test("holding/canon")).toBe(false);
    expect(ENTITY_NS.test("entity/not-a-uuid/working")).toBe(false);
  });

  it("returns 403-class denial when agents promote under strict bounds", () => {
    process.env.WIKI_AGENT_BOUNDS = "strict";
    expect(classifyWikiPrincipal({ role: "agent", userId: "agent-bot" })).toBe("agent");
    try {
      assertWikiVerbAllowed("promote", "agent");
      expect.unreachable("promote should be denied");
    } catch (err) {
      expect((err as { statusCode?: number }).statusCode).toBe(403);
    }
    process.env.WIKI_AGENT_BOUNDS = "off";
  });

  it("denies vault_package without verified director", () => {
    process.env.WIKI_AGENT_BOUNDS = "strict";
    expect(() => assertWikiVerbAllowed("vault_package", "human", { verifiedDirector: false })).toThrow(
      /director/i,
    );
    expect(() => assertWikiVerbAllowed("vault_package", "director", { verifiedDirector: true })).not.toThrow();
    process.env.WIKI_AGENT_BOUNDS = "off";
  });
});
