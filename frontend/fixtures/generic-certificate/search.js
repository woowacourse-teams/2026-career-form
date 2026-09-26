(() => {
  "use strict";

  const candidates = [
    {
      name: "SQLD(SQL개발자)",
      code: "fixture-certificate-01",
      grade: "개발자",
    },
    { name: "정보처리기사", code: "fixture-certificate-02", grade: "기사" },
    {
      name: "정보처리산업기사",
      code: "fixture-certificate-03",
      grade: "산업기사",
    },
  ];
  const params = new URLSearchParams(window.location.search);
  const query = (params.get("query") ?? "").trim();
  const targetCode = params.get("targetCode") ?? "";
  const queryInput = document.querySelector("#certificate-query");
  const targetCodeInput = document.querySelector("#target-code");
  const results = document.querySelector("#certificate-results");
  const status = document.querySelector("#search-status");

  if (queryInput) queryInput.value = query;
  if (targetCodeInput) targetCodeInput.value = targetCode;
  if (!results || !query) return;

  const matches = candidates.filter((candidate) => candidate.name === query);
  results.dataset.searchQuery = query;
  results.dataset.resultCount = String(matches.length);
  results.dataset.searchComplete = "true";
  results.dataset.totalCount = String(matches.length);
  matches.forEach((candidate) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = candidate.name;
    button.dataset.code = candidate.code;
    button.dataset.codeTarget = targetCode;
    button.addEventListener("click", () => {
      window.parent.postMessage(
        { type: "synthetic-certificate-selected", targetCode, ...candidate },
        window.location.origin,
      );
    });
    item.append(button);
    results.append(item);
  });
  if (status)
    status.textContent = matches.length
      ? "완결된 합성 검색 결과에서 한 항목을 선택하세요."
      : "완결된 합성 검색 결과가 없습니다.";
})();
