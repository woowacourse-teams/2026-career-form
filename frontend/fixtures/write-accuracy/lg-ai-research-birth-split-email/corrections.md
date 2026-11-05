# Measurement correction: stale evidence

The all-unscored report in `run-2026-10-21T16:06:30.000Z` has
`MISSING_TRUTH`, not `TRUTH_IDENTITY_MISMATCH`. It predates the LG truth
commit `1df57b7`. The later `run-2026-10-21T16:31:10.185Z` matches all
10 truth entries and reports zero unscored candidates.

The runner loads truth from `fixtures/write-accuracy/<snapshot>/truth.json`
relative to the frontend working directory. Zero-based collection ordinal,
ordered structural paths, row index, and control kind all match. In particular,
the `form:nth-child(3)` prefix matches the runner's full sanitized HTML assigned
to `document.body.innerHTML`; there is no index-base or row-grouping mismatch.

Correction: refresh measurement evidence, not truth. The known split-email
wrong write remains visible as `WRONG_VALUES` and `reportedSuccessButWrong`.
LG remains `UNREVIEWED`, so its measured denominator is not a reviewed score.
Expected DOM states, preserve flags, exercisability, and profile bindings are
unchanged and remain derived from the snapshot, review, and synthetic profile.
