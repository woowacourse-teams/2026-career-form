(() => {
  "use strict";

  const form = document.querySelector("#synthetic-application");
  const status = document.querySelector("#fixture-status");
  const list = document.querySelector("#certification-list");
  const template = document.querySelector("#certification-template");
  const count = document.querySelector("#certification-count");

  const announce = (message) => { if (status) status.textContent = message; };
  const dispatchValueEvents = (element) => {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const rows = () => [...(list?.querySelectorAll("[data-repeater-item]") ?? [])];
  const refreshCount = () => { if (count) count.textContent = `행 ${rows().length}개`; };

  const addRow = () => {
    if (!template || !list) return;
    const fragment = template.content.cloneNode(true);
    const row = fragment.querySelector("[data-repeater-item]");
    if (!row) return;
    const index = rows().length + 1;
    row.querySelector("[data-row-title]").textContent = `자격증 행 ${index}`;
    const name = row.querySelector("[data-name-field]");
    const date = row.querySelector("[data-date-field]");
    name.id = `cert-name-${index}`;
    date.id = `cert-date-${index}`;
    row.querySelector("[data-name-label]").htmlFor = name.id;
    row.querySelector("[data-date-label]").htmlFor = date.id;
    list.append(row);
    refreshCount();
    announce(`자격증 반복 행이 ${rows().length}개가 되었습니다.`);
  };

  const revealMilitaryDetails = () => {
    const selected = form?.querySelector("input[name='military.military.militaryStatus']:checked");
    const details = document.querySelector("#military-details");
    const controls = form?.querySelectorAll("input[aria-controls='military-details']") ?? [];
    if (!details) return;
    details.hidden = !selected || selected.value !== "군필";
    controls.forEach((control) => control.setAttribute("aria-expanded", String(!details.hidden)));
    announce(details.hidden ? "병역 상세가 숨겨져 있습니다." : "병역 상세가 표시되었습니다.");
  };

  const setupCombobox = () => {
    const input = document.querySelector("#school-choice");
    const listbox = document.querySelector("#school-options");
    const live = document.querySelector("#school-live");
    if (!input || !listbox) return;
    const options = () => [...listbox.querySelectorAll("[role='option']")];
    const show = () => { listbox.hidden = false; input.setAttribute("aria-expanded", "true"); };
    const hide = () => { listbox.hidden = true; input.setAttribute("aria-expanded", "false"); };
    const filter = () => {
      const query = input.value.trim().toLocaleLowerCase("ko-KR");
      let visible = 0;
      options().forEach((option) => {
        const matches = !query || option.textContent.toLocaleLowerCase("ko-KR").includes(query);
        option.hidden = !matches;
        if (matches) visible += 1;
      });
      if (live) live.textContent = `학교 선택지 ${visible}개`;
      show();
    };
    input.addEventListener("focus", filter);
    input.addEventListener("click", filter);
    input.addEventListener("input", filter);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") hide();
      if (event.key !== "ArrowDown" && event.key !== "Enter") return;
      event.preventDefault();
      const option = options().find((candidate) => !candidate.hidden);
      if (option && event.key === "Enter") option.click();
    });
    options().forEach((option) => option.addEventListener("click", () => {
      input.value = option.textContent.trim();
      options().forEach((candidate) => candidate.setAttribute("aria-selected", String(candidate === option)));
      input.setAttribute("aria-activedescendant", option.id);
      dispatchValueEvents(input);
      hide();
      announce(`학교 선택: ${input.value}`);
    }));
  };

  document.querySelector("#add-certification")?.addEventListener("click", addRow);
  document.querySelectorAll("input[aria-controls='military-details']").forEach((control) => control.addEventListener("change", revealMilitaryDetails));
  document.querySelector("#demo-unmatched")?.addEventListener("click", () => {
    const field = document.querySelector("#unmatched-field");
    field?.focus();
    announce("프로필과 연결되지 않는 합성 필드에 포커스를 두었습니다.");
  });
  document.querySelector("#demo-conflict")?.addEventListener("click", () => {
    const field = document.querySelector("#conflict-email");
    if (!field) return;
    field.value = "existing@fixture.test";
    dispatchValueEvents(field);
    field.focus();
    announce("기존 이메일 충돌 합성값을 적용했습니다.");
  });
  document.querySelector("#demo-rerender")?.addEventListener("click", () => {
    const first = rows()[0];
    if (!first || !template || !list) return;
    const fragment = template.content.cloneNode(true);
    const replacement = fragment.querySelector("[data-repeater-item]");
    if (!replacement) return;
    replacement.querySelector("[data-row-title]").textContent = "자격증 행 1 (새 DOM)";
    replacement.querySelector("[data-name-field]").id = "cert-name-rerendered";
    replacement.querySelector("[data-date-field]").id = "cert-date-rerendered";
    replacement.querySelector("[data-name-label]").htmlFor = "cert-name-rerendered";
    replacement.querySelector("[data-date-label]").htmlFor = "cert-date-rerendered";
    first.replaceWith(replacement);
    refreshCount();
    announce("첫 반복 행을 새 DOM으로 교체했고 값은 의도적으로 비웠습니다.");
  });
  form?.addEventListener("submit", (event) => { event.preventDefault(); announce("합성 fixture는 제출하지 않습니다."); });
  refreshCount();
  setupCombobox();
})();
