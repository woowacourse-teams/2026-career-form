# Profile search controls

## 1. Atmosphere and identity

Preserve the existing warm, compact profile editor. Search is an enhancement
to its name fields, not a redesign of the page.

## 2. Color

Reuse `src/styles/theme.css`: `--color-surface`, `--color-surface-muted`,
`--color-text`, `--color-text-strong`, `--color-text-muted`,
`--color-border`, `--color-focus`, and `--color-action`.
Highlight the active option with a surface wash, not a colored border.

## 3. Typography

Use the inherited `--font-ui` Pretendard stack. Name fields and option names
are 14px; supporting details and status messages are 12px with 1.5 line height.
Long institution names and locations wrap rather than truncate.

## 4. Spacing and layout

Keep ProfileForm's existing two-column grid and single column below 440px.
The search field spans its existing grid cell. The suggestion list stays in
document flow so the entry card's overflow clipping cannot hide results.
Controls have a minimum 44px target; list padding is 4px and option padding
is 10px 12px. The list owns vertical scrolling with a 240px maximum height.

## 5. Components

`CatalogNameInput` contains the existing labeled input, a result list and
status/help text. Its states are untouched legacy text, searching, no results,
selected catalog record and unverified direct input. The result list includes
an explicit direct-input option. A separate reset action clears the name.
The same control serves certificate, school and language-test names, with
kind-specific results. Selecting an exam does not change its language or grade.

The input uses combobox/listbox semantics, `aria-expanded`, `aria-controls`,
`aria-activedescendant`, and linked description text. Arrow keys navigate,
Enter chooses only an active result, Escape closes without changing the value,
and Tab leaves without implicitly selecting. IME confirmation never selects
a result. Result changes reset the active option. Focus remains in the input
when a result is selected. Each repeated row owns distinct control IDs.

## 6. Motion and interaction

No new animation is necessary. Preserve native text editing and visible focus
rings. Pointer and keyboard selection produce identical stored values.
Typing is direct input until the user explicitly chooses a catalog record.

## 7. Depth and surface

Use the existing border-only field treatment and `--radius-control`.
Suggestions are a bordered surface with no overlay or shadow.

## 8. Accessibility and accepted constraints

Names, campus/location/issuer details and selected/direct-input status are
visible text. Search is local and works offline; missing records remain
enterable. The catalog is not a claim of complete historical/worldwide
coverage. Retain existing page styling and dependencies; this change does
not introduce development instrumentation or a new component framework.
