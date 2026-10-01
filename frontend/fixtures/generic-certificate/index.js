(() => {
  "use strict";

  const rows = document.querySelector("#certificate-rows");
  const addButton = document.querySelector("#add-certificate");
  const dialog = document.querySelector("#certificate-search-dialog");
  const frame = document.querySelector("#certificate-search-frame");
  const status = document.querySelector("#fixture-status");
  const maximumRows = 5;
  let activeRow;

  const announce = (message) => {
    if (status) status.textContent = message;
  };

  const dispatchValueEvents = (element) => {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const rowMarkup = (index) => `
    <article class="row" ismultirow="true" data-repeatable-row data-row-index="${index}">
      <h3>자격 항목 ${index + 1}</h3>
      <div class="search-line">
        <label for="certificate-name-${index}">자격증명
          <input id="certificate-name-${index}" name="certifications[${index}].name" type="text" readonly aria-label="자격증명" />
        </label>
        <input id="certificate-code-${index}" name="certifications[${index}].code" type="hidden" value="" />
        <button type="button" data-certificate-search aria-controls="certificate-search-dialog" aria-haspopup="dialog">검색</button>
      </div>
      <label for="certificate-registration-${index}">자격번호
        <input id="certificate-registration-${index}" name="certifications[${index}].registrationNo" type="text" aria-label="자격번호" />
      </label>
      <div data-certificate-follow-up hidden>
        <label for="certificate-grade-${index}">등급
          <select id="certificate-grade-${index}" name="certifications[${index}].grade" disabled>
            <option value="">등급 선택</option>
          </select>
        </label>
        <label for="certificate-issuer-${index}">발급기관
          <input id="certificate-issuer-${index}" name="certifications[${index}].issuer" type="text" aria-label="발급기관" />
        </label>
        <label for="certificate-date-${index}">취득일
          <input id="certificate-date-${index}" name="certifications[${index}].acquisitionDate" type="text" placeholder="YYYY.MM.DD" aria-label="취득일" />
        </label>
      </div>
    </article>`;

  const currentRows = () => [...(rows?.querySelectorAll("[ismultirow]") ?? [])];

  const addRow = () => {
    if (!rows || currentRows().length >= maximumRows) {
      announce(`최대 ${maximumRows}개 행까지 추가할 수 있습니다.`);
      return;
    }
    rows.insertAdjacentHTML("beforeend", rowMarkup(currentRows().length));
    announce("합성 자격증 행을 추가했습니다.");
  };

  const closeSearch = (message = "자격증명 검색을 취소했습니다.") => {
    if (dialog) dialog.hidden = true;
    activeRow = undefined;
    announce(message);
  };

  const openSearch = (button) => {
    const row = button.closest("[ismultirow]");
    const target = row?.querySelector("input[readonly]");
    const code = row?.querySelector("input[type=hidden]");
    if (!row || !target || !code || !frame || !dialog) {
      announce("같은 반복 행의 검색 대상과 관계 코드를 확인할 수 없습니다.");
      return;
    }
    activeRow = row;
    frame.src = `./search.html?targetCode=${encodeURIComponent(code.id)}`;
    dialog.hidden = false;
    announce("동일 출처 자격증명 검색 iframe을 열었습니다.");
  };

  const revealFollowUp = (row, grade) => {
    const followUp = row.querySelector("[data-certificate-follow-up]");
    const gradeSelect = followUp?.querySelector("select");
    if (!followUp || !gradeSelect) return;
    followUp.hidden = false;
    gradeSelect.disabled = false;
    gradeSelect.replaceChildren(
      new Option("등급 선택", ""),
      new Option(grade, grade),
    );
  };

  document
    .querySelector("#certificate-application")
    ?.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-certificate-search]");
      if (button) openSearch(button);
    });
  addButton?.addEventListener("click", addRow);
  document
    .querySelector("#close-certificate-search")
    ?.addEventListener("click", () => closeSearch());

  window.addEventListener("message", (event) => {
    if (
      event.origin !== window.location.origin ||
      event.source !== frame?.contentWindow
    )
      return;
    const result = event.data;
    if (!result || result.type !== "synthetic-certificate-selected") return;
    const name = typeof result.name === "string" ? result.name.trim() : "";
    const code = typeof result.code === "string" ? result.code.trim() : "";
    const grade = typeof result.grade === "string" ? result.grade.trim() : "";
    const target = activeRow?.querySelector("input[readonly]");
    const codeInput = activeRow?.querySelector("input[type=hidden]");
    if (
      !name ||
      !code ||
      !grade ||
      !target ||
      !codeInput ||
      result.targetCode !== codeInput.id
    ) {
      closeSearch("검색 결과의 같은 행 관계를 확인하지 못했습니다.");
      return;
    }
    target.value = name;
    codeInput.value = code;
    dispatchValueEvents(target);
    const selectedRow = activeRow;
    closeSearch("자격증명과 관계 코드가 같은 행에 반영되었습니다.");
    window.setTimeout(() => revealFollowUp(selectedRow, grade), 80);
  });

  addRow();
})();
