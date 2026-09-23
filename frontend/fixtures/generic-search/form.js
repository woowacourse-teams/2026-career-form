(() => {
  "use strict";

  const applicationForm = document.querySelector("#application-form");
  const educationList = document.querySelector("#education-list");
  const popup = document.querySelector("#search-popup");
  const frame = document.querySelector("#school-search-frame");
  const status = document.querySelector("#fixture-status");
  const duplicateOpener = document.querySelector("#duplicate-opener");
  const duplicateResults = document.querySelector("#duplicate-results");
  const ambiguousQuery = document.querySelector("#ambiguous-query");
  const crossOriginFrame = document.querySelector("#cross-origin-frame");
  const replaceOnOpen = document.querySelector("#replace-on-open");
  const submitCount = document.querySelector("#application-submit-count");
  educationList
    ?.querySelectorAll("button[data-search-field]")
    .forEach((button) => {
      button.setAttribute("aria-controls", "search-popup");
      button.setAttribute("aria-haspopup", "dialog");
    });
  const initialEducationMarkup = educationList?.innerHTML ?? "";

  const SAME_ORIGIN_FRAME = "./school-search.html";
  const CROSS_ORIGIN_FRAME =
    "http://localhost:8081/generic-search/school-search.html";
  let activeTarget;
  let activeRow;
  let applicationSubmitClicks = 0;

  const announce = (message) => {
    if (status) status.textContent = message;
  };

  const dispatchValueEvents = (element) => {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const sameOriginFrameUrl = () => {
    const params = new URLSearchParams({
      duplicate: duplicateResults?.checked ? "1" : "0",
      ambiguous: ambiguousQuery?.checked ? "1" : "0",
      field: activeTarget?.name.split(".").at(-1) ?? "schoolName",
    });
    return `${SAME_ORIGIN_FRAME}?${params}`;
  };

  const frameUrl = () =>
    crossOriginFrame?.checked ? CROSS_ORIGIN_FRAME : sameOriginFrameUrl();

  const currentRows = () => [
    ...(educationList?.querySelectorAll("[data-repeater-item]") ?? []),
  ];

  const searchButtons = (row) => [
    ...row.querySelectorAll("button[data-search-field]"),
  ];

  const targetInput = (row) =>
    row.querySelector('input[readonly][name*="schoolName"]');

  const removeExtraOpeners = () => {
    educationList
      ?.querySelectorAll("[data-extra-opener]")
      .forEach((button) => button.remove());
  };

  const syncDuplicateOpeners = () => {
    removeExtraOpeners();
    if (!duplicateOpener?.checked) return;
    currentRows().forEach((row) => {
      searchButtons(row).forEach((opener) => {
        const duplicate = opener.cloneNode(true);
        duplicate.removeAttribute("id");
        duplicate.dataset.extraOpener = "true";
        opener.closest("dd")?.append(duplicate);
      });
    });
  };

  const closePopup = (message = "학교명 검색을 취소했습니다.") => {
    if (popup) popup.hidden = true;
    activeTarget = undefined;
    activeRow = undefined;
    announce(message);
  };

  const replaceRow = (row) => {
    if (!row?.isConnected || !educationList) return;
    const replacement = row.cloneNode(true);
    replacement.dataset.replacedRow = "true";
    replacement.querySelector("h3").textContent =
      `${row.querySelector("h3")?.textContent ?? "학력 행"} (새 DOM)`;
    const input = targetInput(replacement);
    if (input) {
      input.value = "";
      input.id = `${input.id || "school-name"}-replacement`;
    }
    row.replaceWith(replacement);
    syncDuplicateOpeners();
    announce(
      "원본 학력 행을 새 DOM으로 교체했습니다. 기존 검색 대상은 stale 상태입니다.",
    );
  };

  const openPopup = (button) => {
    const row = button.closest("[data-repeater-item]");
    const group = button.closest("dd");
    const input = group?.querySelector('input[readonly][type="text"]');
    const openers = group && searchButtons(group);
    if (!row || !input || !openers || openers.length !== 1) {
      announce(
        "같은 반복 행의 학교명 검색 버튼을 하나로 식별할 수 없어 중단했습니다.",
      );
      return;
    }
    activeTarget = input;
    activeRow = row;
    if (frame) frame.src = frameUrl();
    if (popup) popup.hidden = false;
    announce("학교명 검색 팝업을 열었습니다.");
    if (replaceOnOpen?.checked) {
      window.setTimeout(() => replaceRow(row), 250);
    }
  };

  const handleSelection = (event) => {
    if (
      event.origin !== window.location.origin ||
      event.source !== frame?.contentWindow
    )
      return;
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "school-search-cancelled") {
      closePopup("iframe에서 학교명 검색을 취소했습니다.");
      return;
    }
    if (data.type !== "school-selected" || typeof data.schoolName !== "string")
      return;
    const selectedName = data.schoolName.trim();
    if (
      !selectedName ||
      !activeTarget?.isConnected ||
      !activeRow?.isConnected ||
      !activeRow.contains(activeTarget)
    ) {
      closePopup("학교명 선택 전에 원본 반복 행이 바뀌어 중단했습니다.");
      return;
    }
    activeTarget.value = selectedName;
    const selectionCode = activeTarget
      .closest("dd")
      ?.querySelector("input[type='hidden']");
    if (selectionCode) selectionCode.value = `selected:${selectedName}`;
    dispatchValueEvents(activeTarget);
    closePopup(`학교명 선택 완료: ${selectedName}`);
  };

  applicationForm?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-search-field]");
    if (button) openPopup(button);
  });

  applicationForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    applicationSubmitClicks += 1;
    if (submitCount)
      submitCount.textContent = `제출 클릭 ${applicationSubmitClicks}회`;
    announce("합성 지원서 제출은 실행하지 않고 클릭 횟수만 기록했습니다.");
  });

  [duplicateOpener, duplicateResults, ambiguousQuery].forEach((control) => {
    control?.addEventListener("change", () => {
      syncDuplicateOpeners();
      if (popup && !popup.hidden && frame) frame.src = frameUrl();
      announce("검색 시나리오 설정을 적용했습니다.");
    });
  });

  crossOriginFrame?.addEventListener("change", () => {
    if (popup && !popup.hidden && frame) frame.src = frameUrl();
    announce(
      crossOriginFrame.checked
        ? "다른 출처 iframe을 선택했습니다. 접근 불가 상태를 확인하세요."
        : "동일 출처 iframe을 선택했습니다.",
    );
  });

  document
    .querySelector("#replace-active-row")
    ?.addEventListener("click", () => {
      if (activeRow?.isConnected) replaceRow(activeRow);
      else announce("먼저 학교명 검색 팝업을 열어 원본 행을 정하세요.");
    });

  document.querySelector("#restore-frame")?.addEventListener("click", () => {
    if (crossOriginFrame) crossOriginFrame.checked = false;
    if (frame) frame.src = sameOriginFrameUrl();
    announce("동일 출처 학교 검색 iframe을 복원했습니다.");
  });

  document.querySelector("#reset-fixture")?.addEventListener("click", () => {
    closePopup("가상 양식을 초기화했습니다.");
    duplicateOpener.checked = false;
    duplicateResults.checked = false;
    ambiguousQuery.checked = false;
    crossOriginFrame.checked = false;
    replaceOnOpen.checked = false;
    if (educationList) educationList.innerHTML = initialEducationMarkup;
    if (frame) frame.src = sameOriginFrameUrl();
    applicationSubmitClicks = 0;
    if (submitCount) submitCount.textContent = "제출 클릭 0회";
    syncDuplicateOpeners();
    announce("가상 양식을 초기 상태로 복원했습니다.");
  });

  [
    document.querySelector("#close-search"),
    document.querySelector("#popup-close"),
    document.querySelector("#popup-cancel"),
  ].forEach((button) => {
    button?.addEventListener("click", () => closePopup());
  });

  window.addEventListener("message", handleSelection);
  syncDuplicateOpeners();
})();
