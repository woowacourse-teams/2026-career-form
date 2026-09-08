import { beforeEach, describe, expect, it } from "vitest";
import { runHyundaiAddress } from "./address";
const expected = {
  address: "서울특별시 중구 세종대로 110 (태평로1가)",
  postalCode: "04524",
  detail: "공개 예시",
};
function setup(mode = "unique") {
  document.body.innerHTML = `<article class="field-form-apply"><input id="inExGb" name="inExGb" type="radio" value="0" checked><input id="inExGb2" name="inExGb" type="radio" value="1"><div class="field"><input id="postCd" name="postCd" data-modal="modal-address" readonly></div><div class="field"><input id="addr" name="addr" readonly></div><div class="field"><input id="addrDtl" name="addrDtl"></div></article><div class="modal-wrap"><div class="modal modal-address"><input id="addressKeyword"><button id="btnAddress" type="button">검색</button><table class="table-modal"><tbody></tbody></table><button class="btn-modal-close" type="button">닫기</button></div></div>`;
  const modal = document.querySelector(".modal-address")!;
  const modalWrap = document.querySelector(".modal-wrap")!;
  const button = document.querySelector<HTMLInputElement>("#postCd")!;
  button.addEventListener("click", () => {
    modal.classList.add("active");
    modalWrap.classList.add("active");
    document.documentElement.classList.add("modal-open");
  });
  document.querySelector("#btnAddress")!.addEventListener("click", () => {
    setTimeout(() => {
      const tbody = modal.querySelector("tbody")!;
      tbody.innerHTML =
        mode === "none"
          ? "<tr><td>검색 결과 없음</td></tr>"
          : `<tr><td class="zipcode">04524</td><td><a class="btn-address">${expected.address}</a></td></tr>`.repeat(
              mode === "duplicate" ? 2 : 1,
            );
      for (const choice of tbody.querySelectorAll(".btn-address"))
        choice.addEventListener("click", () => {
          document.querySelector<HTMLInputElement>("#postCd")!.value =
            expected.postalCode;
          document.querySelector<HTMLInputElement>("#addr")!.value =
            expected.address;
          document.querySelector<HTMLInputElement>("#addrDtl")!.value = "";
          modal.classList.remove("active");
          modalWrap.classList.remove("active");
          document.documentElement.classList.remove("modal-open");
        });
    }, 1);
  });
  modal.querySelector(".btn-modal-close")!.addEventListener("click", () => {
    modal.setAttribute(
      "data-close-clicks",
      String(Number(modal.getAttribute("data-close-clicks") ?? "0") + 1),
    );
    modal.classList.remove("active");
    modalWrap.classList.remove("active");
    document.documentElement.classList.remove("modal-open");
  });
  return button;
}
function run(button: Element, overrides = {}) {
  return runHyundaiAddress({
    document,
    button,
    expected,
    loadCurrent: async () => expected,
    signal: new AbortController().signal,
    search: async () => {
      throw new Error("Hyundai must use its own modal");
    },
    ...overrides,
  });
}
describe("Hyundai normal address selection", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("modal-open");
    (
      globalThis as unknown as {
        jsdom: { reconfigure(o: { url: string }): void };
      }
    ).jsdom.reconfigure({
      url: "https://talent.hyundai.com/apply/applyWrite.hc",
    });
  });
  it("selects the exact address and restores matching detail cleared by the site", async () => {
    const button = setup();
    document.querySelector<HTMLInputElement>("#addrDtl")!.value =
      expected.detail;
    expect((await run(button)).status).toBe("written");
    expect(document.querySelector<HTMLInputElement>("#postCd")!.value).toBe(
      "04524",
    );
    expect(document.querySelector<HTMLInputElement>("#addr")!.value).toBe(
      expected.address,
    );
    expect(document.querySelector<HTMLInputElement>("#addrDtl")!.value).toBe(
      expected.detail,
    );
    expect(button.readOnly).toBe(true);
  });
  it.each(["duplicate", "none"])(
    "does not select %s results or change existing detail",
    async (mode) => {
      const button = setup(mode);
      document.querySelector<HTMLInputElement>("#addrDtl")!.value =
        expected.detail;
      expect((await run(button)).status).toBe("manual");
      expect(button.value).toBe("");
      expect(document.querySelector<HTMLInputElement>("#addrDtl")!.value).toBe(
        expected.detail,
      );
      const modal = document.querySelector<HTMLElement>(".modal-address")!;
      expect(modal.classList.contains("active")).toBe(false);
      expect(modal.getAttribute("data-close-clicks")).toBe("1");
      expect(
        document.querySelector(".modal-wrap")!.classList.contains("active"),
      ).toBe(false);
      expect(document.documentElement.classList.contains("modal-open")).toBe(
        false,
      );
    },
  );
  it("preserves existing conflicting detail without opening the modal", async () => {
    const button = setup();
    document.querySelector<HTMLInputElement>("#addrDtl")!.value = "기존 입력";
    expect((await run(button)).status).toBe("manual");
    expect(
      document.querySelector(".modal-address")!.classList.contains("active"),
    ).toBe(false);
    expect(document.querySelector<HTMLInputElement>("#addrDtl")!.value).toBe(
      "기존 입력",
    );
  });
  it.each(["profile", "edit", "abort", "replace", "close"])(
    "stops when %s changes during search",
    async (change) => {
      const button = setup();
      const controller = new AbortController();
      let current = expected;
      document.querySelector("#btnAddress")!.addEventListener("click", () => {
        if (change === "profile") current = { ...expected, detail: "새 값" };
        if (change === "edit")
          document.querySelector<HTMLInputElement>("#addrDtl")!.value =
            "사용자 변경";
        if (change === "abort") controller.abort();
        if (change === "replace") button.replaceWith(button.cloneNode());
        if (change === "close")
          document.querySelector(".modal-address")!.classList.remove("active");
      });
      expect(
        (
          await run(button, {
            signal: controller.signal,
            loadCurrent: async () => current,
          })
        ).status,
      ).toBe("manual");
      expect(document.querySelector<HTMLInputElement>("#postCd")!.value).toBe(
        "",
      );
      if (change === "edit")
        expect(
          document.querySelector<HTMLInputElement>("#addrDtl")!.value,
        ).toBe("사용자 변경");
      const modal = document.querySelector<HTMLElement>(".modal-address")!;
      if (change === "abort") {
        expect(modal.classList.contains("active")).toBe(false);
        expect(modal.getAttribute("data-close-clicks")).toBe("1");
      }
      if (change === "edit" || change === "replace") {
        expect(modal.classList.contains("active")).toBe(true);
        expect(modal.getAttribute("data-close-clicks")).toBeNull();
      }
    },
  );

  it("preserves preexisting detail when the profile changes in the site selection callback", async () => {
    const button = setup();
    document.querySelector<HTMLInputElement>("#addrDtl")!.value =
      expected.detail;
    let current = expected;
    const modal = document.querySelector(".modal-address")!;
    modal.addEventListener("click", (event) => {
      if ((event.target as Element).matches(".btn-address"))
        current = { ...expected, detail: "new profile detail" };
    });
    expect(
      (await run(button, { loadCurrent: async () => current })).status,
    ).toBe("manual");
    expect(document.querySelector<HTMLInputElement>("#addrDtl")!.value).toBe(
      expected.detail,
    );
  });

  it.each([
    "duplicate-query",
    "duplicate-search",
    "duplicate-results",
    "hidden-query",
    "disabled-search",
  ])("rejects %s modal controls without selecting", async (variant) => {
    const button = setup();
    const selector = variant.includes("query")
      ? "#addressKeyword"
      : variant.includes("search")
        ? "#btnAddress"
        : ".table-modal tbody";
    const control = document.querySelector(selector)!;
    if (variant.startsWith("duplicate"))
      control.before(control.cloneNode(true));
    if (variant === "hidden-query") (control as HTMLElement).hidden = true;
    if (variant === "disabled-search")
      (control as HTMLButtonElement).disabled = true;
    const outcome = await run(button);
    expect(outcome.status).toBe("manual");
    expect(button.value).toBe("");
    expect(
      document.querySelector<HTMLInputElement>("#addressKeyword")!.value,
    ).toBe("");
  });

  it("does not close an address modal that was already open", async () => {
    const button = setup("none");
    const modal = document.querySelector<HTMLElement>(".modal-address")!;
    const modalWrap = document.querySelector<HTMLElement>(".modal-wrap")!;
    modal.classList.add("active");
    modalWrap.classList.add("active");
    document.documentElement.classList.add("modal-open");

    expect((await run(button)).status).toBe("manual");
    expect(modal.classList.contains("active")).toBe(true);
    expect(modalWrap.classList.contains("active")).toBe(true);
    expect(modal.getAttribute("data-close-clicks")).toBeNull();
  });

  it.each(["query", "selection", "dom"])(
    "does not close its modal after a user-owned %s change",
    async (change) => {
      const button = setup("none");
      const modal = document.querySelector<HTMLElement>(".modal-address")!;
      document.querySelector("#btnAddress")!.addEventListener("click", () => {
        if (change === "query") {
          document.querySelector<HTMLInputElement>("#addressKeyword")!.value =
            "사용자 검색어";
        }
        if (change === "selection") {
          document.querySelector<HTMLInputElement>("#postCd")!.value = "12345";
          document.querySelector<HTMLInputElement>("#addr")!.value =
            "사용자 선택 주소";
        }
        if (change === "dom") {
          document
            .querySelector("#addressKeyword")!
            .replaceWith(
              document.querySelector("#addressKeyword")!.cloneNode(true),
            );
        }
      });

      expect((await run(button)).status).toBe("manual");
      expect(modal.classList.contains("active")).toBe(true);
      expect(modal.getAttribute("data-close-clicks")).toBeNull();
    },
  );

  it.each(["duplicate", "hidden", "disabled"])(
    "does not guess a %s modal close action",
    async (variant) => {
      const button = setup("none");
      const close =
        document.querySelector<HTMLButtonElement>(".btn-modal-close")!;
      if (variant === "duplicate") close.after(close.cloneNode(true));
      if (variant === "hidden") close.hidden = true;
      if (variant === "disabled") close.disabled = true;

      expect((await run(button)).status).toBe("manual");
      expect(
        document.querySelector(".modal-address")!.classList.contains("active"),
      ).toBe(true);
      expect(
        close.closest(".modal")!.getAttribute("data-close-clicks"),
      ).toBeNull();
    },
  );
});
