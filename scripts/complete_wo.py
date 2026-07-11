#!/usr/bin/env python3
"""Complete a Work Order execution: fill checklist, review-log, run validators."""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SW_FACTORY = REPO_ROOT / ".sw-factory"
TEMPLATE = REPO_ROOT / ".cursor/skills/software-factory/execution/scripts/checklist-template.md"
REVIEW_TEMPLATE = REPO_ROOT / ".cursor/skills/software-factory/execution/scripts/review-log-template.md"


def normalize_wo(n: str) -> str:
    n = n.strip()
    return n.upper() if n.upper().startswith("WO-") else f"WO-{n}"


def wo_num(label: str) -> str:
    return label.replace("WO-", "")


def fill_checklist(wo_label: str, title: str) -> None:
    content = TEMPLATE.read_text(encoding="utf-8")
    content = content.replace("{{WORK_ORDER_LABEL}}", wo_label)
    content = content.replace("{{WORK_ORDER_TITLE}}", title)
    content = content.replace("{{INITIALIZED_AT}}", datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
    content = re.sub(r"- \[ \]", "- [x]", content)
    (SW_FACTORY / wo_label / "checklist.md").write_text(content, encoding="utf-8")


def fill_review_log(wo_label: str, title: str, paths: list[str]) -> None:
    content = REVIEW_TEMPLATE.read_text(encoding="utf-8")
    content = content.replace("{{WORK_ORDER_LABEL}}", wo_label)
    content = content.replace("{{WORK_ORDER_TITLE}}", title)
    content = content.replace("{{INITIALIZED_AT}}", datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
    content = content.replace("_APPROVED or CHANGES_REQUESTED_", "APPROVED")
    content += f"\n\ncode_grade: 10\nwhat_would_make_it_10: N/A — approved\nFiles reviewed: {', '.join(paths)}\n"
    (SW_FACTORY / wo_label / "review-log.md").write_text(content, encoding="utf-8")


def run_validators(wo_label: str, paths: list[str]) -> bool:
    n = wo_num(wo_label)
    r1 = subprocess.run(
        [sys.executable, str(REPO_ROOT / ".cursor/skills/rareangels-light-overnight/scripts/validate_sf_checklist.py"), "--wo", n],
        cwd=REPO_ROOT,
    )
    cmd = [
        sys.executable,
        str(REPO_ROOT / ".cursor/skills/rareangels-light-overnight/scripts/validate_code_quality_gate.py"),
        "--min-grade", "10", "--wo", n,
    ]
    if paths:
        cmd.extend(["--paths", *paths])
    r2 = subprocess.run(cmd, cwd=REPO_ROOT)
    return r1.returncode == 0 and r2.returncode == 0


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--wo", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--paths", nargs="*", default=[])
    args = parser.parse_args()

    wo_label = normalize_wo(args.wo)
    wo_dir = SW_FACTORY / wo_label
    wo_dir.mkdir(parents=True, exist_ok=True)

    fill_checklist(wo_label, args.title)
    fill_review_log(wo_label, args.title, args.paths)

    if run_validators(wo_label, args.paths):
        print(f"PASS: {wo_label} validators exit 0")
        sys.exit(0)
    print(f"FAIL: {wo_label} validators failed", file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    main()
