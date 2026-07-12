import { describe, expect, it } from "vitest";
import { renderSimplePdf } from "./pdf.js";

describe("renderSimplePdf", () => {
  it("produces a valid PDF header", () => {
    const buf = renderSimplePdf("# Title\nBody line");
    const text = buf.toString("utf8", 0, 8);
    expect(text).toBe("%PDF-1.4");
    expect(buf.toString("utf8")).toContain("%%EOF");
  });
});
