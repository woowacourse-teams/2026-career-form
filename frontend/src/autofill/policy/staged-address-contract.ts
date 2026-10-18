export interface StagedAddress {
  protocol: "STAGED_MODAL_COMMIT";
  enabled: boolean;
  sectionId: string;
  actionId: string;
  rowSelector: string;
  triggerSelector: string;
  triggerLabel: string;
  fields: {
    name: string;
    rawName: string;
    key: string;
    readonly: boolean;
    hidden: boolean;
    legacyName?: string;
  }[];
  postcodeSelector: string;
  modalSelector: string;
  contentSelector: string;
  querySelector: string;
  searchSelector: string;
  searchLabel: string;
  resultsSelector: string;
  resultSelector: string;
  resultAddressSelector: string;
  resultPostcodeSelector: string;
  resultSelectSelector: string;
  stageSelectors: string[];
  stagePostcodePlaceholder: string;
  commitSelector: string;
  commitLabel: string;
  activation: { op: "ACTIVATE_PRIMARY"; target: "commit" }[];
  confirmSelector: string;
  confirmMessage: string;
  confirmOkSelector: string;
  confirmOkLabel: string;
  confirmCancelSelector: string;
  confirmCancelLabel: string;
  modalCloseSelector: string;
  timeoutMs: number;
}
const ownedTargets = {
  rowSelector:
    'section.writeResume[data-code="13"] div[data-row="address"].address',
  triggerSelector:
    'div.addresszipcode button[type="button"][data-type="currentAddress"]',
  modalSelector: "#modal.modal-bg",
  contentSelector: ".modal",
  commitSelector: 'button[data-button="modalSubmit"]',
  commitLabel: "저장",
  confirmSelector: "#wrapDialog > #Dialog",
  confirmOkSelector: 'button[data-button="ok"]',
  confirmOkLabel: "확인",
  confirmCancelSelector: 'button[data-button="cancel"]',
  confirmCancelLabel: "취소",
  modalCloseSelector: 'button[data-button="modalClose"]',
  sectionId: "hplace-mrs2-currentAddress",
  actionId: "hplace.mrs2.currentAddress.search",
} as const;
const selectors = [
  "rowSelector",
  "triggerSelector",
  "postcodeSelector",
  "modalSelector",
  "contentSelector",
  "querySelector",
  "searchSelector",
  "resultsSelector",
  "resultSelector",
  "resultAddressSelector",
  "resultPostcodeSelector",
  "resultSelectSelector",
  "commitSelector",
  "confirmSelector",
  "confirmOkSelector",
  "confirmCancelSelector",
  "modalCloseSelector",
] as const;
const labels = [
  "sectionId",
  "actionId",
  "triggerLabel",
  "searchLabel",
  "commitLabel",
  "confirmMessage",
  "confirmOkLabel",
  "confirmCancelLabel",
] as const;
const string = (v: unknown): v is string =>
  typeof v === "string" && !!v.trim() && v.length <= 500;
function selector(v: unknown) {
  if (!string(v)) return false;
  try {
    if (typeof document !== "undefined")
      document.createDocumentFragment().querySelector(v);
    return true;
  } catch {
    return false;
  }
}
export function validStagedAddress(value: unknown): value is StagedAddress {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const a = value as StagedAddress;
  if (
    Object.keys(a).some(
      (k) =>
        ![
          "protocol",
          "enabled",
          "fields",
          "stageSelectors",
          "stagePostcodePlaceholder",
          "activation",
          "timeoutMs",
          ...selectors,
          ...labels,
        ].includes(k),
    ) ||
    a.protocol !== "STAGED_MODAL_COMMIT" ||
    typeof a.enabled !== "boolean" ||
    !selectors.every((k) => selector(a[k])) ||
    !labels.every((k) => string(a[k])) ||
    !Number.isInteger(a.timeoutMs) ||
    a.timeoutMs < 1000 ||
    a.timeoutMs > 5000 ||
    !string(a.stagePostcodePlaceholder) ||
    a.stagePostcodePlaceholder.length > 10 ||
    !Array.isArray(a.stageSelectors) ||
    a.stageSelectors.length !== 3 ||
    new Set(a.stageSelectors).size !== 3 ||
    !a.stageSelectors.every(selector) ||
    !Object.entries(ownedTargets).every(
      ([key, value]) => a[key as keyof typeof ownedTargets] === value,
    ) ||
    JSON.stringify(a.stageSelectors) !==
      JSON.stringify([
        ".internal input.postcode",
        ".internal input.address",
        ".internal input.details",
      ]) ||
    !Array.isArray(a.activation) ||
    a.activation.length !== 1 ||
    !a.activation[0] ||
    a.activation[0].op !== "ACTIVATE_PRIMARY" ||
    a.activation[0].target !== "commit" ||
    Object.keys(a.activation[0]).length !== 2 ||
    !Array.isArray(a.fields) ||
    a.fields.length !== 3
  )
    return false;
  const keys = [
    "contact.contact.postalCode",
    "contact.contact.addressLine1",
    "contact.contact.addressLine2",
  ];
  if (!a.fields[0] || !string(a.fields[0].rawName)) return false;
  const prefix = a.fields[0].rawName.split(".")[0];
  return (
    a.fields.every(
      (f, i) =>
        f &&
        Object.keys(f).every((k) =>
          [
            "name",
            "rawName",
            "key",
            "readonly",
            "hidden",
            "legacyName",
          ].includes(k),
        ) &&
        string(f.name) &&
        /^[A-Za-z][A-Za-z0-9_.-]*$/.test(f.name) &&
        string(f.rawName) &&
        /^[A-Za-z][A-Za-z0-9]*\.[A-Za-z]+$/.test(f.rawName) &&
        f.rawName.startsWith(`${prefix}.`) &&
        f.key === keys[i] &&
        f.readonly === (i === 1) &&
        f.hidden === (i === 0) &&
        (f.legacyName === undefined || (i === 2 && string(f.legacyName))),
    ) &&
    new Set(a.fields.map((f) => f.name)).size === 3 &&
    new Set(a.fields.map((f) => f.rawName)).size === 3
  );
}
