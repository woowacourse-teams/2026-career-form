import { afterEach, expect, it } from "vitest";
import { createEmptyProfile } from "../../../profile/model";
import { collectFieldsSnapshot } from "../../dom/collect";
import { buildReviewPlan } from "../../review/review-plan";
import { resetHplacePage } from "../../workflow/test-utils/hplace.fixture";
import { writeRegistration } from "./write";
import {
  mountHplaceRegistration,
  registrationAnalysis,
  installRegistrationValidation,
} from "./registration.test-fixtures";

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  resetHplacePage();
});

function setup(key: "name" | "mobile" | "email") {
  mountHplaceRegistration();
  const validation = installRegistrationValidation();
  dispose = validation.dispose;
  const profile = createEmptyProfile();
  profile.personal.koreanFamilyName = "합성";
  profile.personal.koreanGivenName = "사용자";
  profile.contact.phoneNumber = "01012345678";
  profile.contact.email = "synthetic@example.test";
  const snapshot = collectFieldsSnapshot(document);
  const item = buildReviewPlan({
    registry: snapshot.registry,
    profile,
    analysis: registrationAnalysis(snapshot.request),
  }).items.find(
    (item) =>
      snapshot.registry.lookupField(item.candidateId).status === "ready" &&
      (
        snapshot.registry.lookupField(item.candidateId) as {
          handle: import("../../dom/types").FieldCandidateHandle;
        }
      ).handle.candidate.domName === `hplace.registration.${key}`,
  )!;
  const lookup = snapshot.registry.lookupField(item.candidateId);
  if (lookup.status !== "ready") throw new Error("Missing fixture field");
  return { item, handle: lookup.handle, validation };
}

it.each(["SENSITIVE_CONFIRMATION", "CONDITIONAL"] as const)(
  "does not write an unexpected %s policy",
  async (policy) => {
    const { item, handle, validation } = setup("name");
    item.analysis!.autofillPolicy = policy;
    expect(
      await writeRegistration(
        document,
        handle,
        item,
        new AbortController().signal,
      ),
    ).toBe(false);
    expect(validation.inputEvents()).toBe(0);
  },
);

it("does not write after its validator node was replaced before mutation", async () => {
  const { item, handle, validation } = setup("name");
  expect(
    await writeRegistration(
      document,
      handle,
      item,
      new AbortController().signal,
      undefined,
      async () => {
        const message = document.getElementById("nameRegMsg")!;
        message.replaceWith(message.cloneNode(true));
        return true;
      },
    ),
  ).toBe(false);
  expect(validation.inputEvents()).toBe(0);
});

it("does not accept an old validation marker before the source polling runs", async () => {
  const { item, handle } = setup("name");
  const message = document.getElementById("nameRegMsg")!;
  message.classList.add("ok");
  (handle.elements[0] as HTMLInputElement).onfocus = () => {
    setTimeout(() => message.classList.remove("ok"), 100);
  };
  expect(
    await writeRegistration(
      document,
      handle,
      item,
      new AbortController().signal,
    ),
  ).toBe(false);
});

it("does not mistake an old marker for validation when source handlers are missing", async () => {
  const { item, handle, validation } = setup("name");
  document.getElementById("nameRegMsg")!.classList.add("ok");
  (handle.elements[0] as HTMLInputElement).onfocus = null;
  expect(
    await writeRegistration(
      document,
      handle,
      item,
      new AbortController().signal,
    ),
  ).toBe(false);
  expect(validation.inputEvents()).toBe(0);
  expect(handle.elements[0].value).toBe("");
});

it("handles a failed profile revalidation before any mutation", async () => {
  const { item, handle, validation } = setup("name");
  expect(
    await writeRegistration(
      document,
      handle,
      item,
      new AbortController().signal,
      undefined,
      async () => {
        throw new Error("Profile storage unavailable");
      },
    ),
  ).toBe(false);
  expect(validation.inputEvents()).toBe(0);
});

it.each(["readonly", "disabled", "hidden", "duplicate"] as const)(
  "preserves a phone group that becomes %s after collection",
  async (kind) => {
    const { item, handle, validation } = setup("mobile");
    const target = document.getElementById("mobile2") as HTMLInputElement;
    if (kind === "readonly") target.readOnly = true;
    if (kind === "disabled") target.disabled = true;
    if (kind === "hidden") target.hidden = true;
    if (kind === "duplicate") document.body.append(target.cloneNode());
    expect(
      await writeRegistration(
        document,
        handle,
        item,
        new AbortController().signal,
      ),
    ).toBe(false);
    expect(validation.inputEvents()).toBe(0);
  },
);

it("preserves a user change between phone segments", async () => {
  const { item, handle, validation } = setup("mobile");
  let checks = 0;
  const result = await writeRegistration(
    document,
    handle,
    item,
    new AbortController().signal,
    undefined,
    async () => {
      checks += 1;
      if (checks === 2)
        (document.getElementById("mobile3") as HTMLInputElement).value = "9999";
      return true;
    },
  );
  expect(result).toBe(false);
  expect(handle.elements.map((e) => e.value)).toEqual(["010", "", "9999"]);
  expect(validation.clicks()).toBe(0);
});

it.each(["+821012345678", "012-1234-5678", "invalid@example", ""])(
  "does not guess an invalid phone or email value %s",
  async (value) => {
    const { item, handle, validation } = setup(
      value.includes("@") ? "email" : "mobile",
    );
    item.profileValue = value;
    expect(
      await writeRegistration(
        document,
        handle,
        item,
        new AbortController().signal,
      ),
    ).toBe(false);
    expect(validation.inputEvents()).toBe(0);
  },
);
