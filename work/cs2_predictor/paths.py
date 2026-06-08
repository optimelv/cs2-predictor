from __future__ import annotations

from pathlib import Path


PACKAGE_ROOT = Path(__file__).resolve().parent
WORK_ROOT = PACKAGE_ROOT.parent
DATA_ROOT = WORK_ROOT / "data"
RAW_ROOT = DATA_ROOT / "raw"
BRONZE_ROOT = DATA_ROOT / "bronze"
MANIFEST_PATH = BRONZE_ROOT / "collection_manifest.json"


def source_raw_root(source_name: str) -> Path:
    return RAW_ROOT / source_name
