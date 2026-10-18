import { afterEach, expect, it, vi } from "vitest";
import {
  addressExpected,
  mountAddress,
  addressPolicy,
} from "./__fixtures__/hplace-mrs2-address.synthetic";
import { installExecutionPolicy } from "../workflow/execution-policy";
import {
  collectFieldsSnapshot,
  collectPreparationSnapshot,
} from "../dom/collect";
import { validBrowserPolicy } from "./validate";
afterEach(() => {
  installExecutionPolicy(document);
  vi.restoreAllMocks();
});
it("collects one owned current-address action and readback triplet without other addresses", () => {
  mountAddress();
  const actions = collectPreparationSnapshot(document)
    .request.sections.flatMap((s) => s.actionCandidates)
    .filter((a) => a.domId?.includes("Address"));
  expect(actions.map((a) => a.domId)).toEqual([
    "hplace.mrs2.currentAddress.search",
  ]);
  const fields = collectFieldsSnapshot(document)
    .request.sections.flatMap((s) => s.fields)
    .filter((f) => f.domName?.includes("Address"));
  expect(fields.map((f) => [f.domName, f.visibility, !!f.readonly])).toEqual([
    ["hplace.mrs2.currentAddress.zipCode", "hidden", false],
    ["hplace.mrs2.currentAddress.address", "visible", true],
    ["hplace.mrs2.currentAddress.detailAddress", "visible", false],
  ]);
});
it("commits the exact tuple through staging, delayed enablement, pointer and HTML confirm only", async () => {
  const s = mountAddress({
    delay: 1000,
    results: [
      { postalCode: "00001", address: "서울특별시 다른구 가상새봄로 50" },
      { postalCode: "00001", address: "서울특별시 가상구 가상새봄로 50-9" },
      addressExpected,
    ],
  });
  expect(await s.run()).toMatchObject({ status: "written" });
  expect(s.inputs().map((e) => e.value)).toEqual([
    "00001",
    addressExpected.address,
    addressExpected.detail,
  ]);
  expect(s.events).toEqual([
    "open",
    "search",
    "select",
    "details",
    "pointerdown",
    "mousedown",
    "pointerup",
    "mouseup",
    "click",
    "ok",
  ]);
  expect(
    [
      ...document.querySelectorAll<HTMLInputElement>(
        '[name^="residentAddress"],[name^="parentAddress"],[name^="familyAddress"]',
      ),
    ].every((e) => e.value === ""),
  ).toBe(true);
});
it.each(["zero", "duplicate", "suffix", "city", "road", "postal"])(
  "refuses nonunique or inexact result %s",
  async (kind) => {
    const wrong = { ...addressExpected };
    if (kind === "suffix") wrong.address += "-9";
    if (kind === "city") wrong.address = "서울특별시 다른구 가상새봄로 50";
    if (kind === "road") wrong.address = "서울특별시 가상구 가상겨울로 50";
    if (kind === "postal") wrong.postalCode = "00002";
    const s = mountAddress({
      results:
        kind === "zero" ? [] : kind === "duplicate" ? [wrong, wrong] : [wrong],
    });
    expect(await s.run()).toMatchObject({ status: "manual" });
    expect(s.events).not.toContain("select");
    expect(s.events).not.toContain("ok");
    expect(s.inputs().every((e) => e.value === "")).toBe(true);
  },
);
it.each(["missing", "duplicate", "wrong"] as const)(
  "does not approve a %s confirmation",
  async (confirm) => {
    const s = mountAddress({ confirm });
    expect(await s.run()).toMatchObject({ status: "manual" });
    expect(s.events).not.toContain("ok");
  },
);
it.each(["stageWrong", "copyWrong", "noPointerResponse"] as const)(
  "never reports success for %s",
  async (flag) => {
    const s = mountAddress({ [flag]: true });
    expect(await s.run()).toMatchObject({ status: "manual" });
  },
);
it("requires nonempty detail before opening", async () => {
  const s = mountAddress();
  expect(await s.run({ ...addressExpected, detail: "" })).toMatchObject({
    status: "manual",
  });
  expect(s.events).toEqual([]);
});
it.each([0, 1, 2])(
  "preserves any existing original field %i without opening",
  async (index) => {
    const s = mountAddress();
    s.inputs()[index].value = "기존";
    expect(await s.run()).toMatchObject({ status: "manual" });
    expect(s.events).toEqual([]);
    expect(s.inputs()[index].value).toBe("기존");
  },
);
it("reports an identical existing triplet without opening or writing", async () => {
  const s = mountAddress();
  s.inputs().forEach((e, i) => (e.value = Object.values(addressExpected)[i]));
  document.querySelector("span.postCode")!.textContent = "00001";
  expect(await s.run()).toMatchObject({
    status: "written",
    reason: expect.stringContaining("이미 입력됨"),
  });
  expect(s.events).toEqual([]);
});
it.each([
  "abort",
  "url",
  "policy",
  "profile",
  "original",
  "staging",
  "modal",
  "foreign-confirm",
])("aborts on %s change before local commit", async (change) => {
  const s = mountAddress({
    onEvent(name) {
      if (name !== "details") return;
      if (change === "abort") s.controller.abort();
      if (change === "url") history.replaceState({}, "", "/other");
      if (change === "policy") installExecutionPolicy(document);
      if (change === "profile")
        s.setCurrent({ ...addressExpected, detail: "변경" });
      if (change === "original") s.inputs()[0].value = "사용자";
      if (change === "staging")
        document.querySelector<HTMLInputElement>(".internal .address")!.value =
          "변경";
      if (change === "modal")
        document
          .querySelector("#modal")!
          .replaceWith(document.querySelector("#modal")!.cloneNode(true));
      if (change === "foreign-confirm")
        document.body.insertAdjacentHTML(
          "beforeend",
          '<div id="wrapDialog"><div id="Dialog"><p>저장하시겠습니까?</p><button data-button="ok" type="button">확인</button></div></div>',
        );
    },
  });
  expect(await s.run()).toMatchObject({ status: "manual" });
  expect(s.events).not.toContain("ok");
});
it("preserves detail typed before selection and requires the same approved detail", async () => {
  const s = mountAddress({ detailBeforeSelection: addressExpected.detail });
  expect(await s.run()).toMatchObject({ status: "written" });
});
it("preserves an existing unrelated modal and never opens another", async () => {
  const s = mountAddress();
  document.body.insertAdjacentHTML(
    "beforeend",
    '<div id="modal" class="modal-bg"><div class="modal">기존</div></div>',
  );
  expect(await s.run()).toMatchObject({ status: "manual" });
  expect(s.events).toEqual([]);
  expect(document.querySelector("#modal")?.textContent).toBe("기존");
});
it.each([
  "protocol",
  "fields",
  "activation",
  "confirmation",
  "capability",
  "resident",
])("rejects malformed staged policy %s", (key) => {
  const p = addressPolicy();
  const f = p.browserPolicy!.nativeForm! as unknown as {
    address: ReturnType<
      typeof import("./__fixtures__/hplace-mrs2-address.synthetic").addressContract
    >;
    capabilities: string[];
  };
  if (key === "protocol") Object.assign(f.address, { protocol: "SUBMIT" });
  if (key === "fields") f.address.fields.pop();
  if (key === "activation")
    f.address.activation = [{ op: "CLICK", target: "commit" }];
  if (key === "confirmation") f.address.confirmMessage = "";
  if (key === "capability")
    f.capabilities = f.capabilities.filter((c) => c !== "STAGED_MODAL_COMMIT");
  if (key === "resident")
    f.address.fields[0].rawName = "residentAddress.zipCode";
  expect(validBrowserPolicy(p.browserPolicy)).toBe(false);
});
it.each(["pointerdown", "mousedown", "pointerup", "mouseup"])(
  "checks latest profile between activation events after %s",
  async (stop) => {
    const s = mountAddress({
      onEvent(name) {
        if (name === stop) s.setCurrent({ ...addressExpected, detail: "변경" });
      },
    });
    expect(await s.run()).toMatchObject({ status: "manual" });
    expect(s.events).not.toContain("click");
    expect(s.events).not.toContain("ok");
  },
);
it("rejects a foreign dialog inserted during pointerdown", async () => {
  const s = mountAddress({
    onEvent(name) {
      if (name === "pointerdown")
        document.body.insertAdjacentHTML(
          "beforeend",
          '<div id="wrapDialog"><div id="Dialog"><p>저장하시겠습니까?</p><button type="button" data-button="ok">확인</button></div></div>',
        );
    },
  });
  expect(await s.run()).toMatchObject({ status: "manual" });
  expect(s.events).not.toContain("click");
  expect(s.events).not.toContain("ok");
});
it("clears only its unchanged editable staging after a missing confirm", async () => {
  const s = mountAddress({ confirm: "missing" });
  expect(await s.run()).toMatchObject({ status: "manual" });
  expect(
    document.querySelector<HTMLInputElement>(".internal .details")?.value,
  ).toBe("");
  expect(
    document.querySelector<HTMLInputElement>(".internal .postcode")?.value,
  ).toBe("00001");
  expect(s.inputs().every((e) => e.value === "")).toBe(true);
});
it("uses the seeded v4 current-address descriptor for real collection and execution", async () => {
  const s = mountAddress();
  const resource =
    await import("../../../../backend/src/main/resources/policies/hplace-mrs2-v4.json");
  const policy = structuredClone(
    resource.default.executionPolicy,
  ) as unknown as typeof s.policy;
  policy.browserPolicy!.nativeForm!.assetPaths =
    s.policy.browserPolicy!.nativeForm!.assetPaths;
  installExecutionPolicy(document, policy);
  expect(
    collectPreparationSnapshot(document)
      .request.sections.flatMap((s) => s.actionCandidates)
      .some((a) => a.domId === "hplace.mrs2.currentAddress.search"),
  ).toBe(true);
  expect(await s.run()).toMatchObject({ status: "written" });
});
it("accepts serialized key order without weakening the primary activation schema", () => {
  const p = addressPolicy();
  const a = p.browserPolicy!.nativeForm!.address!;
  a.activation = [{ target: "commit", op: "ACTIVATE_PRIMARY" }];
  expect(validBrowserPolicy(p.browserPolicy)).toBe(true);
});
it.each([null, {}, 42, { rawName: 1 }])(
  "fails closed for malformed triplet entry %j",
  (entry) => {
    const p = addressPolicy();
    Object.assign(p.browserPolicy!.nativeForm!.address!, {
      fields: [entry, {}, {}],
    });
    expect(() => validBrowserPolicy(p.browserPolicy)).not.toThrow();
    expect(validBrowserPolicy(p.browserPolicy)).toBe(false);
  },
);
it("does not silently strip unapproved reference text from a road result", async () => {
  const s = mountAddress({
    results: [
      {
        ...addressExpected,
        address: addressExpected.address + " (가상부속건물)",
      },
    ],
  });
  expect(await s.run()).toMatchObject({ status: "manual" });
  expect(s.events).not.toContain("select");
});
it.each(["policy", "url", "node", "tuple"])(
  "invalidates the triple receipt on %s changes",
  async (change) => {
    const s = mountAddress();
    expect(await s.run()).toMatchObject({ status: "written" });
    const snapshot = collectFieldsSnapshot(document);
    const field = snapshot.request.sections
      .flatMap((s) => s.fields)
      .find((f) => f.domName === "hplace.mrs2.currentAddress.zipCode")!;
    const lookup = snapshot.registry.lookupField(field.candidateId);
    expect("handle" in lookup).toBe(true);
    if (!("handle" in lookup)) return;
    const { stagedAddressReceipt } = await import("./staged-address-receipt");
    expect(stagedAddressReceipt(lookup.handle)?.value).toBe("00001");
    if (change === "policy") installExecutionPolicy(document);
    if (change === "url") history.replaceState({}, "", "/elsewhere");
    if (change === "node")
      s.inputs()[0].replaceWith(s.inputs()[0].cloneNode(true));
    if (change === "tuple") s.inputs()[2].value = "사용자 변경";
    expect(stagedAddressReceipt(lookup.handle)).toBeUndefined();
  },
);
it("validates the address policy in the extension service worker without a document", () => {
  const p = addressPolicy();
  vi.stubGlobal("document", undefined);
  try {
    expect(validBrowserPolicy(p.browserPolicy)).toBe(true);
  } finally {
    vi.unstubAllGlobals();
  }
});
it("does not misreport an unexpectedly visible zipcode as hidden", () => {
  const s = mountAddress();
  s.inputs()[0].style.display = "";
  expect(
    collectPreparationSnapshot(document)
      .request.sections.flatMap((s) => s.actionCandidates)
      .some((a) => a.domId === "hplace.mrs2.currentAddress.search"),
  ).toBe(false);
});
