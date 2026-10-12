import { resolveDocumentCompany } from "../autofill/adapters/company";
import { greetingBasicControls } from "../autofill/adapters/greeting/fingerprint";
import {
  greetingCollectionAdapter,
  greetingRowIdentity,
} from "../autofill/adapters/greeting/collection";
import { collectFieldsSnapshot } from "../autofill/dom/collect";
import { customFieldValue } from "../autofill/dom/custom-field-value";
import { formatProfileDate } from "../autofill/profile/date-format";
import type { ProfileIdentity } from "../profile/model";

export interface ImportCandidate {
  readonly source: string;
  readonly rowIndex?: number;
  readonly profileFieldKey?: string;
  readonly status: "available" | "review" | "unsupported";
  readonly reason: string;
  readonly value?: string;
  readonly precision?: "month" | "day";
  readonly identity?: ProfileIdentity;
}

type FieldKind = "name" | "email" | "phone" | "school" | "date";
interface ImportField {
  source: string;
  kind: FieldKind;
  profileFieldKey?: string;
  rowIndex?: number;
}
type Snapshot = ReturnType<typeof collectFieldsSnapshot>;
const UNIVERSITY = "educationalBackground.universities";
const ACCORDION = '[data-scope="accordion"][data-part="root"]';
const ROW = '[data-scope="accordion"][data-part="item"]';
const BASIC_FIELDS: readonly ImportField[] = [
  { source: "basicInformation.name", kind: "name" },
  {
    source: "basicInformation.email",
    kind: "email",
    profileFieldKey: "contact.contact.email",
  },
  {
    source: "basicInformation.phoneNumber.nationalNumber",
    kind: "phone",
    profileFieldKey: "contact.contact.phoneNumber",
  },
];

/** Research only. Candidates are local proposals, not approved/savable Profile values. */
export function probeGreetingImport(
  document: Document,
): readonly ImportCandidate[] {
  // Recheck the live anchors: resolveDocumentCompany caches custom-domain identity.
  if (
    !greetingBasicControls(document) ||
    resolveDocumentCompany(document) !== "greeting"
  ) {
    return [
      {
        source: "document",
        status: "unsupported",
        reason: "unrecognized_document",
      },
    ];
  }
  const snapshot = collectFieldsSnapshot(document);
  const result = BASIC_FIELDS.map((field) =>
    readField(document, snapshot, field),
  );
  const rows = universityRows(document);
  if (!rows || rows.length === 0) {
    return [
      ...result,
      {
        source: UNIVERSITY,
        status: "unsupported",
        reason: rows ? "missing_rows" : "invalid_rows",
      },
    ];
  }
  for (const row of rows) {
    const { prefix, index } = greetingRowIdentity(row)!;
    const fields: ImportField[] = [
      {
        source: `${prefix}.schoolName`,
        kind: "school",
        profileFieldKey: "education.university.schoolName",
        rowIndex: index,
      },
      {
        source: `${prefix}.enrollmentPeriod.startDate`,
        kind: "date",
        profileFieldKey: "education.university.startDate",
        rowIndex: index,
      },
      {
        source: `${prefix}.enrollmentPeriod.endDate`,
        kind: "date",
        profileFieldKey: "education.university.endDate",
        rowIndex: index,
      },
    ];
    result.push(
      ...fields.map((field) => readField(document, snapshot, field, row)),
    );
  }
  return result;
}

function universityRows(document: Document): Element[] | undefined {
  const controls = [...document.querySelectorAll(`[name^="${UNIVERSITY}."]`)];
  if (!controls.length) return [];
  const roots = new Set(controls.map((element) => element.closest(ACCORDION)));
  if (roots.size !== 1 || roots.has(null)) return undefined;
  const root = [...roots][0]!;
  const rows = greetingCollectionAdapter.repeatableItemCandidates(root);
  if (
    !rows?.length ||
    rows.some(
      (row) => greetingRowIdentity(row)?.itemGroupId !== "educationuniversity",
    )
  )
    return undefined;
  if (controls.some((element) => !rows.includes(element.closest(ROW)!)))
    return undefined;
  return rows;
}

function unsupported(field: ImportField, reason: string): ImportCandidate {
  const { kind: _kind, ...identity } = field;
  return { ...identity, status: "unsupported", reason };
}

function readField(
  document: Document,
  snapshot: Snapshot,
  field: ImportField,
  row?: Element,
): ImportCandidate {
  const named = document.querySelectorAll(`[name="${field.source}"]`);
  const candidates = snapshot.request.sections
    .flatMap((section) => [
      ...section.fields,
      ...(section.items ?? []).flatMap((item) => item.fields),
    ])
    .filter((candidate) => candidate.domName === field.source);
  if (named.length > 1 || candidates.length > 1)
    return unsupported(field, "ambiguous_field");
  if (candidates.length !== 1) return unsupported(field, "not_collected");
  const candidate = candidates[0];
  const lookup = snapshot.registry.lookupField(candidate.candidateId);
  if (candidate.visibility !== "visible" || candidate.inert)
    return unsupported(field, "hidden_or_inert");
  if (
    lookup.status !== "ready" &&
    !(
      lookup.status === "blocked" &&
      ["disabled", "readonly"].includes(lookup.reason)
    )
  )
    return unsupported(field, "unreadable");
  const handle = lookup.handle;
  const elements = [...handle.elements, ...(handle.customElements ?? [])];
  if (elements.length !== 1 || (row && elements[0].closest(ROW) !== row))
    return unsupported(field, "unbound_control");
  const element = elements[0];
  if (field.kind === "date") {
    if (!(element instanceof HTMLButtonElement))
      return unsupported(field, "unsupported_control");
  } else if (
    !(element instanceof HTMLInputElement) ||
    !["text", "email", "tel"].includes(element.type)
  ) {
    return unsupported(field, "unsupported_control");
  }
  const value = (
    element instanceof HTMLInputElement
      ? element.value
      : (customFieldValue(handle) ?? "")
  ).trim();
  if (!value) return unsupported(field, "empty");
  return convert(field, value);
}

function convert(field: ImportField, value: string): ImportCandidate {
  const { kind, ...identity } = field;
  if (kind === "name")
    return {
      ...identity,
      status: "review",
      reason: "name_unsplittable",
      value,
    };
  if (kind === "school")
    return {
      ...identity,
      status: "review",
      reason: "catalog_unverified",
      value,
      identity: { status: "manual", originalText: value },
    };
  if (kind === "date") return dateCandidate(field, value);
  if (kind === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
    return unsupported(field, "invalid_email");
  if (kind === "phone") {
    if (!/^[0-9 -]+$/.test(value))
      return unsupported(field, "unsupported_phone_format");
    value = value.replace(/[ -]/g, "");
    if (!/^0\d{9,10}$/.test(value))
      return unsupported(field, "unsupported_phone_format");
  }
  return { ...identity, status: "available", reason: "direct", value };
}

function dateCandidate(field: ImportField, text: string): ImportCandidate {
  const match = /^(\d{4})([.-])\s*(\d{2})(?:\2\s*(\d{2}))?$/.exec(text);
  if (
    !match ||
    Number(match[1]) < 1 ||
    Number(match[3]) < 1 ||
    Number(match[3]) > 12
  )
    return unsupported(field, "invalid_date");
  const { kind: _kind, ...identity } = field;
  const value = `${match[1]}-${match[3]}${match[4] ? `-${match[4]}` : ""}`;
  if (!match[4])
    return {
      ...identity,
      status: "review",
      reason: "month_precision",
      value,
      precision: "month",
    };
  if (formatProfileDate(value, "YYYY-MM-DD").status !== "resolved")
    return unsupported(field, "invalid_date");
  return {
    ...identity,
    status: "available",
    reason: "direct",
    value,
    precision: "day",
  };
}
