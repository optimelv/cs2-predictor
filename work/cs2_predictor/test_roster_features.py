from __future__ import annotations

import unittest

from .build_model_dataset import TeamState, roster_context


class RosterFeatureTests(unittest.TestCase):
    def test_unknown_lineup_uses_neutral_prior(self) -> None:
        self.assertEqual(roster_context(set(), TeamState(), 1_000), (0.6, 0, 30.0))

    def test_changed_lineup_is_available_before_result(self) -> None:
        state = TeamState(last_lineup={"a", "b", "c", "d", "e"}, roster_changed_timestamp=100)
        continuity, known, days = roster_context({"a", "b", "c", "x", "y"}, state, 1_000)
        self.assertAlmostEqual(continuity, 0.6)
        self.assertEqual(known, 1)
        self.assertEqual(days, 0.0)

    def test_stable_lineup_accumulates_tenure(self) -> None:
        lineup = {"a", "b", "c", "d", "e"}
        state = TeamState(last_lineup=lineup, roster_changed_timestamp=100)
        continuity, known, days = roster_context(lineup, state, 100 + 12 * 86400)
        self.assertEqual(continuity, 1.0)
        self.assertEqual(known, 1)
        self.assertEqual(days, 12.0)


if __name__ == "__main__":
    unittest.main()
