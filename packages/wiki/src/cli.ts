#!/usr/bin/env node
/**
 * rarecrest-wiki doctor — ar9av-style health CLI (reads JSON from stdin or args).
 * Full doctor against live API is available via GET /api/v1/wiki/doctor.
 */
import { analyseGraph, lintWiki } from "./index.js";

async function main() {
  const cmd = process.argv[2] ?? "help";
  if (cmd === "help" || cmd === "--help") {
    console.log(`rarecrest-wiki <doctor|lint|graph>

doctor  — print expected namespace layout and trust rules
lint    — read pages JSON from stdin, print lint report
graph   — read {nodes,edges} JSON from stdin, print analysis
`);
    return;
  }

  if (cmd === "doctor") {
    console.log(
      JSON.stringify(
        {
          ok: true,
          namespaces: [
            "holding/canon",
            "vertical/{vertical}/wiki",
            "entity/{entityId}/working",
            "bridges/{from}__{to}",
          ],
          operations: ["ingest", "query", "lint", "autoresearch", "promote", "doctor"],
          trust: ["phi_blind_care", "financial_dual_control", "vertical_isolation"],
        },
        null,
        2,
      ),
    );
    return;
  }

  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8") || "{}";
  const data = JSON.parse(raw);

  if (cmd === "lint") {
    console.log(JSON.stringify(lintWiki(data.pages ?? []), null, 2));
    return;
  }
  if (cmd === "graph") {
    console.log(JSON.stringify(analyseGraph(data.nodes ?? [], data.edges ?? []), null, 2));
    return;
  }
  console.error(`Unknown command: ${cmd}`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
