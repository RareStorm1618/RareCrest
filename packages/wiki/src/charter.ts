import type { VerticalKey } from "@rarecrest/contracts";

export type WikiPageType =
  | "source"
  | "entity"
  | "concept"
  | "decision"
  | "stakeholder"
  | "competitor"
  | "bridge"
  | "index"
  | "log"
  | "hot"
  | "answer"
  | "overview";

export type WikiSensitivity = "public" | "internal" | "phi_ref" | "financial";
export type WikiPageStatus = "draft" | "canon" | "superseded" | "archived";
export type MethodologyMode = "generic" | "lyt" | "para" | "zettelkasten";

export interface WikiCharter {
  vertical: VerticalKey;
  mode: "care" | "markets" | "protocol" | "business";
  methodology: MethodologyMode;
  phiBlind: boolean;
  financialDualControl: boolean;
  allowAutoresearch: boolean;
  description: string;
}

export const VERTICAL_CHARTERS: Record<VerticalKey, WikiCharter> = {
  healkids: {
    vertical: "healkids",
    mode: "care",
    methodology: "para",
    phiBlind: true,
    financialDualControl: true,
    allowAutoresearch: true,
    description: "Care ops wiki — PHI-blind; clinical claims human-gated",
  },
  rareangels: {
    vertical: "rareangels",
    mode: "care",
    methodology: "para",
    phiBlind: true,
    financialDualControl: true,
    allowAutoresearch: true,
    description: "Care ops wiki — PHI-blind; clinical claims human-gated",
  },
  rarestorm: {
    vertical: "rarestorm",
    mode: "markets",
    methodology: "lyt",
    phiBlind: false,
    financialDualControl: true,
    allowAutoresearch: true,
    description: "Markets wiki — financial claims require instruction provenance",
  },
  rareedge: {
    vertical: "rareedge",
    mode: "markets",
    methodology: "lyt",
    phiBlind: false,
    financialDualControl: true,
    allowAutoresearch: true,
    description: "Edge ops wiki — financial claims require instruction provenance",
  },
  hopecoin: {
    vertical: "hopecoin",
    mode: "protocol",
    methodology: "zettelkasten",
    phiBlind: false,
    financialDualControl: true,
    allowAutoresearch: true,
    description: "Protocol/treasury wiki — dual-control on fund/token assertions",
  },
  holding: {
    vertical: "holding",
    mode: "business",
    methodology: "generic",
    phiBlind: false,
    financialDualControl: true,
    allowAutoresearch: true,
    description: "Business canon — decisions, stakeholders, competitors, bridges",
  },
};

export function namespaceForVertical(vertical: VerticalKey): string {
  return `vertical/${vertical}/wiki`;
}

export function namespaceForHoldingCanon(): string {
  return "holding/canon";
}

export function namespaceForEntity(entityId: string): string {
  return `entity/${entityId}/working`;
}

export function namespaceForBridge(from: VerticalKey, to: VerticalKey): string {
  return `bridges/${from}__${to}`;
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 200) || "untitled";
}
