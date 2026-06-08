from __future__ import annotations

import gzip
import json
import time
from typing import Any, Dict, Optional
from urllib.request import Request, urlopen


class RateLimitedHttpClient:
    def __init__(self, user_agent: str) -> None:
        self.user_agent = user_agent
        self._bucket_next_ready: Dict[str, float] = {}

    def _sleep_for_bucket(self, bucket: str, min_interval_seconds: float) -> None:
        if min_interval_seconds <= 0:
            return
        now = time.monotonic()
        ready = self._bucket_next_ready.get(bucket, now)
        if ready > now:
            time.sleep(ready - now)
        self._bucket_next_ready[bucket] = time.monotonic() + min_interval_seconds

    def get_text(
        self,
        url: str,
        *,
        bucket: str = "default",
        min_interval_seconds: float = 0.0,
        timeout: int = 60,
        headers: Optional[Dict[str, str]] = None,
    ) -> str:
        self._sleep_for_bucket(bucket, min_interval_seconds)
        request_headers = {
            "User-Agent": self.user_agent,
            "Accept-Encoding": "gzip",
        }
        if headers:
            request_headers.update(headers)

        request = Request(url, headers=request_headers)
        with urlopen(request, timeout=timeout) as response:
            payload = response.read()
            if response.headers.get("Content-Encoding") == "gzip":
                payload = gzip.decompress(payload)
        return payload.decode("utf-8", "replace")

    def get_json(
        self,
        url: str,
        *,
        bucket: str = "default",
        min_interval_seconds: float = 0.0,
        timeout: int = 60,
        headers: Optional[Dict[str, str]] = None,
    ) -> Any:
        return json.loads(
            self.get_text(
                url,
                bucket=bucket,
                min_interval_seconds=min_interval_seconds,
                timeout=timeout,
                headers=headers,
            )
        )
