/** Hand-written synthetic structure from T:398–448, W:2131–2291 and address-modal-finding.md.
 * Fictional road/building/detail values; this is NOT a captured live DOM or trusted-event proof. */
import { vi } from "vitest";
import {
  syntheticNativePolicy,
  mountSyntheticNative,
} from "./hplace-mrs2-native.synthetic";
import { installExecutionPolicy } from "../../workflow/execution-policy";
import { getWorkflowAdapter } from "../../adapters/workflow";
import type { AddressValue } from "../../address/types";
export const addressExpected = {
  postalCode: "00001",
  address: "서울특별시 가상구 가상새봄로 50",
  detail: "가상동 101호",
};
export const addressContract = () => ({
  protocol: "STAGED_MODAL_COMMIT",
  enabled: true,
  sectionId: "hplace-mrs2-currentAddress",
  actionId: "hplace.mrs2.currentAddress.search",
  rowSelector:
    'section.writeResume[data-code="13"] div[data-row="address"].address',
  triggerSelector:
    'div.addresszipcode button[type="button"][data-type="currentAddress"]',
  triggerLabel: "우편번호",
  fields: [
    {
      name: "hplace.mrs2.currentAddress.zipCode",
      rawName: "currentAddress.zipCode",
      key: "contact.contact.postalCode",
      readonly: false,
      hidden: true,
    },
    {
      name: "hplace.mrs2.currentAddress.address",
      rawName: "currentAddress.address",
      key: "contact.contact.addressLine1",
      readonly: true,
      hidden: false,
    },
    {
      name: "hplace.mrs2.currentAddress.detailAddress",
      rawName: "currentAddress.detailAddress",
      key: "contact.contact.addressLine2",
      readonly: false,
      hidden: false,
      legacyName: "hplace.detail.detailAddress",
    },
  ],
  postcodeSelector: 'span.postCode[data-type="currentAddress"]',
  modalSelector: "#modal.modal-bg",
  contentSelector: ".modal",
  querySelector:
    '#searchAppAdressForm input[type="text"][placeholder^="예 : 반포대교로 201"]',
  searchSelector: "#searchAppAdressForm button",
  searchLabel: "검색",
  resultsSelector: "#searchAppAdressResult > div.postcodify_search_form",
  resultSelector: ":scope > div.postcodify_search_result",
  resultAddressSelector: "div.address > a.selector > span.address_info",
  resultPostcodeSelector: "div.code5",
  resultSelectSelector: "div.address > a.selector",
  stagePostcodePlaceholder: "-",
  stageSelectors: [
    ".internal input.postcode",
    ".internal input.address",
    ".internal input.details",
  ],
  commitSelector: 'button[data-button="modalSubmit"]',
  commitLabel: "저장",
  activation: [{ op: "ACTIVATE_PRIMARY", target: "commit" }],
  confirmSelector: "#wrapDialog > #Dialog",
  confirmMessage: "저장하시겠습니까?",
  confirmOkSelector: 'button[data-button="ok"]',
  confirmOkLabel: "확인",
  confirmCancelSelector: 'button[data-button="cancel"]',
  confirmCancelLabel: "취소",
  modalCloseSelector: 'button[data-button="modalClose"]',
  timeoutMs: 1500,
});
export function addressPolicy() {
  const p = syntheticNativePolicy();
  const form = p.browserPolicy!.nativeForm!;
  Object.assign(form, { address: addressContract() });
  form.capabilities.push("STAGED_MODAL_COMMIT");
  p.browserPolicy!.addressAction = {
    domId: "hplace.mrs2.currentAddress.search",
    element: "button",
  };
  return p;
}
export function mountAddress(
  options: {
    results?: readonly { address: string; postalCode: string }[];
    confirm?: "missing" | "duplicate" | "wrong";
    stageWrong?: boolean;
    delay?: number;
    detailBeforeSelection?: string;
    onEvent?: (name: string) => void;
    onLoadCurrent?: () => void;
    copyWrong?: boolean;
    noPointerResponse?: boolean;
    liveHandler?: boolean;
    submitDisabled?: boolean;
    keepModal?: boolean;
    brokenClose?: boolean;
    resultDelay?: number;
    replaceResultHost?: boolean;
    extraInfo?: string;
    loadingRow?: boolean;
    duplicateDelay?: number;
    confirmRevealDelay?: number;
  } = {},
) {
  mountSyntheticNative(0);
  const policy = addressPolicy();
  installExecutionPolicy(document, policy);
  const root = document.querySelector("#wrapResume")!;
  root.insertAdjacentHTML(
    "beforeend",
    `<section class="writeResume" data-code="13">${["currentAddress", "residentAddress", "parentAddress", "familyAddress"].map((kind) => `<div data-row="address" class="address"><div class="addresszipcode"><button type="button" data-type="${kind}">우편번호</button><span class="postCode" data-type="${kind}" data-span="postcode"></span><input type="text" class="hidden" style="display:none" name="${kind}.zipCode"></div><input name="${kind}.address" readonly><input name="${kind}.detailAddress" maxlength="128"><button type="button" data-button="copyAddress">상동</button></div>`).join("")}</section>`,
  );
  const inputs = () =>
    ["zipCode", "address", "detailAddress"].map((n) =>
      document.querySelector<HTMLInputElement>(`[name="currentAddress.${n}"]`)!,
    );
  const button = document.querySelector<HTMLButtonElement>(
    '[data-type="currentAddress"]',
  )!;
  const events: string[] = [];
  const event = (name: string) => {
    events.push(name);
    options.onEvent?.(name);
  };
  document.querySelector("form")!.addEventListener("submit", (e) => {
    e.preventDefault();
    event("form-submit");
  });
  document
    .querySelectorAll('[data-button="copyAddress"],button[type="submit"]')
    .forEach((e) => e.addEventListener("click", () => event("forbidden")));
  button.addEventListener("click", () => {
    event("open");
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div id="modal" class="modal-bg"><div class="modal"><button type="button" data-button="modalClose"></button><div id="searchAppAdressForm"><input type="text" placeholder="예 : 반포대교로 201, 합성"><button type="button">검색</button></div><div id="searchAppAdressResult"><div class="postcodify_search_form"></div></div><div class="internal"><input class="postcode" value="-" readonly><input class="address" readonly><input class="details" maxlength="128"></div><button type="button" data-button="modalSubmit" disabled>저장</button><button type="button" data-button="modalCancel">취소</button></div></div>`,
    );
    const modal = document.querySelector("#modal")!,
      stage = Array.from(
        modal.querySelectorAll<HTMLInputElement>(".internal input"),
      );
    modal
      .querySelector('[data-button="modalClose"]')!
      .addEventListener("click", () => {
        event("modal-close");
        if (!options.brokenClose) modal.remove();
      });
    stage[2].value = options.detailBeforeSelection ?? "";
    const submit = modal.querySelector<HTMLButtonElement>(
      '[data-button="modalSubmit"]',
    )!;
    if (!options.liveHandler)
      vi.spyOn(submit, "getBoundingClientRect").mockReturnValue(
        new DOMRect(20, 30, 80, 40),
      );
    // writeResume.js polls .val() independently of input events, once per second.
    if (options.liveHandler) {
      const interval = setInterval(() => {
        if (!modal.isConnected) return clearInterval(interval);
        submit.disabled =
          !!options.submitDisabled || !stage.every((e) => e.value);
      }, 1000);
    }
    modal
      .querySelector("#searchAppAdressForm button")!
      .addEventListener("click", () => {
        event("search");
        let host = modal.querySelector(".postcodify_search_form")!;
        host.replaceChildren();
        if (options.loadingRow)
          host.innerHTML =
            '<div class="postcodify_search_result">검색 중</div>';
        const renderResults = () => {
          if (options.replaceResultHost) {
            const replacement = host.cloneNode(false) as HTMLElement;
            host.replaceWith(replacement);
            host = replacement;
          }
          host.replaceChildren();
          for (const r of options.results ?? [addressExpected]) {
            const row = document.createElement("div");
            row.className = "postcodify_search_result";
            row.innerHTML =
              '<div class="code6"></div><div class="code5"></div><div class="address"><a class="selector" href="#"><span class="address_info"></span><span class="extra_info"></span></a></div>';
            row.querySelector(".code5")!.textContent = r.postalCode;
            row.querySelector(".address_info")!.textContent = r.address;
            row.querySelector(".extra_info")!.textContent =
              options.extraInfo ?? "";
            row.querySelector("a")!.addEventListener("click", (e) => {
              e.preventDefault();
              stage[0].value = r.postalCode;
              stage[1].value = options.stageWrong ? "다른주소" : r.address;
              event("select");
            });
            host.append(row);
            if (options.duplicateDelay)
              setTimeout(
                () => host.append(row.cloneNode(true)),
                options.duplicateDelay,
              );
          }
        };
        if (options.resultDelay) setTimeout(renderResults, options.resultDelay);
        else renderResults();
      });
    stage[2].addEventListener("input", () => {
      event("details");
      if (!options.liveHandler)
        setTimeout(() => {
          submit.disabled = !stage.every((e) => e.value);
        }, options.delay ?? 10);
    });
    const pointer: string[] = [];
    for (const name of [
      "pointerdown",
      "mousedown",
      "pointerup",
      "mouseup",
      "click",
    ])
      submit.addEventListener(name, () => {
        pointer.push(name);
        event(name);
        if (
          name !== "click" ||
          options.noPointerResponse ||
          (!options.liveHandler &&
            pointer.join(",") !==
              "pointerdown,mousedown,pointerup,mouseup,click") ||
          !stage.every((e) => e.value) ||
          options.confirm === "missing"
        )
          return;
        const showConfirm = () => {
          for (let i = 0; i < (options.confirm === "duplicate" ? 2 : 1); i++) {
            const wrap = document.createElement("div");
            wrap.id = "wrapDialog";
            wrap.innerHTML = `<div id="Dialog"><p>${options.confirm === "wrong" ? "다른 항목을 저장하시겠습니까?" : "저장하시겠습니까?"}</p>\n\t<div><button type="button" data-button="ok">확인</button> <button type="button" data-button="cancel">취소</button> <button type="button" style="width:0;height:0;opacity:0"></button>\n\t</div>\n</div>`;
            wrap
              .querySelector('[data-button="ok"]')!
              .addEventListener("click", () => {
                event("ok");
                inputs().forEach((e, i) => (e.value = stage[i].value));
                if (options.copyWrong) inputs()[2].value = "다른 상세";
                document.querySelector("span.postCode")!.textContent =
                  stage[0].value;
                if (!options.keepModal) modal.remove();
                wrap.remove();
              });
            wrap
              .querySelector('[data-button="cancel"]')!
              .addEventListener("click", () => {
                event("cancel");
                wrap.remove();
              });
            if (options.confirmRevealDelay) {
              wrap.style.display = "none";
              setTimeout(
                () => (wrap.style.display = ""),
                options.confirmRevealDelay,
              );
            }
            document.body.append(wrap);
          }
        };
        showConfirm();
      });
  });
  const controller = new AbortController();
  let current: AddressValue = { ...addressExpected };
  const run = (expected = addressExpected) =>
    getWorkflowAdapter(document).runAddress!({
      document,
      button,
      expected,
      loadCurrent: async () => {
        options.onLoadCurrent?.();
        return current;
      },
      signal: controller.signal,
      search: async () => {
        throw Error("generic search");
      },
    });
  return {
    policy,
    inputs,
    button,
    events,
    controller,
    run,
    setCurrent: (v: AddressValue) => (current = v),
  };
}
