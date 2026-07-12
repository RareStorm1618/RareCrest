#!/usr/bin/env node
/**
 * rarecrest-wiki CLI — doctor / lint / graph / vault-decrypt
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { analyseGraph, lintWiki, decryptVaultPackage, vaultPackageToTree } from "./index.js";

async function main() {
  const cmd = process.argv[2] ?? "help";
  if (cmd === "help" || cmd === "--help") {
    console.log(`rarecrest-wiki <doctor|lint|graph|vault-decrypt>

doctor         — print expected namespace layout and trust rules
lint           — read pages JSON from stdin, print lint report
graph          — read {nodes,edges} JSON from stdin, print analysis
vault-decrypt  — rarecrest-wiki vault-decrypt <file.rcvault> --out <dir> [--passphrase <kek>] [--hmac <key>]
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
          operations: ["ingest", "query", "lint", "vault-package", "promote", "doctor"],
          trust: [
            "phi_blind_care",
            "financial_dual_control",
            "vertical_isolation",
            "agent_bounds",
            "autoresearch_off_by_default",
            "encrypted_obsidian_packages",
          ],
        },
        null,
        2,
      ),
    );
    return;
  }

  if (cmd === "vault-decrypt") {
    const file = process.argv[3];
    if (!file) {
      console.error("Usage: rarecrest-wiki vault-decrypt <file.rcvault> --out <dir>");
      process.exit(1);
    }
    let outDir = "./ObsidianVault";
    let passphrase = process.env.WIKI_VAULT_PACKAGE_KEK ?? "";
    let hmac = process.env.WIKI_VAULT_PACKAGE_HMAC ?? passphrase;
    for (let i = 4; i < process.argv.length; i++) {
      if (process.argv[i] === "--out") outDir = process.argv[++i] ?? outDir;
      if (process.argv[i] === "--passphrase") passphrase = process.argv[++i] ?? passphrase;
      if (process.argv[i] === "--hmac") hmac = process.argv[++i] ?? hmac;
    }
    if (!passphrase) {
      console.error("Passphrase or WIKI_VAULT_PACKAGE_KEK required");
      process.exit(1);
    }
    const pkg = JSON.parse(readFileSync(file, "utf8"));
    const plain = decryptVaultPackage(pkg, passphrase, hmac || passphrase);
    const tree = vaultPackageToTree(plain);
    for (const [rel, body] of Object.entries(tree)) {
      const full = join(outDir, rel);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, body, "utf8");
    }
    console.log(JSON.stringify({ ok: true, outDir, files: Object.keys(tree).length, namespace: plain.namespace }, null, 2));
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
