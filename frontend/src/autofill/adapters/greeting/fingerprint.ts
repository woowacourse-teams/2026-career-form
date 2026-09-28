import type { FieldCandidate } from "../../api/types";

const basicNames = [
  "basicInformation.name",
  "basicInformation.phoneNumber.nationalNumber",
];

export function hasGreetingFieldCandidates(
  candidates: Iterable<FieldCandidate>,
): boolean {
  const fields = [...candidates];
  return basicNames.every(
    (name) =>
      fields.filter(
        (field) =>
          field.domName === name &&
          field.element === "input" &&
          field.control === "text",
      ).length === 1,
  );
}

export function greetingBasicControls(
  document: Document,
): HTMLInputElement[] | undefined {
  const controls = basicNames.map((name) =>
    document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`),
  );
  return controls.every((matches) => matches.length === 1)
    ? controls.map(([input]) => input)
    : undefined;
}
