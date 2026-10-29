import { afterEach, describe, expect, it, vi } from "vitest";
import { runKakaoAddress } from "./kakao-executor";

afterEach(() => document.body.replaceChildren());

// Public example addresses; the dialog is a same-origin search like a site's own.
let expected = {
  address: "제주특별자치도 제주시 첨단로 242 (영평동)",
  postalCode: "63309",
  detail: "",
};

function setup(rows: [string, string][], detailStep = false) {
  document.body.innerHTML = `<table><tr><td><input id="zip" readonly placeholder="우편번호"><button type="button" id="find"><svg></svg></button><input id="road" readonly placeholder="주소"></td></tr></table>
    <select id="next"><option>다음</option></select>`;
  const zip = document.querySelector<HTMLInputElement>("#zip")!;
  const road = document.querySelector<HTMLInputElement>("#road")!;
  const button = document.querySelector<HTMLButtonElement>("#find")!;
  const queries: string[] = [];
  button.addEventListener("click", () => {
    const dialog = document.createElement("section");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.innerHTML = `<h2>주소검색</h2><button type="button" class="close"><svg></svg></button>
      <input type="text" placeholder="도로명/지번/건물명을 입력하세요"><button type="button" class="go">검색</button>
      <table><thead><tr><th>우편번호</th><th>주소</th></tr></thead><tbody></tbody></table>`;
    const input = dialog.querySelector("input")!;
    dialog.querySelector(".go")!.addEventListener("click", () => {
      queries.push(input.value);
      setTimeout(() => {
        dialog.querySelector("tbody")!.innerHTML = rows
          .map(([code, text]) => `<tr><td>${code}</td><td>${text}</td></tr>`)
          .join("");
        dialog.querySelectorAll("tbody tr").forEach((row, index) =>
          row.addEventListener("click", () => {
            if (!detailStep) {
              zip.value = rows[index]![0];
              road.value = rows[index]![1];
              dialog.remove();
              return;
            }
            dialog.insertAdjacentHTML(
              "beforeend",
              `<p>${rows[index]![1]}</p><input placeholder="상세 주소"><button type="button" class="cancel">닫기</button><button type="button" class="ok">주소 입력</button>`,
            );
            const detail = dialog.querySelector<HTMLInputElement>("input[placeholder='상세 주소']")!;
            dialog.querySelector(".ok")!.addEventListener("click", () => {
              zip.value = rows[index]![0];
              road.value = `${rows[index]![1]} ${detail.value}`.trim();
              dialog.remove();
            });
          }),
        );
      }, 50);
    });
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") dialog.remove();
    });
    document.body.append(dialog);
  });
  return { zip, road, button, queries };
}

function run(button: Element, zip: HTMLInputElement, road: HTMLInputElement) {
  return runKakaoAddress({
    document,
    button,
    expected,
    loadCurrent: async () => expected,
    signal: new AbortController().signal,
    search: vi.fn(async () => false),
    targets: { postalCode: zip, address: road },
  });
}

describe("generic same-origin address search dialog", () => {
  it("searches the road address and picks the one row with the stored postcode", async () => {
    const { zip, road, button, queries } = setup([
      ["63310", "제주특별자치도 제주시 첨단로 213-4"],
      ["63309", "제주특별자치도 제주시 첨단로 242"],
    ]);

    const result = await run(button, zip, road);

    expect(result.status).toBe("written");
    expect(queries).toEqual(["제주특별자치도 제주시 첨단로 242"]);
    expect([zip.value, road.value]).toEqual([
      "63309",
      "제주특별자치도 제주시 첨단로 242",
    ]);
    expect(document.querySelector("[role='dialog']")).toBeNull();
  });

  it("enters the detail in the dialog's own detail step and confirms it", async () => {
    expected = { ...expected, detail: "공개 예시" };
    const { zip, road, button } = setup(
      [["63309", "제주특별자치도 제주시 첨단로 242 (영평동)"]],
      true,
    );

    const result = await run(button, zip, road);
    expected = { ...expected, detail: "" };

    expect(result.status).toBe("written");
    expect([zip.value, road.value]).toEqual([
      "63309",
      "제주특별자치도 제주시 첨단로 242 (영평동) 공개 예시",
    ]);
    expect(document.querySelector("[role='dialog']")).toBeNull();
  });

  it("closes the dialog and stays manual when no row matches", async () => {
    const { zip, road, button } = setup([
      ["63310", "제주특별자치도 제주시 첨단로 213-4"],
    ]);

    const result = await run(button, zip, road);

    expect(result.status).toBe("manual");
    expect([zip.value, road.value]).toEqual(["", ""]);
    expect(document.querySelector("[role='dialog']")).toBeNull();
  });
});
