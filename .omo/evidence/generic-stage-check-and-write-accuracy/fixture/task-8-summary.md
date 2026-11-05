# Issue #313 todo 8 verification

## Required gates

- `cd frontend && npx tsc --noEmit -p tsconfig.json`: exit 0.
- `npx vitest run --configLoader runner --project unit src/autofill/workflow/write-accuracy --testTimeout=180000`:
  exit 1 by the explicit missing-truth contract, 18 passed and 5 failed.
- `write-accuracy.runner.test.ts`: 11 passed, including deliberately wrong truth,
  page reversion, missing truth entry, preservation mutation, route mismatch,
  conservation, truth validation, manifest coverage and aggregate isolation.
- `write-accuracy.routes.test.ts`: 7 passed. SK resolves through its real policy;
  six sanitized Hplace fixtures are excluded without inventing fingerprints.
- `write-accuracy.test.ts`: four snapshot tests and aggregate are deliberately
  red. Every snapshot diagnostic is exactly `MISSING_TRUTH,UNSCORED_FIELDS`.
  No timeout, route, preservation, wrong-value or collection failure occurred.
- Final focused invocation took 162.23 seconds. Full output: `task-8.txt`.
- Post-format synthetic runner recheck: 11 passed, exit 0, recorded in
  `task-8-selftest-final.txt`.

Final per-run JSON is in `write-accuracy/run-2026-10-21T16:06:30.000Z/`.
The aggregate has no missing or extra snapshot result. It separates 84 reviewed
and 63 unreviewed unscored candidates: AhnLab 38, Kakao 53, LG 10, NAVER 46.
No real-snapshot truth content was authored; todos 9-12 own those files.

## Additional checks and environment

- `.venv/bin/python harness/scripts/verify.py --base-ref origin/develop`: exit 0.
- Prettier check of both accuracy directories: exit 0.
- `git diff --cached --check`: exit 0 before committing.
- ESLint explicitly ignores TypeScript in the repository's existing config;
  invoking it on this TypeScript-only directory exits 2 without linting files.
- The initial test startup failure in `task-8-red.txt` was a dependency-loading
  failure, not an assertion failure. The shared node_modules symlink resolved
  but lacked declared lockfile packages. Only the local symlink was removed;
  `npm ci --ignore-scripts` installed a private worktree copy, exit 0. No shared
  checkout, lockfile, adapter or policy code was changed. The install reported
  10 dependency advisories; dependency upgrades are outside this task.
- No whole frontend unit suite, production build, push or PR was run here.

## Final source and fixture inventory

Under `frontend/fixtures/write-accuracy/`:

- `README.md`
- `manifest.json`
- `profile.synthetic.json`
- `truth.schema.json`
- `synthetic/form.html`
- `synthetic/truth.json`

Under `frontend/src/autofill/workflow/write-accuracy/`:

- `fixtures.ts`
- `manifest.ts`
- `report.ts`
- `runner.ts`
- `schema.ts`
- `truth.ts`
- `write-accuracy.routes.test.ts`
- `write-accuracy.runner.test.ts`
- `write-accuracy.test.ts`

The ownership inventory contained 14 files. All were retained and reconciled;
the README is the fifteenth. The other writer's `truth.schema.json`,
`synthetic/form.html`, `synthetic/truth.json`, `manifest.ts`, `report.ts`, and
`truth.ts` were taken over. Their useful form, validation and per-control
aggregation behavior was preserved while unifying ordinal/path-array identities,
truth loading, report types and the product pipeline.
