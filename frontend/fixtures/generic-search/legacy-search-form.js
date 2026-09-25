(() => {
  const schoolPopup = document.querySelector("#school-popup");
  const regionPopup = document.querySelector("#region-popup");
  const schoolFrame = document.querySelector("#school-frame");
  const regionFrame = document.querySelector("#region-frame");
  const counts = {
    schoolOpener: 0,
    regionOpener: 0,
    query: 0,
    submit: 0,
    schoolSelection: 0,
    regionSelection: 0,
  };
  window.syntheticLegacyCounts = () => ({ ...counts });
  document.querySelector("#open-school").addEventListener("click", () => {
    counts.schoolOpener++;
    schoolPopup.hidden = false;
  });
  document.querySelector("#open-region").addEventListener("click", () => {
    counts.regionOpener++;
    regionPopup.hidden = false;
  });
  schoolFrame.addEventListener("load", () => {
    const doc = schoolFrame.contentDocument;
    doc
      .querySelector('[name="school_query"]')
      .addEventListener("input", () => counts.query++);
    doc.querySelector("form").addEventListener("submit", (event) => {
      event.preventDefault();
      counts.submit++;
    });
    schoolFrame.contentWindow.selectSyntheticSchool = (_id, label, code) => {
      counts.schoolSelection++;
      document.querySelector("#school-a").value = label;
      document.querySelector("#code-a").value = code;
      schoolPopup.hidden = true;
    };
  });
  regionFrame.addEventListener("load", () => {
    regionFrame.contentWindow.selectSyntheticRegion = (literal) => {
      counts.regionSelection++;
      const [, label] = literal.split("||");
      document.querySelector("#region").value = label;
      document.querySelector("#region-code").value = literal;
      regionPopup.hidden = true;
    };
  });
})();
