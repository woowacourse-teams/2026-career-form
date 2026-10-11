import { afterEach, expect, it } from "vitest";
import { isHplaceDocument } from "./fingerprint";
import {
  mountHplaceRegistration,
  registrationAnalysis,
} from "./registration.test-fixtures";
import { createEmptyProfile } from "../../../profile/model";
import { buildReviewPlan } from "../../review/review-plan";
import { resetHplacePage } from "../../workflow/test-utils/hplace.fixture";
import {
  collectFieldsSnapshot,
  collectPreparationSnapshot,
} from "../../dom/collect";

afterEach(resetHplacePage);

it("identifies the live registration entry without the legacy jQuery helper tag", () => {
  mountHplaceRegistration();
  expect(isHplaceDocument(document)).toBe(true);
});

it("protects partial phone and email confirmation groups as conflicts", () => {
  mountHplaceRegistration();
  document.querySelector<HTMLInputElement>("#mobile2")!.value = "1234";
  document.querySelector<HTMLInputElement>("#email")!.value =
    "synthetic@example.test";
  const profile = createEmptyProfile();
  profile.contact.phoneNumber = "010-1234-5678";
  profile.contact.email = "synthetic@example.test";
  const snapshot = collectFieldsSnapshot(document);
  const plan = buildReviewPlan({
    registry: snapshot.registry,
    profile,
    analysis: registrationAnalysis(snapshot.request),
  });
  expect(
    plan.items
      .filter((item) => item.profileFieldKey?.startsWith("contact."))
      .map((item) => item.status),
  ).toEqual(["conflict", "conflict"]);
});

it("collects three logical fields without values, credentials, or actions", () => {
  mountHplaceRegistration();
  document.querySelector<HTMLInputElement>("#mobile2")!.value = "1234";
  const snapshot = collectFieldsSnapshot(document);
  const fields = snapshot.request.sections.flatMap((s) => s.fields);
  expect(fields.map((f) => f.domName)).toEqual([
    "hplace.registration.name",
    "hplace.registration.mobile",
    "hplace.registration.email",
  ]);
  expect(
    fields.map((f) => snapshot.registry.lookupField(f.candidateId)),
  ).toEqual(
    expect.arrayContaining([expect.objectContaining({ status: "ready" })]),
  );
  expect(JSON.stringify(snapshot.request)).not.toContain("1234");
  expect(JSON.stringify(snapshot.request)).not.toContain("password");
  expect(
    collectPreparationSnapshot(document).request.sections.flatMap(
      (s) => s.actionCandidates,
    ),
  ).toEqual([]);
});

it.each(["name", "mobile1", "mobile2", "mobile3", "email", "emailConfirm"])(
  "does not collect an incomplete registration group missing %s",
  (id) => {
    mountHplaceRegistration();
    document.getElementById(id)!.remove();
    expect(
      collectFieldsSnapshot(document).request.sections.flatMap((s) => s.fields),
    ).toEqual([]);
  },
);

it("rejects ambiguous controls and controls belonging to another form", () => {
  mountHplaceRegistration();
  const email = document.getElementById("email")!;
  document.body.append(email.cloneNode());
  expect(
    collectFieldsSnapshot(document).request.sections.flatMap((s) => s.fields),
  ).toEqual([]);
  mountHplaceRegistration();
  const other = document.createElement("form");
  document.body.append(other);
  other.append(document.getElementById("emailConfirm")!);
  expect(
    collectFieldsSnapshot(document).request.sections.flatMap((s) => s.fields),
  ).toEqual([]);
});

it("rejects a foreign submission action even when its path matches", () => {
  mountHplaceRegistration();
  document
    .querySelector("form")!
    .setAttribute(
      "action",
      "https://foreign.example.test/app/applicant/writeResume",
    );
  expect(collectFieldsSnapshot(document).request.sections).toEqual([]);
});

it("rejects a malformed action without throwing", () => {
  mountHplaceRegistration();
  document.querySelector("form")!.setAttribute("action", "http://[");
  expect(collectFieldsSnapshot(document).request.sections).toEqual([]);
});

it.each(["frm", "loginForm"])("rejects duplicate frame IDs for %s", (id) => {
  mountHplaceRegistration();
  const duplicate = document.createElement("div");
  duplicate.id = id;
  document.body.prepend(duplicate);
  expect(collectFieldsSnapshot(document).request.sections).toEqual([]);
});
