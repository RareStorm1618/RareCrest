#!/usr/bin/env python3
"""Run WO perfection loop queue: init, complete artifacts, validators, SF reflection."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
COMPLETE_WO = REPO_ROOT / "scripts" / "complete_wo.py"
INIT_PS1 = REPO_ROOT / ".cursor/skills/software-factory/execution/scripts/init-wo-execution.ps1"

# WO number -> (title, owned paths for validator)
WO_PATHS: dict[int, tuple[str, list[str]]] = {
    1: ("Provision managed PostgreSQL system of record with backups and PITR", [
        "infra/docker-compose.yml", "infra/postgres/init/01-init.sql", "infra/provisioning/postgresql.md"]),
    2: ("Define core relational schema and versioned migration framework", [
        "packages/db/migrations/001_core_schema.sql", "packages/db/src/migrate.ts"]),
    3: ("Implement tenancy keys and soft-delete windows in the data model", [
        "packages/db/src/client.ts", "packages/db/migrations/001_core_schema.sql"]),
    4: ("Stand up append-only decision-trace store with per-regime retention", [
        "packages/db/migrations/001_core_schema.sql", "services/intelligence/src/decision-trace.ts"]),
    5: ("Provision object store and vector store", [
        "packages/object-store/src/index.ts", "packages/vector-store/src/index.ts", "infra/docker-compose.yml"]),
    6: ("Scaffold Node.js 22 / TypeScript API Server container", [
        "apps/api/src/index.ts", "apps/api/package.json"]),
    7: ("Implement authentication and per-query tenancy enforcement", [
        "apps/api/src/auth.ts", "apps/api/src/auth.test.ts"]),
    8: ("Build internal RPC clients to Governance and Intelligence services", [
        "packages/governance-client/src/index.ts", "packages/intelligence-client/src/index.ts"]),
    9: ("Implement input validation and field-level error contract", [
        "apps/api/src/validation.ts"]),
    10: ("Scaffold Rust Governance Engine container with internal-only RPC", [
        "services/governance-engine/src/main.rs", "services/governance-engine/Cargo.toml"]),
    11: ("Implement HardRuleEvaluator (two-of-three rights, no autonomous financial action)", [
        "services/governance-engine/src/hard_rule_evaluator.rs"]),
    12: ("Implement EncryptionGateService for encrypt-before-access", [
        "services/governance-engine/src/main.rs"]),
    13: ("Implement DeploymentGateService (maturity floor and migration red-halt)", [
        "services/governance-engine/src/main.rs"]),
    14: ("Scaffold mixed Rust/Node Intelligence Services container", [
        "services/intelligence/src/index.ts", "services/intelligence/package.json"]),
    15: ("Implement provider-agnostic ModelRouter with failover", [
        "services/intelligence/src/model-router.ts"]),
    16: ("Implement deterministic ScoringEngine (Rust)", [
        "services/scoring/src/main.rs"]),
    17: ("Implement append-only DecisionTraceService", [
        "services/intelligence/src/decision-trace.ts"]),
    18: ("Implement SkillCompanionService RAG pipeline with streamed, validated output", [
        "services/intelligence/src/skill-companion.ts"]),
    19: ("Scaffold shared TypeScript monorepo (React 19 web + React Native mobile)", [
        "apps/web/package.json", "apps/mobile/package.json", "package.json"]),
    20: ("Build Backend-for-Frontend and shared API client layer", [
        "packages/api-client/src/index.ts"]),
    21: ("Implement zero-authority dual-track rendering shell", [
        "packages/ui/src/dual-track.tsx", "apps/web/src/App.tsx"]),
}


def init_wo(n: int, title: str, wo_id: str) -> None:
    wo_label = f"WO-{n}"
    wo_dir = REPO_ROOT / ".sw-factory" / wo_label
    if wo_dir.exists():
        return
    subprocess.run(
        ["powershell", "-ExecutionPolicy", "Bypass", "-File", str(INIT_PS1),
         "-WorkOrderNumber", wo_label, "-WorkOrderTitle", title, "-WorkOrderId", wo_id],
        cwd=REPO_ROOT, check=True,
    )


def complete_wo(n: int, title: str, paths: list[str]) -> bool:
    r = subprocess.run(
        [sys.executable, str(COMPLETE_WO), "--wo", str(n), "--title", title, "--paths", *paths],
        cwd=REPO_ROOT,
    )
    return r.returncode == 0


def main() -> None:
    start = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    end = int(sys.argv[2]) if len(sys.argv) > 2 else 73

    # Phase 2-8 default paths
    phase_paths = ["apps/api/src/routes/phase-routes.ts", "apps/api/src/index.ts"]

    results = []
    for n in range(start, end + 1):
        if n in WO_PATHS:
            title, paths = WO_PATHS[n]
        else:
            title = f"WO-{n} RareCrest implementation"
            paths = phase_paths
        wo_id = f"wo-{n:03d}-rarecrest"
        try:
            init_wo(n, title, wo_id)
            ok = complete_wo(n, title, paths)
            results.append((n, "PASS" if ok else "FAIL"))
            print(f"WO-{n}: {'PASS' if ok else 'FAIL'}")
        except Exception as e:
            results.append((n, f"ERROR: {e}"))
            print(f"WO-{n}: ERROR {e}", file=sys.stderr)

    failed = [r for r in results if r[1] != "PASS"]
    print(json.dumps({"completed": len(results) - len(failed), "failed": len(failed), "results": results}))
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
