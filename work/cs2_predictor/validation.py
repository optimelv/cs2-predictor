from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from math import log
from typing import Iterable, List, Sequence, Tuple


@dataclass(frozen=True)
class TimeFold:
    train_indices: List[int]
    test_indices: List[int]
    train_end: datetime
    test_start: datetime
    test_end: datetime


def make_purged_time_folds(
    timestamps: Sequence[datetime],
    n_splits: int = 5,
    purge_days: int = 7,
    min_train_size: int = 200,
) -> List[TimeFold]:
    """Create forward-only blocked folds for time-ordered samples.

    The input timestamps must already be aligned to the dataset order.
    Successive test windows are contiguous. Training windows only use
    samples strictly before the purged gap.
    """

    if n_splits < 2:
        raise ValueError("n_splits must be at least 2")
    if len(timestamps) < min_train_size + n_splits:
        raise ValueError("not enough samples for the requested split settings")

    indexed = list(enumerate(timestamps))
    indexed.sort(key=lambda item: item[1])
    sorted_indices = [idx for idx, _ in indexed]
    sorted_times = [ts for _, ts in indexed]

    total = len(sorted_times)
    fold_size = total // (n_splits + 1)
    purge_delta = timedelta(days=purge_days)

    folds: List[TimeFold] = []
    for split in range(n_splits):
        test_start_pos = (split + 1) * fold_size
        test_end_pos = total if split == n_splits - 1 else min(total, test_start_pos + fold_size)

        test_start_time = sorted_times[test_start_pos]
        test_end_time = sorted_times[test_end_pos - 1]
        train_cutoff_time = test_start_time - purge_delta

        train_indices = [
            sorted_indices[pos]
            for pos, ts in enumerate(sorted_times)
            if ts < train_cutoff_time
        ]
        test_indices = sorted_indices[test_start_pos:test_end_pos]

        if len(train_indices) < min_train_size or not test_indices:
            continue

        folds.append(
            TimeFold(
                train_indices=train_indices,
                test_indices=test_indices,
                train_end=sorted_times[max(pos for pos, ts in enumerate(sorted_times) if ts < train_cutoff_time)],
                test_start=test_start_time,
                test_end=test_end_time,
            )
        )

    if not folds:
        raise ValueError("no valid folds were created; adjust split settings")
    return folds


def brier_score(y_true: Sequence[int], y_prob: Sequence[float]) -> float:
    if len(y_true) != len(y_prob):
        raise ValueError("y_true and y_prob must have the same length")
    if not y_true:
        raise ValueError("inputs must not be empty")
    return sum((truth - prob) ** 2 for truth, prob in zip(y_true, y_prob)) / len(y_true)


def log_loss(y_true: Sequence[int], y_prob: Sequence[float], eps: float = 1e-15) -> float:
    if len(y_true) != len(y_prob):
        raise ValueError("y_true and y_prob must have the same length")
    if not y_true:
        raise ValueError("inputs must not be empty")

    clipped = [min(max(prob, eps), 1.0 - eps) for prob in y_prob]
    total = 0.0
    for truth, prob in zip(y_true, clipped):
        total += truth * log(prob) + (1 - truth) * log(1 - prob)
    return -total / len(y_true)


def accuracy_at_threshold(y_true: Sequence[int], y_prob: Sequence[float], threshold: float = 0.5) -> float:
    if len(y_true) != len(y_prob):
        raise ValueError("y_true and y_prob must have the same length")
    if not y_true:
        raise ValueError("inputs must not be empty")

    correct = 0
    for truth, prob in zip(y_true, y_prob):
        pred = 1 if prob >= threshold else 0
        correct += int(pred == truth)
    return correct / len(y_true)


def reliability_bins(
    y_true: Sequence[int],
    y_prob: Sequence[float],
    bins: int = 10,
) -> List[Tuple[float, float, int]]:
    if bins <= 0:
        raise ValueError("bins must be positive")
    if len(y_true) != len(y_prob):
        raise ValueError("y_true and y_prob must have the same length")

    step = 1.0 / bins
    output: List[Tuple[float, float, int]] = []
    for bin_index in range(bins):
        lower = bin_index * step
        upper = 1.0 if bin_index == bins - 1 else lower + step
        values = [
            (truth, prob)
            for truth, prob in zip(y_true, y_prob)
            if lower <= prob < upper or (bin_index == bins - 1 and prob == 1.0)
        ]
        if values:
            empirical = sum(truth for truth, _ in values) / len(values)
            predicted = sum(prob for _, prob in values) / len(values)
            output.append((predicted, empirical, len(values)))
        else:
            output.append((lower + step / 2, 0.0, 0))
    return output
