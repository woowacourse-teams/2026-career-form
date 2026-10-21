# DOM snapshot review: naver-education-stage

Status: DONE_PENDING_HUMAN_REVIEW. This is a committed review candidate,
not an approved registration or a benchmark denominator.

## Scope and authorization

- Issue #312, public site_id `naver`, collected 2026-10-21.
- The user prepared the first education row by selecting high school.
  A read-only probe confirmed `highSchoolSelected: true` before extraction.
- Source: directly sanitized DOM snapshot, not a hand-written reconstruction.
- Installed extension revision: UNVERIFIED. Product baseline:
  `6c9c06da16c01f58c0495c317ba299ef76e7597d`.
- Scope: the first `rcform_copy_prt` group's first `rcform_copy` row only,
  including both stage branches and their nested, closed search surfaces.
- No clicks, writes, selections, analysis, scrolling, navigation, or reloads
  were performed by the collector.

## Sanitization and structural comparison

The original stays inside the browser. A fresh inactive document receives
only allowlisted tags and attributes. Text and text attributes become
`[TEXT]`; option labels become `[OPTION]`; add-action semantics become
`[ADD]` so the real generic repeat-row detector can still identify them.
These tokens are synthetic, not retained source text. The collection skill
does not prescribe literal token spellings.

IDs and names are consistently anonymized, including label and ARIA
references. Duplicate IDs are retained rather than repaired. Only reviewed
structural classes from the existing NAVER fixture are retained. Other
classes, all data attributes, native hidden metadata inputs, original CSS,
scripts, callbacks, URLs, resources, actual values/defaults, and original
selected/checked state are excluded.

The visible stage select's second option is selected synthetically to
represent the confirmed high-school state. CSS-hidden nodes are represented
by `hidden` attributes. There is no synthetic interaction script or style.

| Structural property                   | Source                     | Sanitized                  |
| ------------------------------------- | -------------------------- | -------------------------- |
| Education rows                        | 1                          | 1                          |
| Native non-metadata controls          | 23                         | 23                         |
| Visible controls                      | 5                          | 5                          |
| Hidden controls                       | 18                         | 18                         |
| Select controls                       | 6                          | 6                          |
| Text inputs                           | 17                         | 17                         |
| Option counts, in select order        | 6, 19, 6, 19, 7, 9         | 6, 19, 6, 19, 7, 9         |
| Visible control ordinals (zero-based) | 0, 1, 2, 5, 6              | 0, 1, 2, 5, 6              |
| Disabled controls                     | 0                          | 0                          |
| Readonly control ordinals             | 2, 5, 6, 9, 12, 15, 20, 21 | 2, 5, 6, 9, 12, 15, 20, 21 |

The same ancestor hidden/display/visibility predicate was used inside the
browser for the ordered visibility comparison. The readiness probe also
checked nonzero bounding size. The source and sanitized ordered control,
option, hidden, readonly, and disabled states are compared separately from
the product collector's candidate inventory.

Native hidden metadata removal changes raw sibling paths. Native
non-metadata control order remains intact; the task-3 hidden minor candidate
is checked by row-local ordinal 16, not by the obsolete raw sibling path.
The live readiness probe independently reconfirmed the original path.
Both stage branches remain children of the same education row.

## Human gates

인간 개인정보·구조 검토: PENDING (PR 본문에 명시, 머지 전 확인 필요)

Commit-before-review deviation: the coordinator authorized committing this
sanitized fixture before human review. This does not approve registration,
benchmark eligibility, or merge; both human reviews remain pending.

| Review                                                             | Result               | Date         |
| ------------------------------------------------------------------ | -------------------- | ------------ |
| Residual personal/account/session information                      | PENDING HUMAN REVIEW | Not approved |
| Stage branching, same-row ownership, and hidden-state preservation | PENDING HUMAN REVIEW | Not approved |

The reviewer must separately answer:

1. Does the candidate contain only placeholders, synthetic codes, anonymous
   identifiers, and nonpersonal structural tokens?
2. Compared with the still-open source page, does one education row retain
   the visible high-school stage and controls and the hidden other-stage
   controls, including the observed minor control?
3. Are the removal of metadata inputs, text/option semantics, CSS, dynamic
   search/calendar behavior, and unrelated sections acceptable for this
   narrow structural baseline?

Do not infer structural approval from privacy approval. No metadata.json is
issued as an approved registration until those reviews pass.

## Offline verification

Test: `frontend/src/autofill/workflow/dom-snapshot.naver-education-stage.test.ts`.
It calls the real `collectFieldsSnapshot` and asserts the generic route,
one row, visible high-school controls, and a hidden other-stage control in
that same row. No product function is mocked. The mutation removes all
`hidden` attributes only from the in-memory test document and must make the
same load contract throw.

Execution results, product candidate inventory, offline external-request
check, and command exit codes are recorded in
`.omo/evidence/generic-stage-check-and-write-accuracy/fixture/task-4.md`
in the coordinator workspace.

The product collector returns one section, zero ordinary section fields,
and one repeated row with 23 candidates: 5 visible and 18 hidden. The
unmodified load contract passes; removing hidden state in memory rejects
that same contract. Offline Chromium reports zero external request attempts
and zero executable/external-resource elements. The sanitized DOM has 24
buttons (2 add actions), 5 duplicate ID kinds, and no missing label targets.
An optional final source-reference count probe could not run because the
Playwriter extension disconnected after the successful extraction; source
duplicate/reference counts therefore remain unverified for human review.

This is a collection-stage structural baseline. It does not execute LLM
mapping, stage mismatch correction, writes, the installed extension, site
scripts, or server behavior. It does not establish live-site accuracy.

## Handoff

Fixture commit authorized by the coordinator; no push, PR, merge, or Wiki write. The existing `naver-step2-form`
fixture is unchanged. Final registration and benchmark eligibility remain
blocked on the two human reviews.
