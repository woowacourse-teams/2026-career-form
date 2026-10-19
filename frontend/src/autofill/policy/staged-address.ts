import {
  debugPreparationCounts,
  debugRuntimeSkip,
  type StructuralSkipReason,
} from "../debug/structural-diagnostics";
import { recordStagedAddress } from "./staged-address-receipt";
import type { AddressExecutionOptions, AddressResult } from "../address/types";
import { normalizeAddress } from "../address/match";
import {
  normalizeStagedRoad as road,
  validStagedRoad,
} from "./staged-address-road";
import { executionPolicy } from "../workflow/execution-policy";
import { runDomPlan } from "./action-plan";
import { activateOwnedPrimary } from "./staged-address-activation";
import {
  sameAddressNodes,
  stagedAddressNodes,
  one,
} from "./staged-address-dom";
import { visible } from "./primitives";
const manual = (
  reason = "주소 검색 결과를 확정하지 못했습니다. 직접 확인해 주세요.",
): AddressResult => ({ status: "manual", reason });
const pause = (view: Window) =>
  new Promise<void>((resolve) => view.setTimeout(resolve, 20));
export async function runStagedAddress({
  document,
  button,
  expected,
  loadCurrent,
  signal,
}: AddressExecutionOptions): Promise<AddressResult> {
  const fail = (
    reason: StructuralSkipReason,
    step: string,
    message?: string,
  ) => {
    debugRuntimeSkip(
      "hplace.mrs2.currentAddress.search",
      reason,
      step,
      "address",
    );
    return manual(message);
  };
  const n = stagedAddressNodes(document);
  if (!n || n.button !== button)
    return fail("owner-mismatch", "original-contract");
  const p = n.policy,
    url = document.URL,
    policy = JSON.stringify(executionPolicy(document)),
    approved = JSON.stringify(expected);
  const desired = [expected.postalCode, expected.address, expected.detail];
  if (!validStagedRoad(expected.address))
    return fail(
      "staging-mismatch",
      "profile-road",
      "지원하지 않는 도로명주소 표기입니다. 시도명과 도로명·건물번호를 직접 확인해 주세요.",
    );
  if (
    !/^\d{5}$/.test(expected.postalCode) ||
    !expected.detail.trim() ||
    desired.some(
      (v, i) =>
        v.length > 500 ||
        (n.fields[i].maxLength >= 0 && v.length > n.fields[i].maxLength),
    )
  )
    return fail("staging-mismatch", "profile-triplet");
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
  if (!(await profile())) return fail("staging-mismatch", "profile-approval");
  if (initial.some(Boolean))
    return tupleMatches()
      ? {
          status: "written",
          reason: "이미 입력됨 — 현주소 세 값이 일치합니다.",
        }
      : fail(
          "existing-value",
          "original-triplet",
          "기존 주소가 있어 덮어쓰지 않았습니다.",
        );
  const untouched = () =>
    n.fields.every((e, i) => e.value === initial[i]) &&
    n.postcode.textContent === initialPostcode;
  if (
    initialPostcode?.trim() ||
    document.querySelector(p.modalSelector) ||
    document.querySelector(p.confirmSelector)
  )
    return fail("owner-mismatch", "existing-overlay");
  const view = document.defaultView!;
  let modal: HTMLElement | undefined,
    detail: HTMLInputElement | undefined,
    detailBefore = "";
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
  let close: HTMLElement | undefined;
  let confirmations: { node: HTMLElement; cancel: HTMLElement | undefined }[] =
    [];
  const execute = async (): Promise<AddressResult> => {
    if (!(await profile()) || !fresh())
      return fail("staging-mismatch", "open-approval");
    n.button.click();
    modal = await wait(
      () => one(document, p.modalSelector),
      async () =>
        (await profile()) &&
        fresh() &&
        !document.querySelector(p.confirmSelector),
    );
    if (!modal) return fail("control-missing", "modal-open");
    close = one(modal, p.modalCloseSelector);
    const owner = modal,
      content = one(owner, p.contentSelector);
    if (!content || !visible(content, true))
      return fail("owner-mismatch", "modal-content");
    const query = one(content, p.querySelector),
      search = one(content, p.searchSelector);
    const stages = p.stageSelectors.map((s) => one(content, s));
    const commit = one(content, p.commitSelector);
    close = one(content, p.modalCloseSelector);
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
      !(close instanceof HTMLButtonElement) ||
      close.type !== "button" ||
      !visible(close) ||
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
      return fail("control-shape", "modal-controls");
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
      return fail("staging-mismatch", "initial-staging");
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
      return fail("staging-mismatch", "search-approval");
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
      return fail("staging-mismatch", "search-input");
    const old = new Set(content.querySelectorAll(p.resultSelectSelector));
    if (
      !(await guarded()) ||
      document.querySelector(p.confirmSelector) ||
      !visible(search) ||
      search.type !== "button" ||
      search.textContent?.trim() !== p.searchLabel
    )
      return fail("staging-mismatch", "search-activation");
    search.click();
    const results = (host: HTMLElement) =>
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
    // Postcodify may retain a loading/stale row or replace the result wrapper
    // while its request completes. Reacquire the owned host and wait for an
    // exact candidate, rather than treating the first arbitrary row as done.
    let previous:
      | {
          host: HTMLElement;
          matches: ReturnType<typeof results>;
          since: number;
        }
      | undefined;
    const host = await wait(() => {
      const candidate = one(content, p.resultsSelector);
      const matches = candidate ? results(candidate) : [];
      if (!candidate || !matches.length) {
        previous = undefined;
        return;
      }
      if (
        previous?.host === candidate &&
        previous.matches.length === matches.length &&
        previous.matches.every(
          (m, i) =>
            m.select === matches[i].select &&
            m.address === matches[i].address &&
            m.zip === matches[i].zip,
        )
      ) {
        if (Date.now() - previous.since >= 40) return candidate;
      } else previous = { host: candidate, matches, since: Date.now() };
    }, guarded);
    if (!host) return fail("result-not-unique", "result-selection");
    const matching = results(host);
    if (matching.length !== 1)
      return fail("result-not-unique", "result-selection");
    const result = matching[0];
    if (
      !(await guarded()) ||
      one(content, p.resultsSelector) !== host ||
      query.value !== desired[1] ||
      results(host).length !== 1 ||
      results(host)[0].select !== result.select ||
      document.querySelector(p.confirmSelector) ||
      !emptyPostcode() ||
      stage[1].value ||
      detail.value !== detailBefore
    )
      return fail("staging-mismatch", "result-approval");
    result.select.click();
    const staged = () =>
      stage[0].value === desired[0] &&
      road(stage[1].value) === road(desired[1]);
    if (
      !(await wait(() => (staged() ? true : undefined), guarded)) ||
      detail.value !== detailBefore
    )
      return fail("result-click-no-effect", "result-staging");
    if (
      !(await guarded()) ||
      !visible(detail) ||
      document.querySelector(p.confirmSelector) ||
      (detail.maxLength >= 0 && desired[2].length > detail.maxLength)
    )
      return fail("staging-mismatch", "detail-approval");
    // Only the editable modal detail is written. Original zip/base/detail are site-owned.
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
      return fail("staging-mismatch", "detail-input");
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
      return fail("submit-disabled-timeout", "submit-ready");
    // A dialog appearing before the owned click (including during pointerdown) is foreign.
    if (
      !(await activateOwnedPrimary(
        commit,
        async () =>
          (await commitReady()) &&
          commit.type === "button" &&
          commit.textContent?.trim() === p.commitLabel &&
          visible(commit),
        () => {
          confirmations = Array.from(
            document.querySelectorAll<HTMLElement>(p.confirmSelector),
          ).map((node) => ({
            node,
            cancel: one(node, p.confirmCancelSelector),
          }));
        },
      ))
    )
      return fail("submit-no-effect", "submit-activation");
    if (!(await guarded()) || !complete())
      return fail("staging-mismatch", "submit-approval");
    // The site creates its HTML dialog synchronously in the owned activation handler.
    // No later unrelated dialog may be adopted during a timeout window.
    const confirmation =
      confirmations.length === 1 ? confirmations[0].node : undefined;
    if (!confirmations.length) {
      fail("submit-no-effect", "submit-activation");
      return fail("confirm-missing", "confirm-lookup");
    }
    if (confirmations.length !== 1)
      return fail("confirm-ambiguous", "confirm-lookup");
    if (
      !confirmation ||
      one(document, p.confirmSelector) !== confirmation ||
      confirmation.closest(p.modalSelector)
    )
      return fail("owner-mismatch", "confirm-owner");
    const confirmVisible = await wait(
      () => (visible(confirmation, true) ? true : undefined),
      async () =>
        (await guarded()) &&
        complete() &&
        one(document, p.confirmSelector) === confirmation,
    );
    if (!confirmVisible) return fail("confirm-missing", "confirm-visible");
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
      return fail("staging-mismatch", "confirm-contract");
    if (
      !(await guarded()) ||
      !complete() ||
      one(document, p.confirmSelector) !== confirmation ||
      one(confirmation, p.confirmOkSelector) !== ok ||
      confirmText() !== p.confirmMessage ||
      ok.type !== "button" ||
      !visible(ok)
    )
      return fail("staging-mismatch", "confirm-approval");
    ok.click();
    const committed = await wait(
      () =>
        tupleMatches() && !owner.isConnected && !confirmation.isConnected
          ? true
          : undefined,
      profile,
    );
    if (!committed) return fail("readback-mismatch", "commit-readback");
    recordStagedAddress(n);
    debugPreparationCounts("address", 1, 1);
    return {
      status: "written",
      reason: "현주소 검색 결과와 세 값의 로컬 반영을 확인했습니다.",
    };
  };
  const outcome = await execute().catch(() =>
    fail("staging-mismatch", "step-exception"),
  );
  if (outcome.status === "written") return outcome;
  // The synchronous owned click establishes cancellation ownership, even if approval
  // is subsequently revoked. Never adopt replacement dialogs or press their OK.
  for (const { node, cancel } of confirmations) {
    if (
      document.URL === url &&
      node.isConnected &&
      node.matches(p.confirmSelector) &&
      one(node, p.confirmCancelSelector) === cancel &&
      cancel instanceof HTMLButtonElement &&
      cancel.type === "button" &&
      cancel.textContent?.trim() === p.confirmCancelLabel &&
      visible(cancel)
    )
      cancel.click();
  }
  const overlaysGone = () =>
    !confirmations.some(({ node }) => node.isConnected) &&
    !document.querySelector(p.confirmSelector);
  if (!overlaysGone())
    await wait(
      () => (overlaysGone() ? true : undefined),
      async () => document.URL === url,
    );
  const pending = !overlaysGone();
  if (
    !pending &&
    document.URL === url &&
    modal?.isConnected &&
    one(document, p.modalSelector) === modal &&
    close instanceof HTMLButtonElement &&
    one(modal, p.modalCloseSelector) === close &&
    close.type === "button" &&
    visible(close)
  )
    close.click();
  if (modal?.isConnected)
    await wait(
      () => (!modal?.isConnected ? true : undefined),
      async () => document.URL === url,
    );
  const originalsUnchanged =
    untouched() && sameAddressNodes(n, stagedAddressNodes(document));
  if (!originalsUnchanged) fail("readback-mismatch", "original-triplet");
  if (pending || modal?.isConnected || document.querySelector(p.modalSelector))
    fail("cleanup-failed", pending ? "confirm-cancel" : "modal-close");
  if (!originalsUnchanged)
    return manual(
      "주소 원본의 변경을 감지했습니다. 세 값을 직접 확인해 주세요.",
    );
  if (pending || modal?.isConnected || document.querySelector(p.modalSelector))
    return manual(
      "주소 입력을 중단했습니다. 남은 주소 확인창이나 모달을 취소한 뒤 직접 확인해 주세요.",
    );
  return manual(
    "주소 입력을 중단하고 확인창과 모달을 닫았습니다. 원래 주소 세 값은 변경하지 않았습니다.",
  );
}
