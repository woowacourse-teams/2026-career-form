import {
  debugRuntimeSkip,
  type StructuralSkipReason,
} from "../../debug/structural-diagnostics";
import type { CandidateRegistry } from "../../dom/candidate-registry";
import type { FieldCandidateHandle } from "../../dom/types";
import type { ReviewPlanItem } from "../../review/review-plan";
import {
  ownedV1Control,
  v1AddressKeys,
  v1AddressRow,
  v1Name,
  type V1Key,
} from "./v1-basic-controls";
import {
  sameV1Road,
  setValue,
  v1Approved,
  v1Retained,
  waitFor,
  type V1WriteResult,
} from "./v1-basic-write";
import { dialogButton, titledDialog, v1Dialogs, v1Text } from "./v1-dialog";

// Shared with the MRS2 staged-address copy (policy/staged-address.ts).
export const V1_ADDRESS_MANUAL_REASON =
  "주소 검색 결과를 확정하지 못했습니다. 직접 확인해 주세요.";
export const V1_ADDRESS_EXISTING_REASON =
  "기존 주소가 있어 덮어쓰지 않았습니다.";
export const V1_ADDRESS_OPEN_REASON =
  "주소 입력을 중단했습니다. 남은 주소 확인창이나 모달을 취소한 뒤 직접 확인해 주세요.";
export const V1_ADDRESS_CHANGED_REASON =
  "주소 원본의 변경을 감지했습니다. 세 값을 직접 확인해 주세요.";
// v1 only: the dialog fills the zip itself and cannot be undone by the extension.
export const V1_ADDRESS_ZIP_MISMATCH_REASON =
  "주소 창이 입력한 우편번호가 프로필과 다릅니다. 확장은 주소 창의 입력을 되돌릴 수 없으니 직접 확인해 주세요.";
export const V1_ADDRESS_SELECTION_REASON =
  "우편번호와 기본주소를 함께 선택해야 주소 창으로 입력할 수 있습니다.";

type AddressKey = (typeof v1AddressKeys)[number];
export interface V1AddressOutcome {
  result: V1WriteResult;
  reason?: string;
}
interface Member {
  key: AddressKey;
  item: ReviewPlanItem;
  handle: FieldCandidateHandle;
  approved: boolean;
}

const OPEN_MS = 3000;
const RESULTS_MS = 6000;
const STABLE_MS = 150;

function addressKey(handle: FieldCandidateHandle): AddressKey | undefined {
  const key = ownedV1Control(handle)?.key;
  return key && (v1AddressKeys as readonly V1Key[]).includes(key)
    ? (key as AddressKey)
    : undefined;
}

/**
 * The v1 현주소 writer for one executor batch. The first address item runs
 * the site's 주소입력 dialog once; every address item then reports its own
 * outcome from that run. Returns undefined for any other handle.
 */
export function v1AddressBatch(
  items: readonly ReviewPlanItem[],
  registry: CandidateRegistry,
  approvedIds: ReadonlySet<string>,
  current: () => boolean,
  beforeMutation?: () => Promise<boolean>,
): (
  item: ReviewPlanItem,
  handle: FieldCandidateHandle,
) => Promise<V1AddressOutcome> | undefined {
  let run: Promise<Map<string, V1AddressOutcome>> | undefined;
  return (item, handle) => {
    if (!addressKey(handle)) return undefined;
    run ??= writeAddress(
      items.flatMap((i): Member[] => {
        const lookup = registry.lookupField(i.candidateId);
        const key = lookup.status === "ready" && addressKey(lookup.handle);
        return lookup.status === "ready" && key
          ? [
              {
                key,
                item: i,
                handle: lookup.handle,
                approved:
                  approvedIds.has(i.candidateId) &&
                  i.selected &&
                  !i.disabled &&
                  (i.status === "available" || i.status === "needs-review") &&
                  i.candidateId === lookup.handle.candidateId &&
                  i.analysis?.candidateId === lookup.handle.candidateId &&
                  v1Approved(key, i),
              },
            ]
          : [];
      }),
      current,
      beforeMutation,
    ).catch(() => new Map());
    return run.then(
      (results) =>
        results.get(item.candidateId) ?? {
          result: "failed",
          reason: V1_ADDRESS_MANUAL_REASON,
        },
    );
  };
}

async function writeAddress(
  members: Member[],
  current: () => boolean,
  beforeMutation?: () => Promise<boolean>,
): Promise<Map<string, V1AddressOutcome>> {
  const results = new Map<string, V1AddressOutcome>();
  const fail = (
    reason: string,
    skip: StructuralSkipReason,
    step: string,
  ): Map<string, V1AddressOutcome> => {
    debugRuntimeSkip(v1Name("addressLine1"), skip, step);
    for (const m of members)
      results.set(m.item.candidateId, { result: "failed", reason });
    return results;
  };
  const by = (key: AddressKey) => members.find((m) => m.key === key);
  const zip = by("postalCode"),
    road = by("addressLine1"),
    detail = by("addressLine2");
  const control = ownedV1Control(members[0].handle);
  const row = control && v1AddressRow(control.row.ownerDocument);
  if (
    !control ||
    !row ||
    new Set(members.map((m) => m.key)).size !== members.length ||
    members.some((m) => ownedV1Control(m.handle)?.row !== row.row)
  )
    return fail(V1_ADDRESS_MANUAL_REASON, "owner-mismatch", "v1-address-row");
  const document = row.row.ownerDocument;
  const url = document.URL;
  const page = row.inputs;
  // A page value is never replaced and the dialog is not opened over it.
  if (page.some((input) => input.value !== "")) {
    for (const m of members)
      results.set(
        m.item.candidateId,
        m.approved && v1Retained(m.handle, m.item)
          ? { result: "written" }
          : { result: "failed", reason: V1_ADDRESS_EXISTING_REASON },
      );
    return results;
  }
  const zipValue = zip?.item.profileValue ?? "";
  const roadValue = road?.item.profileValue ?? "";
  if (
    !zip?.approved ||
    !road?.approved ||
    !zipValue.trim() ||
    !roadValue.trim() ||
    (detail?.item.profileValue?.trim() && !detail.approved)
  )
    return fail(
      V1_ADDRESS_SELECTION_REASON,
      "staging-mismatch",
      "v1-address-approval",
    );
  const detailValue = detail?.item.profileValue ?? "";
  const snapshot = members.map((m) => [m.item.profileValue, m.item.selected]);
  const owned = () => {
    const now = v1AddressRow(document);
    return (
      current() &&
      document.URL === url &&
      !!now &&
      now.button === row.button &&
      now.inputs.every((input, i) => input === page[i]) &&
      members.every(
        (m, i) =>
          !!ownedV1Control(m.handle) &&
          m.item.profileValue === snapshot[i][0] &&
          m.item.selected === snapshot[i][1],
      )
    );
  };
  const untouched = () => page.every((input) => input.value === "");
  try {
    if (beforeMutation && !(await beforeMutation()))
      return fail(V1_ADDRESS_MANUAL_REASON, "staging-mismatch", "v1-profile");
  } catch {
    return fail(V1_ADDRESS_MANUAL_REASON, "staging-mismatch", "v1-profile");
  }
  // Never open over a dropdown or another dialog (e.g. the photo dialog).
  if (
    !(await waitFor(
      () =>
        v1Dialogs(document).length === 0 &&
        !document.querySelector("#dropdown-body"),
      owned,
      OPEN_MS,
    )) ||
    !untouched()
  )
    return fail(V1_ADDRESS_MANUAL_REASON, "owner-mismatch", "v1-overlay-busy");
  row.button.click();
  let dialog: HTMLElement | undefined;
  if (
    !(await waitFor(
      () => !!(dialog = titledDialog(document, "주소입력")),
      owned,
      OPEN_MS,
    )) ||
    !dialog
  )
    return fail(V1_ADDRESS_MANUAL_REASON, "control-missing", "v1-dialog-open");
  const box = dialog;
  const inDialog = () =>
    owned() && box.isConnected && titledDialog(document, "주소입력") === box;
  /** Closes the dialog with 취소 and checks the page inputs stayed empty. */
  const cancel = async (reason: string, step: string) => {
    const button = box.isConnected ? dialogButton(box, "취소") : undefined;
    if (button && document.URL === url) button.click();
    const closed = await waitFor(
      () => !box.isConnected,
      () => document.URL === url,
      OPEN_MS,
    );
    if (!closed)
      return fail(V1_ADDRESS_OPEN_REASON, "cleanup-failed", "v1-dialog-cancel");
    if (!untouched())
      return fail(V1_ADDRESS_CHANGED_REASON, "readback-mismatch", step);
    return fail(reason, "staging-mismatch", step);
  };
  const queries = Array.from(
    box.querySelectorAll<HTMLInputElement>('input[type="text"]'),
  ).filter((input) => input.placeholder.startsWith("예: 반포대로 201"));
  const search = dialogButton(box, "검색");
  const confirm = dialogButton(box, "확인", true);
  if (queries.length !== 1 || !search || !confirm || !dialogButton(box, "취소"))
    return cancel(V1_ADDRESS_MANUAL_REASON, "v1-dialog-controls");
  const query = queries[0];
  query.focus();
  setValue(query, roadValue);
  query.dispatchEvent(new Event("input", { bubbles: true }));
  if (!inDialog() || query.value !== roadValue)
    return cancel(V1_ADDRESS_MANUAL_REASON, "v1-search-input");
  search.click();
  const roadOf = (li: Element) => {
    const labels = Array.from(li.querySelectorAll("span")).filter(
      (span) => v1Text(span) === "도로명",
    );
    const texts = labels[0]?.parentElement?.querySelectorAll("p");
    return labels.length === 1 && texts?.length === 1
      ? v1Text(texts[0])
      : undefined;
  };
  const listed = () =>
    Array.from(
      // The scroll wrapper is not always rendered; a result row is any list
      // row with a "도로명" label (the help list has none).
      box.querySelectorAll("ul > li"),
    ).filter((li) => roadOf(li) !== undefined);
  // The result list replaces the help list; accept it once it stops changing.
  let shown: Element[] = [];
  let since = 0;
  const settled = await waitFor(
    () => {
      const now = listed();
      if (
        now.length > 0 &&
        now.length === shown.length &&
        now.every((li, i) => li === shown[i])
      )
        return Date.now() - since >= STABLE_MS;
      shown = now;
      since = Date.now();
      return false;
    },
    inDialog,
    RESULTS_MS,
  );
  if (!settled) return cancel(V1_ADDRESS_MANUAL_REASON, "v1-search-results");
  const matches = shown.filter((li) => sameV1Road(roadOf(li)!, roadValue));
  if (matches.length !== 1)
    return cancel(V1_ADDRESS_MANUAL_REASON, "v1-result-unique");
  (matches[0] as HTMLElement).click();
  const base = () => {
    const labels = Array.from(box.querySelectorAll("span")).filter(
      (span) => v1Text(span) === "기본주소",
    );
    const value = labels.length === 1 ? labels[0].nextElementSibling : null;
    return value?.tagName === "SPAN" ? v1Text(value) : "";
  };
  if (!(await waitFor(() => base() !== "", inDialog, OPEN_MS)))
    return cancel(V1_ADDRESS_MANUAL_REASON, "v1-result-selection");
  const details = Array.from(
    box.querySelectorAll<HTMLInputElement>(
      'input[type="text"][placeholder="상세주소를 입력하세요."]',
    ),
  );
  const detailInput = details[0];
  if (
    details.length !== 1 ||
    detailInput.disabled ||
    detailInput.readOnly ||
    (detailInput.maxLength >= 0 &&
      detailValue.length > detailInput.maxLength) ||
    (page[2].maxLength >= 0 && detailValue.length > page[2].maxLength)
  )
    return cancel(V1_ADDRESS_MANUAL_REASON, "v1-detail-input");
  if (detailValue) {
    detailInput.focus();
    setValue(detailInput, detailValue);
    for (const type of ["input", "change"])
      detailInput.dispatchEvent(new Event(type, { bubbles: true }));
  }
  if (
    !inDialog() ||
    detailInput.value !== detailValue ||
    !untouched() ||
    dialogButton(box, "확인", true) !== confirm
  )
    return cancel(V1_ADDRESS_MANUAL_REASON, "v1-detail-input");
  confirm.click();
  if (!(await waitFor(() => !box.isConnected, owned, OPEN_MS)))
    return box.isConnected
      ? cancel(V1_ADDRESS_MANUAL_REASON, "v1-dialog-confirm")
      : fail(V1_ADDRESS_CHANGED_REASON, "readback-mismatch", "v1-readback");
  await waitFor(() => page[1].value !== "", owned, OPEN_MS);
  if (!owned())
    return fail(V1_ADDRESS_CHANGED_REASON, "readback-mismatch", "v1-readback");
  // Each input is verified on its own; nothing reopens or clears the dialog.
  results.set(
    zip.item.candidateId,
    page[0].value !== "" && page[0].value === zipValue
      ? { result: "written" }
      : { result: "failed", reason: V1_ADDRESS_ZIP_MISMATCH_REASON },
  );
  results.set(
    road.item.candidateId,
    sameV1Road(page[1].value, roadValue)
      ? { result: "written" }
      : { result: "failed", reason: V1_ADDRESS_CHANGED_REASON },
  );
  if (detail)
    results.set(
      detail.item.candidateId,
      page[2].value === detailValue
        ? { result: "written" }
        : { result: "failed", reason: V1_ADDRESS_CHANGED_REASON },
    );
  if ([...results.values()].some((r) => r.result !== "written"))
    debugRuntimeSkip(
      v1Name("addressLine1"),
      "readback-mismatch",
      "v1-readback",
    );
  return results;
}
