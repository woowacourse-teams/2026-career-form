import { afterEach, expect, it } from "vitest";
import { collectFieldsSnapshot } from "../dom/collect";
import type { ReviewPlanItem } from "../review/review-plan";
import { createProgressTracker, progressCategory } from "./progress-model";

afterEach(() => document.body.replaceChildren());
function item(candidateId: string): ReviewPlanItem {
  return {
    candidateId,
    fieldLabel: "이름",
    profileFieldKey: "personal.personal.koreanGivenName",
    currentValue: "",
    profileValue: "private-value",
    previewValue: "private-value",
    status: "available",
    selected: true,
    disabled: false,
    revealed: false,
    reason: "",
  };
}
function snapshot() {
  const collected = collectFieldsSnapshot(document);
  return {
    registry: collected.registry,
    fields: collected.request.sections.flatMap((s) => s.fields),
  };
}
it("retains a concise field label when completed controls leave the latest snapshot", () => {
  document.body.innerHTML =
    "<label>국적 *필수항목<select><option>대한민국</option><option>가나</option><option>가봉</option></select></label>";
  const tracker = createProgressTracker();
  const { registry, fields } = snapshot();
  const country = {
    ...item(fields[0].candidateId),
    fieldLabel: fields[0].displayName ?? "",
    profileFieldKey: "personal.personal.nationality",
    profileValue: "대한민국",
  };
  const entries = tracker.record(
    country,
    { candidateId: country.candidateId, status: "written" },
    registry,
  );
  expect(entries[0].label).toBe("국적");
  expect(JSON.stringify(entries)).not.toContain("가봉");
});

it("reconciles retries and fresh snapshot IDs for the same control without retaining values", () => {
  document.body.innerHTML = '<label>이름<input id="name"></label>';
  const tracker = createProgressTracker();
  const first = snapshot();
  const a = item(first.fields[0].candidateId);
  tracker.record(
    a,
    { candidateId: a.candidateId, status: "written" },
    first.registry,
  );
  const next = snapshot();
  const b = item(next.fields[0].candidateId);
  expect(tracker.wasWritten(b.candidateId, next.registry)).toBe(true);
  const entries = tracker.record(
    b,
    {
      candidateId: b.candidateId,
      status: "skipped",
      reason: "verification-failed",
    },
    next.registry,
  );
  expect(entries).toHaveLength(1);
  expect(tracker.wasWritten(b.candidateId, next.registry)).toBe(false);
  expect(entries[0]).toMatchObject({
    category: "기본 인적사항",
    label: "국문 이름",
    status: "skipped",
  });
  expect(JSON.stringify(entries)).not.toContain("private-value");
});
it("keeps different controls with the same binding separate and retains more than six results", () => {
  document.body.innerHTML = Array.from(
    { length: 8 },
    (_, i) => `<label>이름<input id="name-${i}"></label>`,
  ).join("");
  const tracker = createProgressTracker();
  const { registry, fields } = snapshot();
  let entries;
  for (const field of fields)
    entries = tracker.record(
      item(field.candidateId),
      { candidateId: field.candidateId, status: "written" },
      registry,
    );
  expect(entries).toHaveLength(8);
});

it("does not transfer completion when a fresh snapshot reuses field-1 for an inserted control", () => {
  document.body.innerHTML = '<label>이름<input id="name"></label>';
  const tracker = createProgressTracker();
  const first = snapshot();
  const initial = tracker.record(
    item(first.fields[0].candidateId),
    { candidateId: first.fields[0].candidateId, status: "written" },
    first.registry,
  );
  document.body.insertAdjacentHTML(
    "afterbegin",
    '<label>전화<input id="phone"></label>',
  );
  const next = snapshot();
  expect(next.fields[0].candidateId).toBe(first.fields[0].candidateId);
  expect(tracker.wasWritten(next.fields[0].candidateId, next.registry)).toBe(
    false,
  );
  expect(tracker.wasWritten(next.fields[1].candidateId, next.registry)).toBe(
    true,
  );
  expect(
    tracker.progressIdFor(next.fields[0].candidateId, next.registry),
  ).toBeUndefined();
  expect(tracker.progressIdFor(next.fields[1].candidateId, next.registry)).toBe(
    initial[0].id,
  );
  const entries = tracker.record(
    {
      ...item(next.fields[0].candidateId),
      fieldLabel: "전화",
      profileFieldKey: "contact.contact.phoneNumber",
    },
    { candidateId: next.fields[0].candidateId, status: "written" },
    next.registry,
  );
  expect(entries.map((entry) => entry.label)).toEqual(["국문 이름", "연락처"]);
});

it("uses control identity when a later snapshot reverses previously successful and failed fields", () => {
  document.body.innerHTML =
    '<label>이름<input id="name"></label><label>전화<input id="phone"></label>';
  const tracker = createProgressTracker();
  const first = snapshot();
  tracker.record(
    item(first.fields[0].candidateId),
    { candidateId: first.fields[0].candidateId, status: "written" },
    first.registry,
  );
  tracker.record(
    item(first.fields[1].candidateId),
    {
      candidateId: first.fields[1].candidateId,
      status: "skipped",
      reason: "verification-failed",
    },
    first.registry,
  );
  document.body.prepend(document.body.lastElementChild!);
  const next = snapshot();
  expect(tracker.wasWritten(next.fields[0].candidateId, next.registry)).toBe(
    false,
  );
  expect(tracker.wasWritten(next.fields[1].candidateId, next.registry)).toBe(
    true,
  );
});

it.each(["binding", "connected", "type", "row", "unknown mapping"])(
  "does not merge a reused DOM id after its %s changes",
  (change) => {
    document.body.innerHTML = '<label>이름<input id="name"></label>';
    const tracker = createProgressTracker();
    const first = snapshot();
    const originalItem = item(first.fields[0].candidateId);
    if (change === "unknown mapping") originalItem.profileFieldKey = undefined;
    if (change === "row") originalItem.itemIndex = 0;
    tracker.record(
      originalItem,
      { candidateId: first.fields[0].candidateId, status: "written" },
      first.registry,
    );
    const original = document.querySelector("input")!;
    if (change === "connected") {
      original.id = "previous-name";
      document.body.insertAdjacentHTML(
        "afterbegin",
        '<label>새 항목<input id="name"></label>',
      );
    } else {
      const replacement = original.cloneNode() as HTMLInputElement;
      if (change === "type") replacement.type = "tel";
      original.replaceWith(replacement);
    }
    const next = snapshot();
    const nextItem = item(next.fields[0].candidateId);
    if (change === "binding")
      nextItem.profileFieldKey = "contact.contact.phoneNumber";
    if (change === "unknown mapping") nextItem.profileFieldKey = undefined;
    if (change === "row") nextItem.itemIndex = 1;
    const entries = tracker.record(
      nextItem,
      { candidateId: nextItem.candidateId, status: "written" },
      next.registry,
    );
    expect(entries).toHaveLength(2);
  },
);

it("marks an initially equal value separately without retaining its value", () => {
  document.body.innerHTML = '<label>이름<input id="name"></label>';
  const tracker = createProgressTracker();
  const first = snapshot();
  const equal = {
    ...item(first.fields[0].candidateId),
    currentValue: "private-value",
  };
  const entries = tracker.record(
    equal,
    { candidateId: equal.candidateId, status: "written" },
    first.registry,
  );
  expect(entries[0]).toMatchObject({
    candidateId: equal.candidateId,
    unchanged: true,
  });
  expect(JSON.stringify(entries)).not.toContain("private-value");
});

it("recognizes an unchanged formatted phone number and preserves it across snapshot retries", () => {
  document.body.innerHTML = '<label>전화<input id="phone" type="tel"></label>';
  const tracker = createProgressTracker();
  const first = snapshot();
  const equal = {
    ...item(first.fields[0].candidateId),
    profileFieldKey: "contact.contact.phoneNumber",
    currentValue: "010-1234-5678",
    profileValue: "01012345678",
  };
  const initial = tracker.record(
    equal,
    { candidateId: equal.candidateId, status: "written" },
    first.registry,
  );
  expect(initial[0].unchanged).toBe(true);
  const next = snapshot();
  const retried = tracker.record(
    { ...equal, candidateId: next.fields[0].candidateId },
    { candidateId: next.fields[0].candidateId, status: "written" },
    next.registry,
  );
  expect(retried).toHaveLength(1);
  expect(retried[0].unchanged).toBe(true);
});

it("does not turn a changed field into unchanged when a later snapshot observes the written value", () => {
  document.body.innerHTML = '<label>이름<input id="name"></label>';
  const tracker = createProgressTracker();
  const first = snapshot();
  tracker.record(
    item(first.fields[0].candidateId),
    { candidateId: first.fields[0].candidateId, status: "written" },
    first.registry,
  );
  const next = snapshot();
  const equal = {
    ...item(next.fields[0].candidateId),
    currentValue: "private-value",
  };
  const entries = tracker.record(
    equal,
    { candidateId: equal.candidateId, status: "written" },
    next.registry,
  );
  expect(entries[0].unchanged).toBe(false);
});

it("counts an actual replacement after initially preserving an equal value", () => {
  document.body.innerHTML = '<label>이름<input id="name"></label>';
  const tracker = createProgressTracker();
  const first = snapshot();
  const equal = {
    ...item(first.fields[0].candidateId),
    currentValue: "private-value",
  };
  tracker.record(
    equal,
    { candidateId: equal.candidateId, status: "written" },
    first.registry,
  );
  const changed = { ...equal, profileValue: "new-private-value" };
  const entries = tracker.record(
    changed,
    { candidateId: changed.candidateId, status: "written" },
    first.registry,
  );
  expect(entries[0].unchanged).toBe(false);
  expect(JSON.stringify(entries)).not.toContain("private-value");
});
it("keeps a uniquely identified control stable when the page replaces it", () => {
  document.body.innerHTML = '<label>이름<input id="name"></label>';
  const tracker = createProgressTracker();
  const first = snapshot();
  tracker.record(
    item(first.fields[0].candidateId),
    { candidateId: first.fields[0].candidateId, status: "written" },
    first.registry,
  );
  document
    .querySelector("input")!
    .replaceWith(document.querySelector("input")!.cloneNode());
  const next = snapshot();
  expect(
    tracker.record(
      item(next.fields[0].candidateId),
      { candidateId: next.fields[0].candidateId, status: "written" },
      next.registry,
    ),
  ).toHaveLength(1);
});
it("groups mapped categories and derived names without guessing from labels", () => {
  expect(
    progressCategory({
      ...item("a"),
      profileFieldKey: "education.university.schoolName",
    }),
  ).toBe("학력");
  expect(
    progressCategory({
      ...item("a"),
      profileFieldKey: undefined,
      fieldLabel: "학력",
    }),
  ).toBe("기타 항목");
});

it("rechecks a past written field without keeping cleared or disconnected controls complete", () => {
  document.body.innerHTML = '<label>이름<input id="name"></label>';
  const input = document.querySelector("input")!;
  input.value = "private-value";
  const tracker = createProgressTracker();
  const first = snapshot();
  const [entry] = tracker.record(
    item(first.fields[0].candidateId),
    { candidateId: first.fields[0].candidateId, status: "written" },
    first.registry,
  );
  expect(tracker.progressStateFor?.(entry.id)).toBe(true);
  input.value = "";
  expect(tracker.progressStateFor?.(entry.id)).toBe(false);
  input.value = "private-value";
  input.remove();
  expect(tracker.progressStateFor?.(entry.id)).toBe(false);
  expect(tracker.progressStateFor?.("unknown-entry")).toBe(false);
  expect(JSON.stringify(entry)).not.toContain("private-value");
});

it.each(["select", "radio", "checkbox"])(
  "verifies the selected %s label rather than its raw value",
  (control) => {
    document.body.innerHTML =
      control === "select"
        ? '<label>구분<select id="kind"><option value="">선택</option><option value="Y" selected>private-value</option></select></label>'
        : `<fieldset><legend>구분</legend><label><input type="${control}" name="kind" value="Y" checked>private-value</label><label><input type="${control}" name="kind" value="N">다른 선택</label></fieldset>`;
    const tracker = createProgressTracker();
    const first = snapshot();
    const [entry] = tracker.record(
      item(first.fields[0].candidateId),
      { candidateId: first.fields[0].candidateId, status: "written" },
      first.registry,
    );
    expect(tracker.progressStateFor?.(entry.id)).toBe(true);
    const selected = document.querySelector("input,select")!;
    if (selected instanceof HTMLSelectElement) selected.value = "";
    else (selected as HTMLInputElement).checked = false;
    expect(tracker.progressStateFor?.(entry.id)).toBe(false);
  },
);

it.each([
  { status: "needs-review" as const, mapping: undefined, verified: false },
  {
    status: "needs-review" as const,
    mapping: "ADAPTER_VERIFIED" as const,
    verified: true,
  },
  {
    status: "available" as const,
    mapping: "LLM_SUGGESTED" as const,
    verified: false,
  },
])(
  "does not call an uncertain write verified without adapter evidence ($status $mapping)",
  ({ status, mapping, verified }) => {
    document.body.innerHTML = '<label>이름<input id="name"></label>';
    document.querySelector("input")!.value = "private-value";
    const tracker = createProgressTracker();
    const first = snapshot();
    const reviewItem = { ...item(first.fields[0].candidateId), status };
    if (mapping)
      reviewItem.analysis = {
        candidateId: reviewItem.candidateId,
        matchType: "MATCH",
        valueBinding: {
          type: "DIRECT",
          profileFieldKey: "personal.personal.koreanGivenName",
        },
        autofillPolicy: status === "needs-review" ? "CONDITIONAL" : "ALLOWED",
        mappingStatus: mapping,
        interactionStatus: "READY",
        writePlan: { command: "SET_TEXT" },
      };
    const [entry] = tracker.record(
      reviewItem,
      { candidateId: reviewItem.candidateId, status: "written" },
      first.registry,
    );
    expect(tracker.progressStateFor?.(entry.id)).toBe(verified);
  },
);

it("replaces a past verifier when the same field receives a later result", () => {
  document.body.innerHTML = '<label>이름<input id="name"></label>';
  const input = document.querySelector("input")!;
  input.value = "private-value";
  const tracker = createProgressTracker();
  const first = snapshot();
  const firstItem = item(first.fields[0].candidateId);
  const [entry] = tracker.record(
    firstItem,
    { candidateId: firstItem.candidateId, status: "written" },
    first.registry,
  );
  expect(tracker.progressStateFor?.(entry.id)).toBe(true);
  tracker.record(
    firstItem,
    {
      candidateId: firstItem.candidateId,
      status: "skipped",
      reason: "verification-failed",
    },
    first.registry,
  );
  expect(tracker.progressStateFor?.(entry.id)).toBe(false);
  input.value = "next-private-value";
  tracker.record(
    { ...firstItem, profileValue: "next-private-value" },
    { candidateId: firstItem.candidateId, status: "written" },
    first.registry,
  );
  expect(tracker.progressStateFor?.(entry.id)).toBe(true);
});
