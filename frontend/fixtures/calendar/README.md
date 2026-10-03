# Calendar role workflow fixtures

## Evidence boundary

On 2026-09-30, the two already-connected application pages were inspected
without opening, closing, focusing or changing their calendar inputs.
No application values, account identifiers or session URLs are stored here.

- The first widget uses a readonly month input, an adjacent image trigger and
  one shared jQuery popup. Its observed configuration enables year/month
  selects and a button panel, formats `yy-mm`, and commits the selected month
  in its close callback. Month mode hides the day table. Opening and closing
  this widget is not a read-only probe.
- The second widget uses a readonly input, focus-to-open and an initially empty
  shared popup. Observed jQuery 1.7.2 / Datepicker 1.8.21 settings use `yy-mm`,
  enable year changes, disable the month dropdown and button panel, and have no
  custom close/select callback. Its open DOM and actual commit behavior were
  not executed. It must not be represented as the first widget with another
  input class, nor as a proven full-date input.

Neither observation proves successful execution on a real application.

## Production workflow reproduction

From `frontend`:

```sh
VITE_API_BASE_URL=http://localhost:8080 npx vite --host 127.0.0.1 --port 4173
```

Open:

```text
http://127.0.0.1:4173/fixtures/calendar/role-workflow-browser.html
```

The fixture mounts the production `AutofillWorkflow`; it does not call the
low-level date executor directly. Its field mapping and interaction transport
are explicit test doubles. The role double selects only matching finite
structural evidence; it is not a live JEV verification.

To exercise the running backend's actual calendar provider instead, use:

```sh
VITE_API_BASE_URL=http://localhost:8080 npx vite --config fixtures/calendar/vite.config.ts --port 4173
```

Open the same page with `?decision=live`. This proxies only the interaction
endpoint to the already-running local backend; it neither reads keys nor
changes backend configuration. Field mapping stays synthetic. Calendar requests
contain structural role candidates, never the target date or profile values.
The output reports the navigation decision and actual navigation click count.
An observation-only navigation abstention must not veto an independently
confirmed year/month select. Required-role abstention still stops execution,
and navigation controls are never activated.

The input has an unrelated application class and the mechanical widget marker.
The image has no invented ARIA ownership link, and the shared popup starts empty.
The synthetic popup reproduces the observed year/month controls and close
behavior, with no real application data.

1. Verify the date starts empty and the popup remains closed.
2. Include the date using its review button.
3. Use the main button to write both selected items.
4. Require `ordinary=합성 사용자`, `date=2026-03`,
   `peer=synthetic-preserved`, a closed popup, and bounded role calls.
5. Repeat with `?decision=abstain`; the date must remain empty and the popup
   must not open when the opener decision is withheld.
6. Repeat with `?decision=ownership-conflict` and `?decision=unit-conflict`.
   These deliberately inject a competing synthetic popup link or conflicting
   label during the provider response. Require `openings=0`, an empty date,
   and an unchanged peer. The competing ARIA link is an adversarial mutation,
   not a fabricated ownership link attributed to either observed real widget.

Inspect the write diagnostic's `run.status` and `final.status` as well as
the actual input values. The fixture deliberately uses `LLM_SUGGESTED` field
mapping. The existing result model keeps unverified suggestions in its
confirmation-needed presentation even after a successful write; that display
is not evidence that calendar execution failed.

`unified-workflow-browser.html` remains the older, explicitly ARIA-linked
workflow fixture. `jquery-shared-monthpicker.html` calls lower-level modules
and is not sufficient evidence for the main-button workflow.

## Provider limits

Official documentation checked on 2026-09-30:

- [Models](https://docs.typesafe.ai/models): 64k tokens for the whole request,
  32k for state plus the longest question; currently 40 requests/second and
  100k tokens/second, subject to change.
- [Choice](https://docs.typesafe.ai/primitives/choice): at most 255 options,
  including abstention; confidence and option probabilities are returned.

The calendar contract deliberately uses smaller local limits: 8 candidates
per decision, 8 decisions and 32 total candidate entries per request,
16 KiB serialized request size, and 4 calls per calendar execution.
The byte limit is a conservative local bound, not an exact token count or an
official HTTP byte limit. No whole DOM, profile, target date, field value,
selector or handler source belongs in a calendar role request.

## Asynchronous day-calendar reproduction

Use the same Vite proxy command above and open:

```text
http://127.0.0.1:4173/fixtures/calendar/day-workflow-browser.html?decision=live
```

This synthetic page mounts the production `AutofillWorkflow` and uses the
existing backend only for bounded calendar-role decisions. Field mapping and
profile data remain explicit synthetic doubles. The shared day popup has year
and 0-based month selects, day cells, and a `yy-mm-dd` input contract.

The observed 1 ms postprocessing is gated on the year-role request: after
starting the transport, it adds year movement buttons, moves the title, and
changes only root positioning styles on the original controls. This deliberately
reproduces the provider/DOM race without adding a wait to production code.

1. Leave the calendar closed; click the date row's `포함하기` review button.
2. Click the main `2개 항목 기입하기` button.
3. Require `calls=4`, `openings=1`, `postprocessingDuringYear=true`,
   `date=2026-03-15`, `ordinary=합성 사용자`, `peer=synthetic-preserved`,
   `popupClosed=true` and `navigationClicks=0`.
4. `?decision=navigation-abstain` uses a structural double to require successful
   selection despite navigation abstention. `?decision=abstain` must preserve
   the empty date and closed popup. Neither mode is live JEV evidence.

The actual application was observed read-only. Its final frontend stop reason
was not captured, so reproducing and fixing this stale-snapshot defect does not
prove successful selection on the actual application.
