// Joins the frozen pre-grading (by census index) with the post-run census so
// a judge can compare expected and written values control by control.
// Controls are matched by identity (name, id, type, section, and label when
// there is no name) plus occurrence, so rows the run added do not shift the
// match. Post-run controls left unmatched are the rows the run created.

import { pageIndexed } from "./grade-input.mjs";

const flatten = (frames) =>
  frames.flatMap((f) =>
    f.controls.map((c) => ({ ...c, frameKey: f.key ?? f.frame })),
  );
// Frame is part of the identity: two frames can hold controls with the same name.
const identity = (c) =>
  [
    c.frameKey ?? "",
    c.name ?? "",
    c.id ?? "",
    c.type,
    c.section,
    c.name ? "" : c.label,
  ].join("\u0000");

function index(controls) {
  const seen = {};
  const map = {};
  for (const c of controls) {
    const k = identity(c);
    seen[k] = (seen[k] ?? 0) + 1;
    map[`${k}\u0000${seen[k]}`] = c;
  }
  return map;
}

export function joinResults({ label, final, census, run }) {
  const pre = index(flatten(pageIndexed(census)));
  const after = index(flatten(run.after ?? []));
  // Test-account runs record values before the run too (after the clear).
  const before = run.testAccount ? index(flatten(run.before ?? [])) : {};
  const graded = {};
  for (const g of final.controls) graded[g.i] = g;
  const used = {};
  const rows = [];
  for (const [k, pc] of Object.entries(pre)) {
    const g = graded[pc.i] ?? {};
    const ac = after[k];
    if (ac) used[k] = true;
    rows.push({
      i: pc.i,
      name: pc.name,
      type: pc.type,
      section: pc.section,
      label: (pc.label ?? "").slice(0, 60),
      category: g.category ?? "UNGRADED",
      profileKey: g.profileKey ?? "",
      expected: g.expected ?? "",
      afterPresent: Boolean(ac),
      afterHasValue: Boolean(ac?.hasValue),
      written: ac?.shown ?? null,
      changed: Boolean(ac?.changed),
      // The value after the run was already on the page before it. Outside
      // test-account mode it is not shown, so the judge cannot compare it.
      preexistingValue: Boolean(ac?.preexisting),
      ...(run.testAccount
        ? {
            beforeValue: before[k]?.shown ?? null,
            mountedAsIs: Boolean(ac?.mountedAsIs),
          }
        : {}),
    });
  }
  const addedOrUnmatchedAfterControls = Object.entries(after)
    .filter(([k]) => !used[k])
    .map(([, c]) => ({
      name: c.name,
      type: c.type,
      section: c.section,
      label: (c.label ?? "").slice(0, 60),
      written: c.shown ?? null,
      hasValue: Boolean(c.hasValue),
      ...(run.testAccount ? { mountedAsIs: Boolean(c.mountedAsIs) } : {}),
    }));
  return {
    label,
    testAccount: Boolean(run.testAccount),
    panel: run.panel ?? null,
    // Custom widgets the clear step left filled: rows holding them can look
    // like existing rows to the extension.
    widgetsLeft: (run.cleared ?? []).reduce(
      (a, c) => a + (c?.widgetsLeft ?? 0),
      0,
    ),
    rowExpansion: final.rowExpansion ?? [],
    rows,
    addedOrUnmatchedAfterControls,
  };
}
