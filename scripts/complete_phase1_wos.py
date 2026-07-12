#!/usr/bin/env python3
"""Run complete_wo validators for WO-1..21 with canonical owned paths."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
COMPLETE_WO = REPO_ROOT / "scripts" / "complete_wo.py"

# Import path map from run_wo_queue
sys.path.insert(0, str(REPO_ROOT / "scripts"))
from run_wo_queue import WO_PATHS  # noqa: E402


def main() -> int:
    failed = []
    for n in range(1, 22):
        if n not in WO_PATHS:
            failed.append(n)
            print(f"FAIL: WO-{n} missing from WO_PATHS")
            continue
        title, paths = WO_PATHS[n]
        r = subprocess.run(
            [sys.executable, str(COMPLETE_WO), "--wo", str(n), "--title", title, "--paths", *paths],
            cwd=REPO_ROOT,
        )
        if r.returncode == 0:
            print(f"PASS WO-{n}")
        else:
            failed.append(n)
            print(f"FAIL WO-{n}")
    if failed:
        print(f"Failed WOs: {failed}")
        return 1
    print("All 21 phase-1 WOs passed validators")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
