from __future__ import annotations

import argparse
import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .paths import RAW_ROOT


DEFAULT_FLARESOLVERR_URL = "http://localhost:8191/v1"
DEFAULT_HLTV_URL = "https://www.hltv.org/results"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def post_json(url: str, payload: dict[str, Any], timeout_seconds: int) -> dict[str, Any]:
    request = urllib.request.Request(
        url=url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
        body = response.read().decode("utf-8", errors="replace")
    return json.loads(body)


def collect(
    flaresolverr_url: str,
    hltv_url: str,
    timeout_seconds: int,
    max_timeout_ms: int,
) -> dict[str, Any]:
    payload = {
        "cmd": "request.get",
        "url": hltv_url,
        "maxTimeout": max_timeout_ms,
    }
    try:
        response = post_json(flaresolverr_url, payload, timeout_seconds)
    except (TimeoutError, urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError) as exc:
        return {
            "source": "FlareSolverr:request.get",
            "status": "error",
            "fetched_at_utc": utc_now(),
            "flaresolverr_url": flaresolverr_url,
            "hltv_url": hltv_url,
            "error": repr(exc),
        }

    solution = response.get("solution") or {}
    html = solution.get("response") or ""
    return {
        "source": "FlareSolverr:request.get",
        "status": response.get("status") or "unknown",
        "fetched_at_utc": utc_now(),
        "flaresolverr_url": flaresolverr_url,
        "hltv_url": hltv_url,
        "message": response.get("message"),
        "solution_status": solution.get("status"),
        "solution_url": solution.get("url"),
        "user_agent": solution.get("userAgent"),
        "cookies": solution.get("cookies") or [],
        "html_length": len(html),
        "html": html,
        "raw": response,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Probe/fetch HLTV pages through a running FlareSolverr service.")
    parser.add_argument("--flaresolverr-url", default=os.environ.get("FLARESOLVERR_URL", DEFAULT_FLARESOLVERR_URL))
    parser.add_argument("--hltv-url", default=DEFAULT_HLTV_URL)
    parser.add_argument("--timeout-seconds", type=int, default=90)
    parser.add_argument("--max-timeout-ms", type=int, default=60000)
    parser.add_argument("--out", default=str(RAW_ROOT / "hltv" / "flaresolverr_probe.json"))
    args = parser.parse_args()

    output_path = Path(args.out)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    result = collect(
        flaresolverr_url=args.flaresolverr_url,
        hltv_url=args.hltv_url,
        timeout_seconds=args.timeout_seconds,
        max_timeout_ms=args.max_timeout_ms,
    )
    output_path.write_text(json.dumps(result, indent=2, sort_keys=True), encoding="utf-8")
    print(
        json.dumps(
            {
                "source": result.get("source"),
                "status": result.get("status"),
                "html_length": result.get("html_length"),
                "error": result.get("error"),
                "out": str(output_path),
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
