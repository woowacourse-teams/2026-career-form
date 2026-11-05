// Page functions for Hplace MRS2 step navigation without saving.
// Ported from the CF-177 live-eval tool.

// The current step and whether the navigation keys are present. Returns
// booleans and numbers only, never the keys themselves.
export function readStep() {
  const form = document.querySelector("form#frm");
  const read = (name) =>
    document.querySelector(`input[name="${name}"]`)?.value ?? "";
  let step = /^[1-9]$/.test(read("step")) ? Number(read("step")) : null;
  if (step === null) {
    const active = document
      .querySelector(
        "#tab li.active button[data-step], #tab .active > button[data-step]",
      )
      ?.getAttribute("data-step");
    if (/^[1-9]$/.test(active ?? "")) step = Number(active);
  }
  const key = (value) => /^[A-Za-z0-9_-]{1,64}$/.test(value) && value !== "0";
  return {
    formPresent: Boolean(form),
    step,
    navigable: key(read("resumeSn")) && key(read("recruitNoticeSn")),
    controls: form
      ? form.querySelectorAll(
          "section.writeResume[data-code] input, section.writeResume[data-code] select",
        ).length
      : 0,
    marker: window.__careerFormLiveQaNavigation ?? null,
  };
}

// POSTs {resumeSn, recruitNoticeSn, step} to writeResume, which is what the
// site's preview-mode tab move does. The site's save handlers are never called,
// so nothing is stored. Step 5 (final submit) is not a target.
export function submitStepNavigation(step) {
  const read = (name) => document.querySelector(`input[name="${name}"]`)?.value;
  const resumeSn = read("resumeSn");
  const recruitNoticeSn = read("recruitNoticeSn");
  if (!Number.isSafeInteger(step) || step < 1 || step > 4)
    return { ok: false, code: "invalid-step" };
  if (!resumeSn || resumeSn === "0" || !recruitNoticeSn)
    return { ok: false, code: "navigation-keys-missing" };
  const form = document.createElement("form");
  form.method = "post";
  form.action = "/mrs2/applicant/resume/writeResume";
  form.style.display = "none";
  for (const [name, value] of [
    ["resumeSn", resumeSn],
    ["recruitNoticeSn", recruitNoticeSn],
    ["step", String(step)],
  ]) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.append(input);
  }
  document.body.append(form);
  window.onbeforeunload = null;
  // The guard (page/guard.mjs) stays armed: only this form goes out, through
  // the native submit it kept.
  const submit =
    window.__careerFormLiveQa?.nativeSubmit ?? HTMLFormElement.prototype.submit;
  submit.call(form);
  return { ok: true };
}
