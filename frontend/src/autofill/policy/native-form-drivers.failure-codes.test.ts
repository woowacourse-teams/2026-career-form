import { afterEach, expect, it } from "vitest";
import { getWorkflowAdapter } from "../adapters/workflow";
import { collectFieldsSnapshot } from "../dom/collect";
import { installExecutionPolicy } from "../workflow/execution-policy";
import type { ReviewPlanItem } from "../review/review-plan";
import type { WriteFailureCode } from "../write/failure";
import { nativeOptionPresence } from "./native-form-write";
import { currentNativeOwner, nativeOwnership } from "./native-form-collection";
import { mountCareer } from "./__fixtures__/hplace-mrs2-career.synthetic";
import { disposeLinkedForms } from "./__fixtures__/hplace-mrs2-linked-form";

afterEach(() => {
  disposeLinkedForms();
  document.body.replaceChildren();
  installExecutionPolicy(document);
});
function driverItem(value: string, row = 0) {
  const snap = collectFieldsSnapshot(document);
  const lookup = snap.request.sections
    .flatMap((s) => [...s.fields, ...(s.items ?? []).flatMap((i) => i.fields)])
    .map((f) => snap.registry.lookupField(f.candidateId))
    .find(
      (l) =>
        "handle" in l &&
        l.handle.elements[0]?.getAttribute("name") ===
          `career[${row}].careerCriteriaCodeSn`,
    );
  if (!lookup || !("handle" in lookup))
    throw new Error("career driver not collected");
  const field = lookup.handle;
  const item = {
    candidateId: field.candidateId,
    selected: true,
    disabled: false,
    profileValue: value,
    analysis: {
      candidateId: field.candidateId,
      matchType: "MATCH",
      valueBinding: nativeOwnership(lookup.handle)!.field.binding,
      autofillPolicy: "ALLOWED",
      mappingStatus: "ADAPTER_VERIFIED",
      interactionStatus: "READY",
      writePlan: { command: "SELECT_OPTION" },
    },
  } as ReviewPlanItem;
  return { handle: lookup.handle, item };
}
async function execute(
  value: string,
  before?: (select: HTMLSelectElement) => void,
) {
  const { handle, item } = driverItem(value);
  const select = handle.elements[0] as HTMLSelectElement;
  before?.(select);
  const codes: WriteFailureCode[] = [];
  const result = await getWorkflowAdapter(document).executeStateDriver?.(
    document,
    handle,
    item,
    new AbortController().signal,
    (code) => codes.push(code),
  );
  return { result, codes, select, handle, item };
}

it("reports a profile label the tenant does not offer as OPTION_UNMATCHED", async () => {
  mountCareer(1, { labels: "seven" });
  const { result, codes, select } = await execute("아르바이트");
  expect(result).toBe(false);
  expect(codes).toEqual(["OPTION_UNMATCHED"]);
  expect(select.value).toBe("");
});

it("keeps writing labels the tenant offers", async () => {
  mountCareer(1, { labels: "seven" });
  const { result, codes, select } = await execute("인턴");
  expect(result).toBe(true);
  expect(codes).toEqual([]);
  expect(select.selectedOptions[0].textContent).toBe("인턴");
});

it("reports a duplicated label as an unconfirmed driver selection", async () => {
  mountCareer(1, { labels: "seven" });
  document
    .querySelector<HTMLSelectElement>(
      '[name="career[0].careerCriteriaCodeSn"]',
    )!
    .add(new Option("정규직", "900099"));
  const { result, codes } = await execute("정규직");
  expect(result).toBe(false);
  expect(codes).toEqual(["DRIVER_SELECTION_UNCONFIRMED"]);
});

it("reports a disabled label as structural, not as a profile mismatch", async () => {
  mountCareer(1, { labels: "seven" });
  const { handle, item } = driverItem("인턴");
  const select = handle.elements[0] as HTMLSelectElement;
  Array.from(select.options).find((o) => o.textContent === "인턴")!.disabled =
    true;
  expect(
    nativeOptionPresence(
      currentNativeOwner(handle)!,
      handle,
      item.profileValue!,
    ),
  ).toBe("structural");
  expect(
    nativeOptionPresence(currentNativeOwner(handle)!, handle, "아르바이트"),
  ).toBe("absent");
  select.options[1].disabled = false;
  expect(
    nativeOptionPresence(currentNativeOwner(handle)!, handle, "정규직"),
  ).toBe("present");
});

it("reports a disabled or readonly driver control", async () => {
  mountCareer(1, { labels: "seven" });
  const disabled = await execute("정규직", (select) => {
    select.disabled = true;
  });
  expect(disabled.result).toBe(false);
  expect(disabled.codes).toEqual(["FIELD_DISABLED"]);
});

it("reports a removed driver control as a changed field", async () => {
  mountCareer(1, { labels: "seven" });
  const removed = await execute("정규직", (select) => {
    select.replaceWith(select.cloneNode(true));
  });
  expect(removed.result).toBe(false);
  expect(removed.codes).toEqual(["FIELD_CHANGED"]);
});

it("reports a dependency that never enables as an unconfirmed driver selection", async () => {
  mountCareer(1, { labels: "seven" });
  const { handle, item } = driverItem("정규직");
  const adapter = getWorkflowAdapter(document);
  const signal = new AbortController().signal;
  // Stop the linkedForm emulator from opening the row.
  disposeLinkedForms();
  expect(
    await adapter.executeStateDriver?.(document, handle, item, signal),
  ).toBe(true);
  const codes: WriteFailureCode[] = [];
  expect(
    await adapter.settleStateDriver?.(
      document,
      handle,
      (code) => codes.push(code),
      { item, signal },
    ),
  ).toBe(false);
  expect(codes).toEqual(["DRIVER_SELECTION_UNCONFIRMED"]);
});
