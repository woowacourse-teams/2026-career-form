import { detailTargetValue } from "./detail-write";
import { matchesResultValue } from "../../workflow/result-value-match";
import { afterEach, expect, it } from "vitest";
import { mountDetail, detailAnalysis } from "./detail.test-fixtures";
import { resetHplacePage } from "../../workflow/test-utils/hplace.fixture";
import { collectFieldsSnapshot } from "../../dom/collect";
import { isUnsupportedHplace, resolveDocumentCompany } from "../company";
import { createEmptyProfile } from "../../../profile/model";
import { buildReviewPlan } from "../../review/review-plan";
import { executeApprovedWritesAfterPageSettles } from "../../write/executor";
const hplaceAddress = { address: "Synthetic road", postalCode: "12345" };
afterEach(resetHplacePage);
function setup() {
  mountDetail(true);
  (
    document.querySelector(
      '[name="currentAddress.address"]',
    ) as HTMLInputElement
  ).value = hplaceAddress.address;
  (
    document.querySelector(
      '[name="currentAddress.zipCode"]',
    ) as HTMLInputElement
  ).value = hplaceAddress.postalCode;
  document.querySelector('[data-span="postcode"]')!.textContent =
    hplaceAddress.postalCode;
  const profile = createEmptyProfile();
  profile.personal.englishGivenName = "Synthetic";
  profile.personal.englishFamilyName = "Tester";
  profile.personal.birthDate = "2000-02-29";
  profile.contact.addressLine2 = "Synthetic detail";
  profile.contact.emergencyPhoneNumber = "010-1234-5678";
  const snapshot = collectFieldsSnapshot(document);
  const plan = buildReviewPlan({
    registry: snapshot.registry,
    profile,
    analysis: detailAnalysis(snapshot.request),
  });
  // Standalone executor tests explicitly opt into the conditional emergency field.
  const emergency = plan.items.find(
    (item) => item.analysis?.autofillPolicy === "CONDITIONAL",
  );
  if (emergency) emergency.selected = true;
  return { snapshot, plan };
}
it("collects only verified detail fields and recognizes their platform", () => {
  const { snapshot } = setup();
  expect(resolveDocumentCompany(document)).toBe("hplace");
  expect(isUnsupportedHplace(document)).toBe(false);
  expect(snapshot.request.sections.map((s) => s.sectionId)).toEqual([
    "hplace-detail-basic",
  ]);
  expect(
    snapshot.request.sections.flatMap((s) => s.fields.map((f) => f.domName)),
  ).toEqual([
    // No order guide on this page: family-first default (2026-10-20).
    "hplace.detail.englishName.familyFirst",
    "hplace.detail.birthday",
    "hplace.detail.detailAddress",
    "hplace.detail.emergencyPhone",
  ]);
});
it("writes approved controls and formats the birth date", async () => {
  const { snapshot, plan } = setup();
  const results = await executeApprovedWritesAfterPageSettles({
    items: plan.items,
    registry: snapshot.registry,
    approvedCandidateIds: new Set(plan.items.map((i) => i.candidateId)),
    document,
    hplaceAddress,
  });
  expect(results.filter((r) => r.status === "written")).toHaveLength(4);
  expect(
    (document.getElementById("englishName") as HTMLInputElement).value,
  ).toBe("Tester Synthetic");
  expect((document.getElementById("birthday") as HTMLInputElement).value).toBe(
    "2000.02.29",
  );
  expect(
    (
      document.querySelector(
        '[name="currentAddress.detailAddress"]',
      ) as HTMLInputElement
    ).value,
  ).toBe("Synthetic detail");
  expect(
    (
      document.querySelector(
        '[name="emergencyContact.comment"]',
      ) as HTMLInputElement
    ).value,
  ).toBe("");
});
it.each([
  "duplicate",
  "outside-row",
  "wrong-type",
  "foreign-script",
  "wrong-step",
])("fails closed for %s detail structure", (fault) => {
  mountDetail();
  if (fault === "duplicate")
    document.body.append(
      document.getElementById("englishName")!.cloneNode(true),
    );
  if (fault === "outside-row")
    document.body.append(
      document.querySelector('[name="currentAddress.detailAddress"]')!,
    );
  if (fault === "wrong-type")
    (document.getElementById("birthday") as HTMLInputElement).type = "password";
  if (fault === "foreign-script")
    document.querySelector("script")!.src =
      "https://other.example/mrs2/release/js/applicant/writeResume/writeResume.js";
  if (fault === "wrong-step")
    document.querySelector("section")!.setAttribute("data-code", "21");
  const snapshot = collectFieldsSnapshot(document);
  expect(
    snapshot.request.sections
      .flatMap((s) => s.fields)
      .some((f) => f.domName?.startsWith("hplace.detail.")),
  ).toBe(false);
});
it.each([
  "existing",
  "readonly",
  "disabled",
  "hidden",
  "inert",
  "replacement",
  "profile-change",
  "invalid-date",
  "abort",
  "unapproved",
  "wrong-binding",
  "revert",
])("protects %s controls before or during writes", async (fault) => {
  const { snapshot, plan } = setup();
  const item = plan.items.find(
    (i) =>
      i.analysis?.valueBinding?.type === "DIRECT" &&
      i.analysis.valueBinding.profileFieldKey === "personal.personal.birthDate",
  )!;
  const input = document.getElementById("birthday") as HTMLInputElement;
  const controller = new AbortController();
  if (fault === "existing") input.value = "1990.01.01";
  if (fault === "readonly") input.readOnly = true;
  if (fault === "disabled") input.disabled = true;
  if (fault === "hidden") input.hidden = true;
  if (fault === "inert") input.setAttribute("inert", "");
  if (fault === "replacement") input.replaceWith(input.cloneNode(true));
  if (fault === "invalid-date") item.profileValue = "2001-02-29";
  if (fault === "abort") controller.abort();
  if (fault === "wrong-binding")
    item.analysis!.valueBinding = {
      type: "DIRECT",
      profileFieldKey: "contact.contact.addressLine1",
    };
  if (fault === "revert")
    input.onchange = () => {
      input.value = "";
    };
  const results = await executeApprovedWritesAfterPageSettles({
    items: [item],
    registry: snapshot.registry,
    approvedCandidateIds: new Set(
      fault === "unapproved" ? [] : [item.candidateId],
    ),
    document,
    hplaceAddress,
    signal: controller.signal,
    beforeMutation: async () => {
      if (fault === "profile-change") item.profileValue = "1999-01-01";
      return true;
    },
  });
  expect(results[0].status).toBe("skipped");
  expect(input.value).toBe(fault === "existing" ? "1990.01.01" : "");
});
it("requires user selection for conditional emergency phone", async () => {
  const { snapshot, plan } = setup();
  const item = plan.items.find(
    (i) =>
      i.analysis?.valueBinding?.type === "DIRECT" &&
      i.analysis.valueBinding.profileFieldKey ===
        "contact.contact.emergencyPhoneNumber",
  )!;
  item.analysis!.autofillPolicy = "CONDITIONAL";
  item.status = "needs-review";
  item.selected = false;
  const options = {
    items: [item],
    registry: snapshot.registry,
    approvedCandidateIds: new Set([item.candidateId]),
    document,
    hplaceAddress,
  };
  expect((await executeApprovedWritesAfterPageSettles(options))[0].status).toBe(
    "skipped",
  );
  item.selected = true;
  expect((await executeApprovedWritesAfterPageSettles(options))[0].status).toBe(
    "written",
  );
});

it("recognizes only the owned dotted birthday as the same profile date", () => {
  const { snapshot, plan } = setup();
  const item = plan.items.find(
    (i) =>
      i.analysis?.valueBinding?.type === "DIRECT" &&
      i.analysis.valueBinding.profileFieldKey === "personal.personal.birthDate",
  )!;
  const lookup = snapshot.registry.lookupField(item.candidateId);
  if (lookup.status !== "ready") throw new Error("Missing date");
  expect(
    matchesResultValue(item, "2000.02.29", "2000-02-29", lookup.handle),
  ).toBe(true);
  expect(
    matchesResultValue(item, "2001.02.29", "2001-02-29", lookup.handle),
  ).toBe(false);
  expect(matchesResultValue(item, "2000.02.29", "2000-02-29")).toBe(false);
});
it("rechecks prior writes after another field changes the page", async () => {
  const { snapshot, plan } = setup();
  (
    document.querySelector(
      '[name="currentAddress.detailAddress"]',
    ) as HTMLInputElement
  ).onchange = () => {
    (document.getElementById("englishName") as HTMLInputElement).value = "";
  };
  const results = await executeApprovedWritesAfterPageSettles({
    items: plan.items,
    registry: snapshot.registry,
    approvedCandidateIds: new Set(plan.items.map((i) => i.candidateId)),
    document,
    hplaceAddress,
  });
  expect(results[0].status).toBe("skipped");
});
it("rejects duplicate approvals for the same candidate", async () => {
  const { snapshot, plan } = setup();
  const item = plan.items[0];
  const results = await executeApprovedWritesAfterPageSettles({
    items: [item, item],
    registry: snapshot.registry,
    approvedCandidateIds: new Set([item.candidateId]),
    document,
    hplaceAddress,
  });
  expect(results.map((r) => r.status)).toEqual(["written", "skipped"]);
});

it("enforces the observed birthday maximum year", () => {
  const max = new Date().getFullYear() - 16;
  expect(detailTargetValue("birthday", `${max + 1}-01-01`)).toBeUndefined();
  expect(detailTargetValue("birthday", `${max}-12-31`)).toBe(`${max}.12.31`);
});
it.each([
  "blank",
  "mismatch",
  "postal-mismatch",
  "duplicate-postal",
  "invalid-postal",
  "display-mismatch",
  "changed-before-write",
  "missing-profile",
])("preserves detail address for %s base-address identity", async (fault) => {
  const { snapshot, plan } = setup();
  const item = plan.items.find(
    (i) => i.profileFieldKey === "contact.contact.addressLine2",
  )!;
  const base = document.querySelector(
    '[name="currentAddress.address"]',
  ) as HTMLInputElement;
  const postal = document.querySelector(
    '[name="currentAddress.zipCode"]',
  ) as HTMLInputElement;
  if (fault === "blank") base.value = "";
  if (fault === "mismatch") base.value = "Other road";
  if (fault === "postal-mismatch") postal.value = "99999";
  if (fault === "duplicate-postal") postal.after(postal.cloneNode(true));
  if (fault === "invalid-postal") postal.value = "1234";
  if (fault === "display-mismatch")
    document.querySelector('[data-span="postcode"]')!.textContent = "99999";
  const result = await executeApprovedWritesAfterPageSettles({
    items: [item],
    registry: snapshot.registry,
    approvedCandidateIds: new Set([item.candidateId]),
    document,
    hplaceAddress: fault === "missing-profile" ? undefined : hplaceAddress,
    beforeMutation: async () => {
      if (fault === "changed-before-write") base.value = "Other road";
      return true;
    },
  });
  expect(result[0].status).toBe("skipped");
  expect(
    (
      document.querySelector(
        '[name="currentAddress.detailAddress"]',
      ) as HTMLInputElement
    ).value,
  ).toBe("");
});
it("stops after the base address changes in the detail input handler", async () => {
  const { snapshot, plan } = setup();
  const item = plan.items.find(
    (i) => i.profileFieldKey === "contact.contact.addressLine2",
  )!;
  const input = document.querySelector(
    '[name="currentAddress.detailAddress"]',
  ) as HTMLInputElement;
  let changes = 0;
  input.oninput = () => {
    (
      document.querySelector(
        '[name="currentAddress.address"]',
      ) as HTMLInputElement
    ).value = "Other road";
  };
  input.onchange = () => {
    changes++;
  };
  const results = await executeApprovedWritesAfterPageSettles({
    items: [item],
    registry: snapshot.registry,
    approvedCandidateIds: new Set([item.candidateId]),
    document,
    hplaceAddress,
  });
  expect(results[0].status).toBe("skipped");
  expect(changes).toBe(0);
});

it("keeps the detail fields on a tenant without any current-address control", async () => {
  mountDetail();
  document.querySelector('[data-row="address"]')!.remove();
  expect(resolveDocumentCompany(document)).toBe("hplace");
  expect(isUnsupportedHplace(document)).toBe(false);
  const profile = createEmptyProfile();
  profile.personal.birthDate = "2000-02-29";
  const snapshot = collectFieldsSnapshot(document);
  expect(
    snapshot.request.sections.flatMap((s) => s.fields.map((f) => f.domName)),
  ).toEqual([
    "hplace.detail.englishName.familyFirst",
    "hplace.detail.birthday",
  ]);
  const plan = buildReviewPlan({
    registry: snapshot.registry,
    profile,
    analysis: detailAnalysis(snapshot.request),
  });
  const birthday = plan.items.filter(
    (i) => i.profileFieldKey === "personal.personal.birthDate",
  );
  await executeApprovedWritesAfterPageSettles({
    items: birthday,
    registry: snapshot.registry,
    approvedCandidateIds: new Set(birthday.map((i) => i.candidateId)),
    document,
  });
  expect((document.getElementById("birthday") as HTMLInputElement).value).toBe(
    "2000.02.29",
  );
});
it("still fails closed when only part of the current address remains", () => {
  mountDetail();
  document.querySelector('[name="currentAddress.detailAddress"]')!.remove();
  expect(collectFieldsSnapshot(document).request.sections).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sectionId: "hplace-detail-basic" }),
    ]),
  );
});

it("keeps the English name on a tenant without birthday and gender (KDI-type)", () => {
  mountDetail();
  document.querySelector('label[for="birthday"]')!.remove();
  document.getElementById("birthday")!.remove();
  expect(resolveDocumentCompany(document)).toBe("hplace");
  expect(
    collectFieldsSnapshot(document).request.sections.flatMap((s) =>
      s.fields.map((f) => f.domName),
    ),
  ).toEqual([
    "hplace.detail.englishName.familyFirst",
    "hplace.detail.detailAddress",
  ]);
});
it("still fails closed when the birthday control is malformed", () => {
  mountDetail();
  document
    .getElementById("birthday")!
    .setAttribute("data-dates", "birthday:YM");
  expect(collectFieldsSnapshot(document).request.sections).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sectionId: "hplace-detail-basic" }),
    ]),
  );
});
