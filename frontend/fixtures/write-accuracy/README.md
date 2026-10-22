# Offline write accuracy

Run from `frontend/`:

```sh
npx vitest run --configLoader runner --project unit src/autofill/workflow/write-accuracy --testTimeout=180000
npx vitest run --configLoader runner --project unit src/autofill/workflow/write-accuracy/write-accuracy.test.ts -t "naver-step2-form" --testTimeout=180000
```

`manifest.json` preserves fixture review and routing decisions. Only `RUNNABLE`
contributes to the reviewed score. `UNREVIEWED` is executed and reported in a
separate bucket. Other statuses are excluded with their reasons. Hplace's
removed script fingerprint is not synthesized; SK uses the existing policy
fixture and the product route resolver.

Author `<snapshot>/truth.json` against `truth.schema.json` before measuring.
No real-snapshot truth is included in the runner unit. The synthetic fixture is
only a self-test. `ordinal` is zero-based product collection order.
`structurePath` contains every control node's body-relative tag and
`:nth-child()` path, without site identifiers. `rowIndex` is the collected
profile row index, or `null` outside a repeated row. `accuracyCandidates()`
exports these identities without labels or values.

`expectedDomState` is either a native control's `value`, the ordered
`checkedValues` of a radio/checkbox group, or a custom control's `text`.
These expected states are independent of the mapping and writer output.
Use `preserve: true` for non-targets and provide a prior reason for every
`exercisable: false`. `writeCommand` and `binding` optionally fix a widget or
derived mapping contract; defaults cover native text, select and radio.

`attempted` counts scored, exercisable candidates evaluated through the
pipeline, including candidates the product holds instead of approving.
`approved` counts product-selected executable candidates. A scored candidate is
`correct` when DOM readback matches truth, `wrong` when a write reports success
or changes the DOM to a different state, and otherwise `held`. Thus
`attempted = correct + wrong + held`. `reportedSuccessButWrong` is a subset of
`wrong`. Unapproved, hidden and explicitly preserved fields are also compared
with their pre-run states.

Each measurement invocation creates a fresh ISO-named directory under
`.omo/evidence/generic-stage-check-and-write-accuracy/fixture/write-accuracy/`.
Reports contain structural identities, counters and diagnostic codes, never
DOM values, labels, options or document URLs. Missing truth is a deliberate
failure with `MISSING_TRUTH` and `UNSCORED_FIELDS`, not an empty passing score.
The final aggregate reads only reports produced in that test file invocation.
