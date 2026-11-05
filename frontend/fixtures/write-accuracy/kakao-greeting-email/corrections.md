# Measurement correction: stale evidence

The all-unscored report in `run-2026-10-21T16:06:30.000Z` has
`MISSING_TRUTH`, not `TRUTH_IDENTITY_MISMATCH`. It predates the Kakao truth
commit `1df57b7`. The later `run-2026-10-21T16:31:43.721Z` matches all
53 truth entries and reports zero unscored candidates.

All runner identity components match: zero-based collection ordinal, ordered
body-relative structural paths, row index, and control kind. Truth is loaded
from the frontend working directory. The `form:nth-child(3)` prefix reflects
the runner's full sanitized HTML assignment to `document.body.innerHTML`,
not an independently parsed HTML document's body.

Correction: refresh the measurement evidence. No identity or semantic truth
change is needed. Existing missing-combobox-option and page-script limitations
remain documented by the unchanged exercisable reasons. Two held candidates
remain held rather than being relabeled to improve accuracy. Kakao remains
`UNREVIEWED` and is measured separately from reviewed snapshots.
