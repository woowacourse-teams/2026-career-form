# Browser interaction tests

CF-178 adds a Chromium test project for browser behavior that jsdom cannot
prove. All pages, values and responses are synthetic. These tests do not
install the extension, contact recruitment sites or call an LLM.

## Setup and commands

Run from `frontend/` on Linux/WSL with Node 22 or later:

```sh
npm ci
npm exec -- playwright install --with-deps chromium
npm run test:unit
npm run test:browser
npm test
npm run coverage
```

- `unit` retains the existing jsdom setup and CSS Modules configuration.
- `browser` collects only `*.browser.test.ts(x)` and uses Playwright Chromium.
- `npm test` runs both projects. For a targeted unit test, use
  `npm run test:unit -- path/to/file.test.ts`.
- The default reporter rejects a combined run that collects no browser
  specifications. Do not override reporters in the CI coverage command.
- An absent browser installation is an error, not a skipped test.
- One worker bounds memory and CPU contention for instrumented DOM tests.
- Coverage includes the same product sources and keeps all four 80%
  thresholds. `reportOnFailure` prints coverage even when a test fails; it
  does not change the failing exit status.

For a visible browser run:

```sh
npm run test:browser -- --browser.headless=false
```

A Linux environment without a display can use `xvfb-run -a` before that
command. Test success is determined by assertions and production executor
results, not by a screenshot.

The lockfile pins Vitest, `@vitest/browser-playwright` and coverage-v8 to
4.1.10, and Playwright to 1.64.0. The initial implementation was exercised
with Node 22.20.0 and Chromium 156.0.8078.4 (Playwright revision 1248).

## Existing-to-browser mapping

Paths below are relative to `frontend/`.

- `entrypoints/autofill.content/style.test.ts` checks pointer and viewport
  rules. `style.browser.test.ts` adds an actual ShadowRoot, unchanged product
  CSS, the WXT reset and provider-driven clicks outside/inside the panel.
  Keep the jsdom checks for their separate viewport assertions.
- `src/autofill/interaction/day-calendar-executor.test.ts` covers leap days,
  focus opening, existing values and stale targets. The adjacent
  `day-calendar-executor.browser.test.ts` exercises native focus, replacement
  selects, an exact leap-day result, existing-value protection and target
  replacement. Date formats, month limits, disabled days and budget
  combinations stay in jsdom.
- `src/autofill/interaction/readonly-search-executor.test.ts` covers native
  GET/POST responses, action changes and existing-value conflicts. The
  adjacent `readonly-search-executor.browser.test.ts` adds real same-origin
  GET navigation, a new response Document, exact selection once, submission
  prevention after an action change and an untouched conflicting value.
  POST, alternate queries, relation effects and the broader safety matrix
  stay in jsdom. No existing failing test was removed or weakened.

The browser files cover eight selected scenarios. Existing test files are
unchanged because the browser cases add distinct runtime evidence rather
than reproduce the entire unit safety matrix.

## Fixture boundaries

- `day-calendar-fixture.ts` renders a small ui-datepicker-shaped widget.
  Focus opens it; changing year/month replaces the controls; selecting a
  day dispatches `change` and closes it synchronously. The production
  executor performs every automatic action and retains its normal timing
  policy. The fixture has no delay-based synchronization.
- `search-fixture-server.ts` is mounted only in the browser project's Vite
  server. It serves local GET forms and responses under `/__cf178/search/`.
  Native form submission changes the real iframe Document. No
  `contentDocument`, `URL` or `readyState` property is redefined.
- The GET form places its hidden route before the query control. This is
  the explicit form contract of this synthetic case, not evidence that
  every form serialization order is supported.
- `search-fixture.ts` subscribes to `load` before changing `src` or running
  the executor. A four-second timeout is only the failure bound. Selection
  events from the synthetic response update the owning readonly field,
  modeling the site's result-click handler rather than bypassing the
  production executor.
- Every test disposes its DOM and event listeners. Search disposal also
  aborts the production transaction. No fake timers, fixed sleeps or
  automatic retries are used by these browser cases.

## CI

`.github/workflows/frontend-ci.yml` runs on pull requests and pushes to
`develop`/`main`. It uses pinned Actions, Node 22, the npm lockfile cache,
Chromium with Linux dependencies, `contents: read`, and a 30-minute limit.

CI executes `npm run coverage` once: that command runs both projects and
checks their combined product coverage. No `continue-on-error` or retry
turns a failure into success. The workflow records runtime versions in its
log and does not upload screenshots, traces or artifacts.

The user explicitly approved including this protected workflow in CF-178.
The Issue and PR still require `harness-change`; shared-file validation is
unchanged. This workflow does not alter branch-protection required checks.

An actual passing PR check is required before claiming CI validation.
Local Chromium success is not installed-extension E2E, a real-site
baseline, or completion of CF-175's DOM snapshot work.
