from __future__ import annotations

import argparse
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--out", default="config/oracle-worker.js")
    args = parser.parse_args()
    url = args.url.strip().rstrip("/")
    if not url.startswith("https://"):
        raise SystemExit("Worker URL must use HTTPS.")
    path = Path(args.out)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        f'export const ORACLE_WORKER_URL = {url!r};\n',
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
