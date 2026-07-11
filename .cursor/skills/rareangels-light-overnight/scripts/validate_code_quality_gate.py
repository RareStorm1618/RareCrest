#!/usr/bin/env python3
"""Validate code quality gate from review-log.md for a Work Order."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
CHECKLIST_DIR = REPO_ROOT / ".sw-factory"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate code quality gate for a WO")
    parser.add_argument("--wo", required=True, help="Work order number (e.g. 1 or WO-1)")
    parser.add_argument("--min-grade", type=int, default=10, help="Minimum code_grade required")
    parser.add_argument("--paths", nargs="*", default=[], help="Changed product file paths to verify exist")
    return parser.parse_args()


def normalize_wo(wo: str) -> str:
    wo = wo.strip()
    if wo.upper().startswith("WO-"):
        return wo.upper()
    return f"WO-{wo}"


def load_review_log(wo_label: str) -> Path:
    review_path = CHECKLIST_DIR / wo_label / "review-log.md"
    if not review_path.exists():
        print(f"ERROR: Review log not found: {review_path}", file=sys.stderr)
        sys.exit(1)
    return review_path


def extract_latest_grade(content: str) -> int | None:
    grades = re.findall(r"code_grade:\s*(\d+)", content, re.IGNORECASE)
    if not grades:
        return None
    return int(grades[-1])


def extract_latest_verdict(content: str) -> str | None:
    verdicts = re.findall(
        r"\*\*Verdict:\*\*\s*(APPROVED|CHANGES_REQUESTED)",
        content,
        re.IGNORECASE,
    )
    if not verdicts:
        return None
    return verdicts[-1].upper()


def validate_paths(paths: list[str]) -> list[str]:
    errors: list[str] = []
    for p in paths:
        full = REPO_ROOT / p
        if not full.exists():
            errors.append(f"Declared changed path does not exist: {p}")
    return errors


def main() -> None:
    args = parse_args()
    wo_label = normalize_wo(args.wo)
    review_path = load_review_log(wo_label)
    content = review_path.read_text(encoding="utf-8")

    errors: list[str] = []

    grade = extract_latest_grade(content)
    if grade is None:
        errors.append("No code_grade found in review-log.md")
    elif grade < args.min_grade:
        errors.append(f"code_grade {grade} < required {args.min_grade}")

    verdict = extract_latest_verdict(content)
    if verdict is None:
        errors.append("No verdict found in review-log.md")
    elif verdict != "APPROVED":
        errors.append(f"Verdict is {verdict}, expected APPROVED")
    elif args.min_grade == 10 and grade != 10:
        errors.append(f"APPROVED at grade {grade} but min-grade is 10")

    path_errors = validate_paths(args.paths)
    errors.extend(path_errors)

    if errors:
        print(f"FAIL: {wo_label} code quality gate failed:", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        sys.exit(1)

    print(f"PASS: {wo_label} code_grade={grade}, verdict={verdict}")
    if args.paths:
        print(f"  paths verified: {', '.join(args.paths)}")
    sys.exit(0)


if __name__ == "__main__":
    main()
