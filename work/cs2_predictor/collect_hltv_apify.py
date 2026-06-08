from __future__ import annotations

import argparse
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .paths import RAW_ROOT


DEFAULT_ACTOR_ID = "J40GPeE23znOF83ep"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def call_actor(actor_id: str, token: str, actor_input: dict[str, Any], timeout_seconds: int) -> dict[str, Any]:
    query = urllib.parse.urlencode({"token": token, "timeout": timeout_seconds, "clean": "true"})
    url = f"https://api.apify.com/v2/acts/{actor_id}/run-sync-get-dataset-items?{query}"
    request = urllib.request.Request(
        url=url,
        data=json.dumps(actor_input).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout_seconds + 30) as response:
        body = response.read().decode("utf-8", errors="replace")
    return json.loads(body)


def collect(actor_id: str, token: str, max_matches: int, include_details: bool, timeout_seconds: int) -> dict[str, Any]:
    actor_input = {
        "matchType": "all",
        "maxMatches": max_matches,
        "includeDetails": include_details,
        "minStars": 0,
    }
    try:
        items = call_actor(actor_id, token, actor_input, timeout_seconds)
    except (TimeoutError, urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError) as exc:
        return {
            "source": "Apify:hltv-org-live-and-upcoming-matches",
            "status": "error",
            "fetched_at_utc": utc_now(),
            "actor_id": actor_id,
            "input": actor_input,
            "error": repr(exc),
        }
    return {
        "source": "Apify:hltv-org-live-and-upcoming-matches",
        "status": "ok",
        "fetched_at_utc": utc_now(),
        "actor_id": actor_id,
        "input": actor_input,
        "item_count": len(items) if isinstance(items, list) else None,
        "items": items,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect HLTV live/upcoming/completed feed via the Apify actor.")
    parser.add_argument("--actor-id", default=os.environ.get("APIFY_HLTV_ACTOR_ID", DEFAULT_ACTOR_ID))
    parser.add_argument("--token", default=os.environ.get("APIFY_API_TOKEN"))
    parser.add_argument("--max-matches", type=int, default=50)
    parser.add_argument("--include-details", action="store_true")
    parser.add_argument("--timeout-seconds", type=int, default=180)
    parser.add_argument("--out", default=str(RAW_ROOT / "hltv" / "apify_live_upcoming_matches.json"))
    args = parser.parse_args()

    if not args.token:
        raise SystemExit("Missing Apify token. Set APIFY_API_TOKEN or pass --token.")

    output_path = Path(args.out)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    result = collect(args.actor_id, args.token, args.max_matches, args.include_details, args.timeout_seconds)
    output_path.write_text(json.dumps(result, indent=2, sort_keys=True), encoding="utf-8")
    print(
        json.dumps(
            {
                "source": result.get("source"),
                "status": result.get("status"),
                "item_count": result.get("item_count"),
                "error": result.get("error"),
                "out": str(output_path),
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
