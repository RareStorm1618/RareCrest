#!/usr/bin/env python3
"""Validate Software Factory checklist completeness for a Work Order."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
CHECKLIST_DIR = REPO_ROOT / ".sw-factory"
TEMPLATE_PATH = (
    REPO_ROOT
    / ".cursor/skills/software-factory/execution/scripts/checklist-template.md"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate SF checklist for a WO")
    parser.add_argument("--wo", required=True, help="Work order number (e.g. 1 or WO-1)")
    return parser.parse_args()


def normalize_wo(wo: str) -> str:
    wo = wo.strip()
    if wo.upper().startswith("WO-"):
        return wo.upper()
    return f"WO-{wo}"


def load_checklist(wo_label: str) -> Path:
    checklist_path = CHECKLIST_DIR / wo_label / "checklist.md"
    if not checklist_path.exists():
        print(f"ERROR: Checklist not found: {checklist_path}", file=sys.stderr)
        sys.exit(1)
    return checklist_path


def validate_checklist(content: str, wo_label: str) -> list[str]:
    errors: list[str] = []

    # Must not be abbreviated (minimum line count)
    lines = content.splitlines()
    if len(lines) < 40:
        errors.append(f"Checklist appears abbreviated ({len(lines)} lines; need full template)")

    # Required phase headers
    required_phases = [
        "Phase 1: Start / Context Gathering",
        "Phase 2: Planning And Implementation",
        "Phase 3: Review And Verification",
        "Final Completion Check",
    ]
    for phase in required_phases:
        if phase not in content:
            errors.append(f"Missing phase section: {phase}")

    # All checklist items must be [x] or [SKIP]
    unchecked = re.findall(r"^- \[ \]", content, re.MULTILINE)
    if unchecked:
        errors.append(f"Found {len(unchecked)} unchecked items (must be [x] or [SKIP])")

    # Phase certifications must be checked
    cert_pattern = r"^- \[[ xX]\] \*\*Certification:"
    certs = re.findall(cert_pattern, content, re.MULTILINE)
    if len(certs) < 3:
        errors.append("Missing phase certification checkboxes")

    unchecked_certs = re.findall(r"^- \[ \] \*\*Certification:", content, re.MULTILINE)
    if unchecked_certs:
        errors.append(f"Found {len(unchecked_certs)} unchecked certifications")

    # Validator references in final section
    if "validate_sf_checklist.py" not in content:
        errors.append("Final section missing validate_sf_checklist.py reference")
    if "validate_code_quality_gate.py" not in content:
        errors.append("Final section missing validate_code_quality_gate.py reference")

    # WO label present
    if wo_label not in content:
        errors.append(f"Checklist missing WO label: {wo_label}")

    return errors


def main() -> None:
    args = parse_args()
    wo_label = normalize_wo(args.wo)
    checklist_path = load_checklist(wo_label)
    content = checklist_path.read_text(encoding="utf-8")
    errors = validate_checklist(content, wo_label)

    if errors:
        print(f"FAIL: {wo_label} checklist validation failed:", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        sys.exit(1)

    print(f"PASS: {wo_label} checklist valid ({checklist_path})")
    sys.exit(0)


if __name__ == "__main__":
    main()
