from datetime import datetime, timedelta, timezone
import unittest

from .validation import make_purged_time_folds


class TimeFoldTests(unittest.TestCase):
    def test_purged_folds_preserve_original_indices_and_strict_cutoff(self):
        start = datetime(2025, 1, 1, tzinfo=timezone.utc)
        times = [start + timedelta(days=i // 2) for i in range(80)][::-1]
        folds = make_purged_time_folds(times, n_splits=3, purge_days=2, min_train_size=5)
        tested = []
        for fold in folds:
            self.assertTrue(all(times[i] < fold.test_start - timedelta(days=2) for i in fold.train_indices))
            self.assertEqual(fold.train_end, max(times[i] for i in fold.train_indices))
            self.assertEqual(fold.test_start, min(times[i] for i in fold.test_indices))
            self.assertFalse(set(fold.train_indices) & set(fold.test_indices))
            tested.extend(fold.test_indices)
        self.assertEqual(len(tested), len(set(tested)))

    def test_invalid_purge_and_train_size_fail_before_creating_leaky_folds(self):
        times = [datetime(2025, 1, 1) + timedelta(days=i) for i in range(300)]
        for options in ({"purge_days": -1}, {"min_train_size": 0}):
            with self.subTest(options=options), self.assertRaises(ValueError):
                make_purged_time_folds(times, **options)
