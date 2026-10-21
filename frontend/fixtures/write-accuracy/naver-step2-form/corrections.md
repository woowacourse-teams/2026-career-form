# Measurement correction: stale evidence

The all-unscored report in `run-2026-10-21T16:06:30.000Z` has
`MISSING_TRUTH`, not `TRUTH_IDENTITY_MISMATCH`. It predates the NAVER truth
commit `5f6389a`. The later `run-2026-10-21T16:29:58.012Z` matches all
46 truth entries and reports zero unscored candidates.

The runner loads truth from `fixtures/write-accuracy/<snapshot>/truth.json`
relative to the frontend working directory. It compares zero-based collection
ordinal, ordered body-relative `:nth-child()` paths, row index, and control kind.
All four identity components match for every entry. The `form:nth-child(3)`
prefix is correct for the runner's `document.body.innerHTML` loading boundary;
it must not be changed to the form's position in a separately parsed document.

Correction: replace the pre-truth measurement evidence with a fresh measurement.
No truth content, identity, profile key, expected DOM state, preserve flag, or
exercisable decision is changed. Snapshot structure, `review.md`, and the
synthetic profile remain the truth sources; observed writes are not truth.
