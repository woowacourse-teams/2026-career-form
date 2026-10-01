(() => {
  "use strict";

  const SCHOOL_NAMES = ["서울대학교", "서울고", "공개대학교"];
  const params = new URLSearchParams(window.location.search);
  const field = params.get("field") ?? "schoolName";
  const namesByField = {
    schoolName: SCHOOL_NAMES,
    schoolRegion: ["가상지역", "공개지역"],
    majorName: ["가상전공학과", "공개전공학과"],
  };
  const label =
    { schoolName: "학교명", schoolRegion: "학교소재지", majorName: "전공" }[
      field
    ] ?? "학교명";
  const duplicate = params.get("duplicate") === "1";
  const ambiguous = params.get("ambiguous") === "1";
  const form = document.querySelector("#school-search-form");
  const queryInput = document.querySelector("#school-query");
  const results = document.querySelector("#school-results");
  const status = document.querySelector("#search-status");
  const duplicateQueryInputs = document.querySelector(
    "#duplicate-query-inputs",
  );
  document.querySelector("h1").textContent = `${label} 검색`;
  document.querySelector("label").textContent = `${label} 입력`;
  queryInput.title = `${label} 입력`;
  results.setAttribute("aria-label", `${label} 검색 결과`);

  const announce = (message) => {
    if (status) status.textContent = message;
  };

  const resultNames = (query) => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    if (!normalized) return [];
    const matches = (namesByField[field] ?? []).filter((name) =>
      name.toLocaleLowerCase("ko-KR").includes(normalized),
    );
    if (duplicate && matches.length > 0) return [...matches, matches[0]];
    return matches;
  };

  const renderDuplicateQueryInput = () => {
    if (!ambiguous || !queryInput || !duplicateQueryInputs) return;
    const duplicate = queryInput.cloneNode(true);
    duplicate.removeAttribute("id");
    duplicate.name = "query-duplicate";
    duplicate.dataset.duplicateQuery = "true";
    duplicateQueryInputs.append(duplicate);
    duplicateQueryInputs.hidden = false;
    announce("학교명 입력 후보가 두 개라 검색어를 하나로 판단할 수 없습니다.");
  };

  const renderResults = (query) => {
    if (!results) return;
    results.setAttribute("aria-busy", "true");
    results.dataset.searchComplete = "false";
    results.replaceChildren();
    const names = resultNames(query);
    names.forEach((name) => {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = "#";
      link.textContent = name;
      link.dataset.schoolName = name;
      link.addEventListener("click", (event) => {
        event.preventDefault();
        window.parent.postMessage(
          { type: "school-selected", schoolName: name },
          window.location.origin,
        );
      });
      item.append(link);
      results.append(item);
    });
    results.dataset.searchQuery = query;
    results.dataset.resultCount = String(names.length);
    results.dataset.searchComplete = "true";
    results.setAttribute("aria-busy", "false");
    if (names.length === 0) announce("일치하는 학교명이 없습니다.");
    else if (names.length > 1)
      announce(
        `학교명 검색 결과 ${names.length}개입니다. 정확한 결과를 확인하세요.`,
      );
    else announce("학교명 검색 결과를 선택하세요.");
  };

  form?.addEventListener("submit", (event) => event.preventDefault());
  document
    .querySelector("#school-search-submit")
    ?.addEventListener("click", () => {
      renderResults(queryInput?.value ?? "");
    });

  document
    .querySelector("#school-search-cancel")
    ?.addEventListener("click", () => {
      window.parent.postMessage(
        { type: "school-search-cancelled" },
        window.location.origin,
      );
    });

  renderDuplicateQueryInput();
})();
