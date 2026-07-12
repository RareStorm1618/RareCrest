#!/usr/bin/env python3
"""Run complete_wo.py for all former stub WOs with real owned paths."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
COMPLETE = REPO / "scripts" / "complete_wo.py"

# WO -> (title, paths)
STUB_WOS: dict[int, tuple[str, list[str]]] = {
    24: ("Implement PortfolioRollupService and portfolio status view", [
        "packages/portfolio/src/rollup.ts", "apps/api/src/routes/portfolio-routes.ts",
        "apps/web/src/components/PortfolioStatusView.tsx"]),
    26: ("Extend ScoringEngine with anchored readiness, DRIVE/SHAPE, and diagnostic computations", [
        "services/scoring/src/anchored_assessment.rs", "packages/diagnostics/src/drive-shape.ts",
        "packages/diagnostics/src/vendor-shortcut.ts"]),
    30: ("Implement SchemaFormRenderer dual-track authoring component", [
        "packages/ui/src/schema-form-renderer.tsx", "packages/ui/src/dual-track.tsx"]),
    34: ("Build PortfolioStatusView roll-up surface (Client App)", [
        "apps/web/src/components/PortfolioStatusView.tsx", "packages/api-client/src/index.ts"]),
    39: ("Build PurposeProtocolEditor with litmus-test gate", [
        "packages/design-studio/src/purpose-protocol.ts", "apps/api/src/routes/design-studio-routes.ts",
        "apps/web/src/components/PurposeProtocolEditor.tsx"]),
    40: ("Build DRIVE/SHAPE scorecards and BackcastingCanvas", [
        "packages/design-studio/src/drive-shape.ts", "apps/web/src/components/DriveShapeScorecards.tsx"]),
    41: ("Build IntelligenceStackModeler with decision-ledger separation", [
        "packages/design-studio/src/intelligence-stack.ts", "apps/web/src/components/IntelligenceStackModeler.tsx"]),
    42: ("Build AgentBlueprintForm (eight properties, Client App + API Server)", [
        "apps/api/src/routes/agent-studio-routes.ts", "apps/web/src/components/AgentBlueprintForm.tsx"]),
    44: ("Build DataGovernanceBinder and workflow data manifest", [
        "packages/design-studio/src/data-governance.ts", "apps/web/src/components/DataGovernanceBinder.tsx"]),
    45: ("Implement DecisionTraceTemplateEditor (API Server)", [
        "packages/design-studio/src/decision-trace-template.ts", "apps/web/src/components/DecisionTraceTemplateEditor.tsx"]),
    46: ("Implement Vendor Shortcut inventory and destination mapping (API Server)", [
        "packages/vendor-shortcut/src/inventory.ts", "apps/api/src/routes/vendor-shortcut-routes.ts"]),
    47: ("Build ShortcutAssessmentView and warn-and-record flow (Client App)", [
        "apps/web/src/components/ShortcutAssessmentView.tsx", "apps/api/src/routes/vendor-shortcut-routes.ts"]),
    48: ("Implement CapabilityRegistryService and AgencyMapService (API Server)", [
        "packages/capability-registry/src/registry.ts", "apps/api/src/routes/capability-routes.ts"]),
    49: ("Build CapabilityAndAgencyView (Client App)", [
        "apps/web/src/components/CapabilityAndAgencyView.tsx", "packages/capability-registry/src/agency-map.ts"]),
    50: ("Implement Agent Passport issuance, verification, and lifecycle (API Server)", [
        "packages/agent-studio/src/passport.ts", "apps/api/src/routes/agent-studio-routes.ts"]),
    54: ("Implement TransitionBudgetCalculator, MVIS, and kill-switch definitions (API Server)", [
        "packages/migration-workspace/src/transition-budget.ts", "packages/migration-workspace/src/kill-switches.ts",
        "apps/api/src/routes/migration-workspace-routes.ts"]),
    55: ("Implement Data-Plane Inversion Checklist", [
        "packages/migration-workspace/src/data-plane-inversion.ts", "apps/web/src/components/InversionChecklistView.tsx"]),
    56: ("Implement Built-from-Zero Mode", [
        "packages/migration-workspace/src/from-zero.ts", "apps/web/src/components/FromZeroWorkshop.tsx"]),
    58: ("Implement LegalSupportTeammate (Intelligence Services)", [
        "services/intelligence/src/legal-support-teammate.ts", "services/intelligence/src/index.ts"]),
    59: ("Implement CounselEscalationRouter and awaiting-counsel blocks (API Server)", [
        "packages/legal-compliance/src/counsel-escalation.ts", "apps/api/src/routes/legal-routes.ts"]),
    60: ("Implement ProhibitedClaimEngine (Intelligence Services)", [
        "services/intelligence/src/prohibited-claims.ts"]),
    61: ("Implement RegulatoryCalendarService (API Server)", [
        "packages/legal-compliance/src/regulatory-calendar.ts", "apps/api/src/routes/legal-routes.ts"]),
    62: ("Implement IP asset register and status verification (API Server)", [
        "packages/ip-management/src/asset-register.ts", "apps/api/src/routes/ip-routes.ts"]),
    63: ("Implement IP ownership, chain of title, and portfolio reconciliation (API Server)", [
        "packages/ip-management/src/portfolio-reconciliation.ts", "packages/ip-management/src/ownership-title.ts"]),
    67: ("Implement AutoCaptureService for runtime corrections and drift (Intelligence Services)", [
        "services/intelligence/src/auto-capture.ts"]),
    71: ("Implement KillSwitchController (Governance Engine)", [
        "services/governance-engine/src/kill_switch_controller.rs", "services/governance-engine/src/main.rs"]),
    73: ("Implement runtime immutable log, multi-model routing, and LearningVelocityReporter", [
        "packages/runtime-control/src/immutable-log.ts", "packages/runtime-control/src/learning-velocity.ts",
        "apps/api/src/routes/runtime-routes.ts"]),
}


def main() -> None:
    failed: list[int] = []
    for n, (title, paths) in sorted(STUB_WOS.items()):
        cmd = [sys.executable, str(COMPLETE), "--wo", str(n), "--title", title, "--paths", *paths]
        r = subprocess.run(cmd, cwd=REPO)
        if r.returncode != 0:
            failed.append(n)
            print(f"FAIL WO-{n}", file=sys.stderr)
        else:
            print(f"PASS WO-{n}")
    if failed:
        print(f"Failed: {failed}", file=sys.stderr)
        sys.exit(1)
    print(f"All {len(STUB_WOS)} stub WOs passed validators")


if __name__ == "__main__":
    main()
