"""Public tournament curation shared by the collector and model exporters."""
import json
import re
from pathlib import Path

_policy_path = Path(__file__).with_name("event-policy.json")
if not _policy_path.exists():
    _policy_path = Path(__file__).resolve().parent.parent.parent.parent / "docs/lib/event-policy.json"
POLICY = json.loads(_policy_path.read_text(encoding="utf-8"))


def product_tier(event_name: str, declared_tier: str = "") -> str:
    tier = declared_tier.strip().casefold()
    if tier in POLICY["excluded_tiers"] or re.search(POLICY["excluded_name_pattern"], event_name, re.I):
        return "excluded"
    if tier in POLICY["tier_one_aliases"]:
        return "tier_1"
    if tier in POLICY["tier_two_aliases"] and any(re.search(POLICY[key], event_name, re.I) for key in ("tier_two_name_pattern", "tier_one_name_pattern")):
        return "tier_2"
    if re.search(POLICY["tier_two_name_pattern"], event_name, re.I):
        return "tier_2"
    if re.search(POLICY["tier_one_name_pattern"], event_name, re.I):
        return "tier_1"
    return "pending"
