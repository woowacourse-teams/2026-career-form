(() => {
  "use strict";
  const byId = (id) => document.getElementById(id);
  const school = byId("school-dialog");
  const region = byId("region-dialog");
  const frame = byId("school-frame");
  const majorOptions = byId("major-options");
  const majorQuery = byId("major-query");
  const reflect = (id, value) => {
    const input = byId(id);
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    byId("status").textContent = "합성 선택값을 반영했습니다.";
  };
  const options = (root, names, select, query) => {
    root.setAttribute("aria-busy", "true");
    root.dataset.searchComplete = "false";
    root.replaceChildren();
    names.forEach((name, index) => {
      const option = document.createElement("button");
      option.type = "button";
      option.role = "option";
      option.textContent = name;
      option.setAttribute("aria-setsize", String(names.length));
      option.setAttribute("aria-posinset", String(index + 1));
      option.addEventListener("click", () => select(name));
      root.append(option);
    });
    if (query !== undefined) root.dataset.searchQuery = query;
    root.dataset.resultCount = String(names.length);
    root.dataset.searchComplete = "true";
    root.setAttribute("aria-busy", "false");
  };
  document
    .querySelector("form")
    .addEventListener("submit", (event) => event.preventDefault());
  byId("school-open").addEventListener("click", () => {
    frame.src = "./school-search.html?field=schoolName";
    school.showModal();
  });
  byId("school-close").addEventListener("click", () => school.close());
  window.addEventListener("message", (event) => {
    if (
      !school.open ||
      event.origin !== location.origin ||
      event.source !== frame.contentWindow
    )
      return;
    if (event.data?.type === "school-search-cancelled") school.close();
    if (
      event.data?.type === "school-selected" &&
      ["서울대학교", "서울고", "공개대학교"].includes(event.data.schoolName)
    ) {
      reflect("school-name", event.data.schoolName);
      school.close();
    }
  });
  byId("region-open").addEventListener("click", () => {
    options(
      byId("region-options"),
      ["가상지역", "공개지역", "서울", "부산"],
      (name) => {
        reflect("school-region", name);
        region.close();
      },
    );
    region.showModal();
  });
  byId("region-close").addEventListener("click", () => region.close());
  const renderMajors = () => {
    const query = majorQuery.value;
    options(
      majorOptions,
      ["가상전공학과", "공개전공학과"].filter((name) => name.includes(query)),
      (name) => {
        reflect("major-name", name);
        majorOptions.hidden = true;
        majorQuery.hidden = true;
        byId("major-open").setAttribute("aria-expanded", "false");
      },
      query,
    );
  };
  byId("major-open").addEventListener("click", () => {
    majorOptions.hidden = false;
    majorQuery.hidden = false;
    majorQuery.value = "";
    byId("major-open").setAttribute("aria-expanded", "true");
    renderMajors();
  });
  majorQuery.addEventListener("input", renderMajors);
})();
