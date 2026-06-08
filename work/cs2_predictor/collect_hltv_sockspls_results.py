from __future__ import annotations

import argparse
import importlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .paths import RAW_ROOT


DEFAULT_SOURCE_PATH = Path("work/api_tests/sockspls_hltv_api_20260608")


def collect_results(source_path: Path) -> dict[str, Any]:
    sys.path.insert(0, str(source_path.resolve()))
    hltv = importlib.import_module("main")
    rows = hltv.get_results()
    return {
        "source": "SocksPls/hltv-api:get_results",
        "status": "ok",
        "fetched_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "rows": rows,
        "count": len(rows) if isinstance(rows, list) else None,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect latest HLTV results through SocksPls/hltv-api.")
    parser.add_argument("--source-path", default=str(DEFAULT_SOURCE_PATH))
    parser.add_argument("--out", default=str(RAW_ROOT / "hltv" / "sockspls_results_latest.json"))
    args = parser.parse_args()

    output_path = Path(args.out)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        payload = collect_results(Path(args.source_path))
    except Exception as exc:
        payload = {
            "source": "SocksPls/hltv-api:get_results",
            "status": "error",
            "fetched_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
            "error": repr(exc),
        }
    output_path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps({key: payload.get(key) for key in ("source", "status", "count", "error")}, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
