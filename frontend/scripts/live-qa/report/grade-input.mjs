// Builds the blind pre-grading input from a value-free census. Graders see
// structure only: no fingerprints, keys, values or value flags.

export const HPLACE_STEPS = {
  1: "기본정보",
  2: "학력/연구/경력/NCS",
  3: "어학/자격/기타",
  4: "자기소개서/역량기술서",
};
const KEPT = [
  "i",
  "type",
  "name",
  "id",
  "section",
  "label",
  "options",
  "selectOptions",
  "required",
  "disabled",
  "readonly",
  "maxLength",
  "role",
  "hidden",
  "companionOf",
];
const present = (value) =>
  value !== undefined &&
  value !== null &&
  value !== "" &&
  value !== false &&
  !(Array.isArray(value) && value.length === 0);

// label: "<platform>-<site>[-s<step>]", e.g. "hp-gsenc-s2" or "gr-kurly".
export function parseLabel(label) {
  const [platform, site, step] = label.split("-");
  const stepNumber = /^s([1-9])$/.exec(step ?? "")?.[1];
  return {
    platform,
    site,
    step: step ?? null,
    stepName: stepNumber ? (HPLACE_STEPS[stepNumber] ?? null) : null,
  };
}

// Control numbers run across all frames so `i` is unique on the page. Census
// files from framesCensus already are; older per-frame files get renumbered.
export function pageIndexed(frames) {
  let i = 0;
  return frames.map((f) => ({
    ...f,
    controls: f.controls.map((c) => ({ ...c, i: i++ })),
  }));
}

export function buildGradeInput(label, census, addButtons = []) {
  const frames = pageIndexed(census);
  const controls = [];
  for (const frame of frames)
    for (const c of frame.controls) {
      const d = {};
      // Index 0 is a real control: keep numbers even when falsy.
      for (const k of KEPT) if (k === "i" || present(c[k])) d[k] = c[k];
      if (!frame.main) d.frame = frame.frame;
      controls.push(d);
    }
  return {
    label,
    ...parseLabel(label),
    url: frames[0]?.url ?? null,
    controlCount: controls.length,
    controls,
    addButtons,
  };
}
