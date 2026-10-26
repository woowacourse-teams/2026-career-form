import { runtimeRules } from "../policy/runtime-rules";
import { localWorkflowLog } from "../debug/local-workflow";
import { executionPolicy } from "../workflow/execution-policy";
import type {
  AddressExecutionOptions,
  AddressResult,
  GenericAddressTargets,
} from "./types";
import {
  matchesAddressText,
  normalizeAddress,
  type AddressIdentity,
} from "./match";
import { splitRoadReference } from "./road-reference";

function visible(element: Element): boolean {
  for (let p: Element | null = element; p; p = p.parentElement) {
    if (
      p.hasAttribute("hidden") ||
      p.hasAttribute("inert") ||
      p.getAttribute("aria-hidden") === "true"
    )
      return false;
    const style = getComputedStyle(p);
    if (style.display === "none" || style.visibility === "hidden") return false;
  }
  return element.isConnected;
}
// Kakao can embed its cross-origin search inside a same-origin blank wrapper.
// Inspect only accessible wrapper documents; never access the provider document.
function kakaoSearchFrameCount(root: ParentNode): number {
  const seen = new Set<Document>();
  const count = (scope: ParentNode, depth: number): number => {
    if (depth > 4) return 0;
    let matches = 0;
    for (const frame of scope.querySelectorAll<HTMLIFrameElement>("iframe")) {
      if (!visible(frame)) continue;
      try {
        const url = new URL(
          frame.src || "about:blank",
          frame.ownerDocument.URL,
        );
        if (
          url.origin === "https://postcode.map.kakao.com" &&
          url.pathname === "/search"
        ) {
          matches += 1;
          continue;
        }
        if (!["about:blank", "about:srcdoc"].includes(url.href)) continue;
        const nested = frame.contentDocument;
        if (!nested || seen.has(nested)) continue;
        // document.write can give a blank wrapper its parent's document URL.
        // contentDocument is available only when the wrapper is accessible.
        const blankDocument = ["about:blank", "about:srcdoc"].includes(
          nested.URL,
        );
        const inheritedOrigin =
          new URL(nested.URL).origin ===
          new URL(frame.ownerDocument.URL).origin;
        if (!blankDocument && !inheritedOrigin) continue;
        seen.add(nested);
        matches += count(nested, depth + 1);
      } catch {
        // An inaccessible wrapper cannot establish a provider frame.
      }
    }
    return matches;
  };
  return count(root, 0);
}
const GENERIC_CALLBACK_MS = 3000;
const GENERIC_POLL_MS = 100;
/** A site may finish its own form updates shortly after the callback. */
const GENERIC_SETTLE_MS = 600;

/**
 * Policy-free run over controls the generic analysis already resolved. It never
 * closes the provider surface and accepts only the site's own callback values.
 */
async function runGenericKakaoAddress(
  { document, button, expected, loadCurrent, signal, search }: AddressExecutionOptions,
  targets: GenericAddressTargets,
): Promise<AddressResult> {
  let stage = "validate-targets";
  const manual = (
    reason = "주소 검색 결과를 확정하지 못했습니다. 우편번호 찾기에서 직접 확인해 주세요.",
  ): AddressResult => {
    localWorkflowLog("address-stop", { stage, reason, generic: true });
    return { status: "manual", reason };
  };
  const { postalCode: zip, address, detail } = targets;
  const fields = [zip, address, detail].filter(
    (field): field is HTMLInputElement => field !== undefined,
  );
  const valid = () =>
    !signal.aborted &&
    button.isConnected &&
    !(button instanceof HTMLButtonElement && button.disabled) &&
    visible(button) &&
    fields.every(
      (field) => field.isConnected && !field.disabled && visible(field),
    ) &&
    address.readOnly &&
    (!zip || zip.readOnly) &&
    !detail.readOnly;
  if (!valid()) return manual();
  if (
    !/^\d{5}$/.test(expected.postalCode) ||
    !normalizeAddress(expected.address)
  )
    return manual("프로필의 기본주소와 우편번호를 먼저 확인해 주세요.");
  const reference = splitRoadReference(expected.address);
  const sameAddress = (actual: string, selected: string) =>
    matchesAddressText(actual, selected) ||
    matchesAddressText(actual, selected, "POSTAL_AND_ROAD_WITHOUT_REFERENCE");
  const originals = fields.map((field) => field.value);
  const conflicts =
    (zip?.value && zip.value !== expected.postalCode) ||
    (address.value &&
      !sameAddress(address.value, expected.address) &&
      !(reference && normalizeAddress(address.value) === reference.road)) ||
    (detail.value &&
      normalizeAddress(detail.value) !== normalizeAddress(expected.detail));
  if (conflicts)
    return manual("지원서에 다른 주소가 입력되어 있어 덮어쓰지 않았습니다.");
  const sameProfile = async () => {
    const latest = await loadCurrent();
    return (
      latest.address === expected.address &&
      latest.postalCode === expected.postalCode &&
      latest.detail === expected.detail
    );
  };
  const unchanged = () =>
    valid() && fields.every((field, index) => field.value === originals[index]);
  try {
    if (!unchanged() || !(await sameProfile()) || !unchanged()) return manual();
    stage = "open-search";
    (button as HTMLElement).click();
    const maySelect = async () => {
      const same = await sameProfile();
      const stable = unchanged();
      const frames = kakaoSearchFrameCount(document);
      localWorkflowLog("address-before-select", {
        sameProfile: same,
        stable,
        frames,
        generic: true,
      });
      return same && stable && frames === 1;
    };
    let selection: AddressIdentity | undefined;
    stage = "search-and-select";
    const selected = await search(
      { address: expected.address, postalCode: expected.postalCode },
      maySelect,
      signal,
      (result) => {
        selection = result;
      },
    );
    if (!selected || !selection) return manual();
    stage = "verify-site-callback";
    const matchesSelection = () =>
      (!zip || zip.value === selection!.postalCode) &&
      sameAddress(address.value, selection!.address);
    const deadline = Date.now() + GENERIC_CALLBACK_MS;
    while (!signal.aborted && Date.now() < deadline && !matchesSelection())
      await new Promise((resolve) => setTimeout(resolve, GENERIC_POLL_MS));
    const checks = {
      sameProfile: await sameProfile(),
      targetsValid: valid(),
      selectionMatches: matchesSelection(),
      detailUnchanged: detail.value === originals[originals.length - 1],
    };
    const failed = Object.entries(checks)
      .filter(([, passed]) => !passed)
      .map(([name]) => name);
    localWorkflowLog("address-callback-checks", { ...checks, generic: true });
    if (failed.length) return manual("주소 반영 확인 실패: " + failed.join(", "));
    stage = "settle";
    const pause = () =>
      new Promise((resolve) => setTimeout(resolve, GENERIC_POLL_MS));
    const snapshot = () => fields.map((field) => field.value).join("\u0000");
    let last = snapshot(),
      stableSince = Date.now();
    const settleDeadline = Date.now() + GENERIC_CALLBACK_MS;
    while (
      !signal.aborted &&
      Date.now() < settleDeadline &&
      Date.now() - stableSince < GENERIC_SETTLE_MS
    ) {
      await pause();
      const current = snapshot();
      if (current !== last) {
        last = current;
        stableSince = Date.now();
      }
    }
    if (
      !valid() ||
      !matchesSelection() ||
      (detail.value !== "" && detail.value !== expected.detail)
    )
      return manual("주소 반영 확인 실패: settle");
    stage = "write-detail";
    if (detail.value !== expected.detail) {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(detail, expected.detail);
      detail.dispatchEvent(new Event("input", { bubbles: true }));
      detail.dispatchEvent(new Event("change", { bubbles: true }));
    }
    stage = "verify-detail";
    const retainUntil = Date.now() + GENERIC_SETTLE_MS;
    while (!signal.aborted && Date.now() < retainUntil) await pause();
    return valid() && matchesSelection() && detail.value === expected.detail
      ? {
          status: "written",
          reason: "주소 검색 선택과 지원서 반영을 확인했습니다.",
        }
      : manual("상세주소가 지원서에 유지되지 않았습니다. 직접 확인해 주세요.");
  } catch (error) {
    localWorkflowLog("address-exception", {
      stage,
      error: error instanceof Error ? error.message : String(error),
    });
    return manual();
  }
}

export async function runKakaoAddress(
  options: AddressExecutionOptions,
): Promise<AddressResult> {
  const policy = executionPolicy(options.document)?.address;
  if (!policy && options.targets)
    return runGenericKakaoAddress(options, options.targets);
  return runPolicyKakaoAddress(options);
}

async function runPolicyKakaoAddress({
  document,
  button,
  expected,
  loadCurrent,
  signal,
  search,
}: AddressExecutionOptions): Promise<AddressResult> {
  let stage = "validate-targets";
  const manual = (
    reason = "주소 검색 결과를 확정하지 못했습니다. 우편번호 찾기에서 직접 확인해 주세요.",
  ): AddressResult => {
    localWorkflowLog("address-stop", { stage, reason });
    return { status: "manual", reason };
  };
  const policy = executionPolicy(document)?.address;
  if (!policy || policy.provider !== "KAKAO") return manual();
  const verification =
    executionPolicy(document)?.browserPolicy?.addressVerification;
  const rules = runtimeRules(document)?.addressFields;
  if (!rules || rules.readOnly.length !== policy.fieldNames.length)
    return manual();
  const names = policy.fieldNames;
  const root = document.querySelector(policy.rootSelector);
  const fields = names.map((name) => {
    const all = document.querySelectorAll(
      rules.selectorTemplate.replaceAll("{name}", CSS.escape(name)),
    );
    return all.length === 1 ? all[0] : undefined;
  });
  if (
    document.querySelectorAll(policy.rootSelector).length !== 1 ||
    !root ||
    !root.contains(button) ||
    document.querySelectorAll(policy.triggerSelector).length !== 1 ||
    document.querySelector(policy.triggerSelector) !== button ||
    !(button instanceof HTMLButtonElement) ||
    button.type !== "button" ||
    button.disabled ||
    !visible(button) ||
    !fields.every(
      (f, i) =>
        f instanceof HTMLInputElement &&
        f.type === rules.inputType &&
        (!rules.requireId || f.id === names[i]) &&
        (!rules.requireName || f.name === names[i]) &&
        root.contains(f) &&
        !f.disabled &&
        visible(f) &&
        f.readOnly === rules.readOnly[i],
    )
  )
    return manual();
  const controls = fields as HTMLInputElement[];
  const zip = controls[rules.zipIndex],
    address = controls[rules.addressIndex],
    detail = controls[rules.detailIndex];
  const layer = document.querySelector<HTMLElement>(policy.layerSelector);
  if (
    !layer ||
    document.querySelectorAll(policy.layerSelector).length !== 1 ||
    visible(layer)
  )
    return manual();
  if (
    !/^\d{5}$/.test(expected.postalCode) ||
    !normalizeAddress(expected.address)
  )
    return manual("프로필의 기본주소와 우편번호를 먼저 확인해 주세요.");
  const reference = splitRoadReference(expected.address);
  const matchesBase = () =>
    matchesAddressText(address.value, expected.address, verification) ||
    (reference !== undefined &&
      normalizeAddress(address.value) === reference.road);
  const values = [expected.postalCode, expected.address, expected.detail];
  const originals = [zip.value, address.value, detail.value];
  if (
    originals.some(
      (v, i) =>
        v !== "" &&
        normalizeAddress(v) !== normalizeAddress(values[i]) &&
        !(i === 1 && matchesBase()),
    )
  )
    return manual("지원서에 다른 주소가 입력되어 있어 덮어쓰지 않았습니다.");
  const sameProfile = async () => {
    const latest = await loadCurrent();
    return (
      latest.address === expected.address &&
      latest.postalCode === expected.postalCode &&
      latest.detail === expected.detail
    );
  };
  const targets = () =>
    !signal.aborted &&
    button.isConnected &&
    document.querySelector(policy.triggerSelector) === button &&
    !button.disabled &&
    fields.every(
      (f, i) =>
        f === document.querySelector("#" + names[i]) &&
        f instanceof HTMLInputElement &&
        f.name === names[i] &&
        f.readOnly === rules.readOnly[i] &&
        !f.disabled &&
        visible(f),
    );
  const unchanged = () =>
    targets() &&
    fields.every((f, i) => (f as HTMLInputElement).value === originals[i]);
  let opened = false;
  const closeControls = layer.querySelectorAll<HTMLImageElement>(
    policy.closeSelector,
  );
  const close = closeControls.length === 1 ? closeControls[0] : undefined;
  try {
    if (!unchanged() || !(await sameProfile()) || !unchanged()) return manual();
    stage = "open-search";
    button.click();
    opened = true;
    const maySelect = async () => {
      const same = await sameProfile();
      const stable = unchanged();
      const layerVisible = visible(layer);
      const frames = kakaoSearchFrameCount(layer);
      localWorkflowLog("address-before-select", {
        sameProfile: same,
        stable,
        layerVisible,
        frames,
      });
      return same && stable && layerVisible && frames === 1;
    };
    let selection: AddressIdentity | undefined;
    stage = "search-and-select";
    const selected = await search(
      { address: expected.address, postalCode: expected.postalCode },
      maySelect,
      signal,
      (result) => {
        selection = result;
      },
    );
    if (!selected || !selection) return manual();
    stage = "verify-site-callback";
    const matchesSelection = () =>
      zip.value === selection!.postalCode &&
      matchesAddressText(address.value, selection!.address, verification);
    // Compare the callback with the first result actually selected, not the search query.
    const deadline = Date.now() + rules.callbackMs;
    while (
      !signal.aborted &&
      Date.now() < deadline &&
      (!matchesSelection() || (rules.requireClosed && visible(layer)))
    ) {
      await new Promise((resolve) => setTimeout(resolve, rules.pollMs));
    }
    const callbackChecks = {
      sameProfile: await sameProfile(),
      targetsValid: targets(),
      postalCodeMatches: zip.value === selection.postalCode,
      addressMatches: matchesAddressText(
        address.value,
        selection.address,
        verification,
      ),
      layerClosed: !rules.requireClosed || !visible(layer),
      detailUnchanged:
        !rules.requireDetailUnchanged || detail.value === originals[2],
      notAborted: !signal.aborted,
    };
    localWorkflowLog("address-callback-checks", {
      ...callbackChecks,
      verification: verification ?? "EXACT",
      selectedAddress: selection.address,
      actualAddress: address.value,
      selectedPostalCode: selection.postalCode,
      actualPostalCode: zip.value,
      detailWasEmpty: originals[2] === "",
      detailIsEmpty: detail.value === "",
      profileDetailIsEmpty: expected.detail === "",
      layerConnected: layer.isConnected,
      layerDisplay:
        layer.ownerDocument.defaultView?.getComputedStyle(layer).display,
      fieldStates: JSON.stringify(
        fields.map((field, i) => {
          const input = field as HTMLInputElement;
          return {
            name: names[i],
            connected: input.isConnected,
            sameElement: document.querySelector("#" + names[i]) === input,
            disabled: input.disabled,
            readOnly: input.readOnly,
            visible: visible(input),
          };
        }),
      ),
    });
    const failedChecks = Object.entries(callbackChecks)
      .filter(([, passed]) => !passed)
      .map(([name]) => name);
    if (failedChecks.length) {
      localWorkflowLog("address-callback-rejected", {
        failedChecks: failedChecks.join(","),
      });
      return manual("주소 반영 확인 실패: " + failedChecks.join(", "));
    }
    stage = "write-detail";
    if (detail.value !== expected.detail) {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(detail, expected.detail);
      detail.dispatchEvent(new Event("input", { bubbles: true }));
      detail.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return targets() && detail.value === expected.detail
      ? {
          status: "written",
          reason: "주소 검색 선택과 지원서 반영을 확인했습니다.",
        }
      : manual();
  } catch (error) {
    localWorkflowLog("address-exception", {
      stage,
      error: error instanceof Error ? error.message : String(error),
    });
    return manual();
  } finally {
    // Never close a pre-existing layer or one the user has changed.
    if (
      opened &&
      close &&
      layer.isConnected &&
      document.querySelector(policy.layerSelector) === layer &&
      close.isConnected &&
      layer.querySelectorAll(policy.closeSelector).length === 1 &&
      layer.querySelector(policy.closeSelector) === close &&
      visible(layer) &&
      unchanged()
    ) {
      try {
        if ((await sameProfile()) && unchanged() && visible(layer))
          close.click();
      } catch {
        /* Leave a changed or disconnected search to the user. */
      }
    }
  }
}
