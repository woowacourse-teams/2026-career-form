import { recordStagedAddress } from "./staged-address-receipt";
import type { AddressExecutionOptions, AddressResult } from "../address/types";
import { normalizeAddress } from "../address/match";
import { executionPolicy } from "../workflow/execution-policy";
import { activateOwnedPrimary, runDomPlan } from "./action-plan";
import {
  sameAddressNodes,
  stagedAddressNodes,
  one,
} from "./staged-address-dom";
import { visible } from "./primitives";
const manual = (
  reason = "주소 검색 결과를 확정하지 못했습니다. 직접 확인해 주세요.",
): AddressResult => ({ status: "manual", reason });
const road = (s: string) => normalizeAddress(s);
const validRoad = (s: string) =>
  /^\S+(?:시|도) (?:\S+(?:시|군|구|읍|면) ){1,3}\S+[로길] \d+(?:-\d+)?$/.test(
    road(s),
  );
const pause = (view: Window) =>
  new Promise<void>((resolve) => view.setTimeout(resolve, 20));
export async function runStagedAddress({
  document,
  button,
  expected,
  loadCurrent,
  signal,
}: AddressExecutionOptions): Promise<AddressResult> {
  const n = stagedAddressNodes(document);
  if (!n || n.button !== button) return manual();
  const p = n.policy,
    url = document.URL,
    policy = JSON.stringify(executionPolicy(document)),
    approved = JSON.stringify(expected);
  const desired = [expected.postalCode, expected.address, expected.detail];
  if (
    !/^\d{5}$/.test(expected.postalCode) ||
    !validRoad(expected.address) ||
    !expected.detail.trim() ||
    desired.some(
      (v, i) =>
        v.length > 500 ||
        (n.fields[i].maxLength >= 0 && v.length > n.fields[i].maxLength),
    )
  )
    return manual();
  const initial = n.fields.map((e) => e.value),
    initialPostcode = n.postcode.textContent;
  const tupleMatches = () =>
    n.fields[0].value === desired[0] &&
    road(n.fields[1].value) === road(desired[1]) &&
    n.fields[2].value === desired[2] &&
    n.postcode.textContent?.trim() === desired[0];
  const current = () =>
    !signal.aborted &&
    document.URL === url &&
    JSON.stringify(expected) === approved &&
    JSON.stringify(executionPolicy(document)) === policy &&
    sameAddressNodes(n, stagedAddressNodes(document));
  const profile = async () => {
    try {
      const v = await loadCurrent();
      return (
        current() &&
        v.postalCode === desired[0] &&
        v.address === desired[1] &&
        v.detail === desired[2]
      );
    } catch {
      return false;
    }
  };
  if (!(await profile())) return manual();
  if (initial.some(Boolean))
    return tupleMatches()
      ? {
          status: "written",
          reason: "이미 입력됨 — 현주소 세 값이 일치합니다.",
        }
      : manual("기존 주소가 있어 덮어쓰지 않았습니다.");
  const untouched = () =>
    n.fields.every((e, i) => e.value === initial[i]) &&
    n.postcode.textContent === initialPostcode;
  if (
    initialPostcode?.trim() ||
    document.querySelector(p.modalSelector) ||
    document.querySelector(p.confirmSelector)
  )
    return manual();
  const view = document.defaultView!;
  let modal: HTMLElement | undefined,
    detail: HTMLInputElement | undefined,
    detailBefore = "",
    writtenDetail: string | undefined;
  const fresh = () => current() && untouched();
  const wait = async <T>(
    read: () => T | undefined,
    valid: () => Promise<boolean>,
  ) => {
    const deadline = Date.now() + p.timeoutMs;
    do {
      if (!(await valid())) return;
      const result = read();
      if (result !== undefined) return result;
      await pause(view);
    } while (Date.now() < deadline);
  };
  try {
    if (!(await profile()) || !fresh()) return manual();
    n.button.click();
    modal = await wait(
      () => one(document, p.modalSelector),
      async () =>
        (await profile()) &&
        fresh() &&
        !document.querySelector(p.confirmSelector),
    );
    if (!modal) return manual();
    const owner = modal,
      content = one(owner, p.contentSelector);
    if (!content || !visible(content, true)) return manual();
    const query = one(content, p.querySelector),
      search = one(content, p.searchSelector);
    const stages = p.stageSelectors.map((s) => one(content, s));
    const commit = one(content, p.commitSelector);
    if (
      !(query instanceof HTMLInputElement) ||
      query.type !== "text" ||
      query.value ||
      query.readOnly ||
      !visible(query) ||
      !(search instanceof HTMLButtonElement) ||
      search.type !== "button" ||
      search.textContent?.trim() !== p.searchLabel ||
      !visible(search) ||
      !(commit instanceof HTMLButtonElement) ||
      commit.type !== "button" ||
      commit.textContent?.trim() !== p.commitLabel ||
      !stages.every(
        (e, i) =>
          e instanceof HTMLInputElement &&
          e.type === "text" &&
          e.readOnly === i < 2 &&
          !e.disabled,
      )
    )
      return manual();
    const stage = stages as HTMLInputElement[];
    detail = stage[2];
    detailBefore = detail.value;
    const emptyPostcode = () =>
      stage[0].value === "" || stage[0].value === p.stagePostcodePlaceholder;
    if (
      !emptyPostcode() ||
      stage[1].value ||
      (detailBefore && detailBefore !== desired[2])
    )
      return manual();
    const owned = () =>
      fresh() &&
      one(document, p.modalSelector) === owner &&
      one(owner, p.contentSelector) === content &&
      one(content, p.querySelector) === query &&
      one(content, p.searchSelector) === search &&
      one(content, p.commitSelector) === commit &&
      p.stageSelectors.every((s, i) => one(content, s) === stage[i]) &&
      stage.every((e, i) => e.readOnly === i < 2 && !e.disabled) &&
      visible(content, true);
    const guarded = async () => (await profile()) && owned();
    if (!(await guarded()) || document.querySelector(p.confirmSelector))
      return manual();
    if (
      !runDomPlan(
        [
          { op: "SET_VALUE", target: "query", value: "{value}" },
          { op: "EVENT", target: "query", event: "input" },
        ],
        { query },
        { value: expected.address },
        () => owned() && !document.querySelector(p.confirmSelector),
      )
    )
      return manual();
    const old = new Set(content.querySelectorAll(p.resultSelectSelector));
    if (
      !(await guarded()) ||
      document.querySelector(p.confirmSelector) ||
      !visible(search) ||
      search.type !== "button" ||
      search.textContent?.trim() !== p.searchLabel
    )
      return manual();
    search.click();
    const host = await wait(() => one(content, p.resultsSelector), guarded);
    if (!host) return manual();
    const results = () =>
      Array.from(host.querySelectorAll(p.resultSelector)).flatMap((row) => {
        const address = one(row, p.resultAddressSelector),
          zip = one(row, p.resultPostcodeSelector),
          select = one(row, p.resultSelectSelector);
        return address &&
          zip &&
          select instanceof HTMLAnchorElement &&
          !old.has(select) &&
          visible(select) &&
          normalizeAddress(zip.textContent ?? "") === desired[0] &&
          road(address.textContent ?? "") === road(desired[1])
          ? [
              {
                row,
                select,
                address: address.textContent!,
                zip: zip.textContent!,
              },
            ]
          : [];
      });
    await wait(
      () => (host.querySelector(p.resultSelector) ? true : undefined),
      guarded,
    );
    const matching = results();
    if (matching.length !== 1) return manual();
    const result = matching[0];
    if (
      !(await guarded()) ||
      one(content, p.resultsSelector) !== host ||
      query.value !== desired[1] ||
      results().length !== 1 ||
      results()[0].select !== result.select ||
      document.querySelector(p.confirmSelector) ||
      !emptyPostcode() ||
      stage[1].value ||
      detail.value !== detailBefore
    )
      return manual();
    result.select.click();
    const staged = () =>
      stage[0].value === desired[0] &&
      road(stage[1].value) === road(desired[1]);
    if (
      !(await wait(() => (staged() ? true : undefined), guarded)) ||
      detail.value !== detailBefore
    )
      return manual();
    if (
      !(await guarded()) ||
      !visible(detail) ||
      document.querySelector(p.confirmSelector) ||
      (detail.maxLength >= 0 && desired[2].length > detail.maxLength)
    )
      return manual();
    // Only the editable modal detail is written. Original zip/base/detail are site-owned.
    writtenDetail = desired[2];
    if (
      !runDomPlan(
        [
          { op: "SET_VALUE", target: "detail", value: "{detail}" },
          { op: "EVENT", target: "detail", event: "input" },
          { op: "EVENT", target: "detail", event: "change" },
        ],
        { detail },
        { detail: desired[2] },
        () => owned() && staged() && !document.querySelector(p.confirmSelector),
      )
    )
      return manual();
    const complete = () => staged() && stage[2].value === desired[2];
    const commitReady = async () =>
      (await guarded()) &&
      complete() &&
      !document.querySelector(p.confirmSelector);
    if (
      !(await wait(
        () => (visible(commit) && !commit.disabled ? true : undefined),
        commitReady,
      ))
    )
      return manual();
    // A dialog appearing before the owned click (including during pointerdown) is foreign.
    if (
      !(await activateOwnedPrimary(
        commit,
        async () =>
          (await commitReady()) &&
          commit.type === "button" &&
          commit.textContent?.trim() === p.commitLabel &&
          visible(commit),
      ))
    )
      return manual();
    if (!(await guarded()) || !complete()) return manual();
    // The site creates its HTML dialog synchronously in the owned activation handler.
    // No later unrelated dialog may be adopted during a timeout window.
    const confirmation = one(document, p.confirmSelector);
    if (
      !confirmation ||
      !visible(confirmation, true) ||
      confirmation.closest(p.modalSelector)
    )
      return manual();
    const ok = one(confirmation, p.confirmOkSelector);
    // Compare the message without either action button's label.
    const confirmText = () => {
      const clone = confirmation.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("button").forEach((b) => b.remove());
      return normalizeAddress(clone.textContent ?? "");
    };
    if (
      !(ok instanceof HTMLButtonElement) ||
      ok.type !== "button" ||
      !visible(ok) ||
      ok.textContent?.trim() !== p.confirmOkLabel ||
      confirmText() !== p.confirmMessage
    )
      return manual();
    if (
      !(await guarded()) ||
      !complete() ||
      one(document, p.confirmSelector) !== confirmation ||
      one(confirmation, p.confirmOkSelector) !== ok ||
      confirmText() !== p.confirmMessage ||
      ok.type !== "button" ||
      !visible(ok)
    )
      return manual();
    ok.click();
    const committed = await wait(
      () =>
        tupleMatches() && !owner.isConnected && !confirmation.isConnected
          ? true
          : undefined,
      profile,
    );
    if (!committed) return manual();
    writtenDetail = undefined;
    recordStagedAddress(n);
    return {
      status: "written",
      reason: "현주소 검색 결과와 세 값의 로컬 반영을 확인했습니다.",
    };
  } finally {
    // Revert only our editable staging value, never originals or another/replaced modal.
    if (
      writtenDetail !== undefined &&
      detail?.isConnected &&
      modal &&
      one(document, p.modalSelector) === modal &&
      modal.contains(detail) &&
      detail.value === writtenDetail &&
      current()
    ) {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(detail, detailBefore);
    }
  }
}
