export type GenericCertificateFixtureKind =
  "cj-shaped" | "renamed-identifiers" | "fieldset-list";

export interface GenericCertificateFixture {
  kind: GenericCertificateFixtureKind;
  addButton: HTMLButtonElement;
  rows(): HTMLElement[];
  clicks(): number;
  searchActions(): { opens: number; submits: number; results: number };
}

export interface GenericCertificateFixtureOptions {
  completeQueryEvidence?: boolean;
  relation?: boolean;
}

function rowMarkup(kind: GenericCertificateFixtureKind, index: number): string {
  const grade = `level ${index + 1}`;
  const controls = `<dl><dt>자격증명</dt><dd>
    <input id="certificate-name-${index}" data-certificate-name type="text" readonly aria-label="자격증명">
    <input id="certificate-code-${index}" data-certificate-code type="hidden" value="">
    <button data-certificate-search type="button">자격증명 검색</button>
    </dd></dl>
    <label>등급<select data-certificate-grade disabled><option value="">등급 선택</option></select></label>
    <label>발급기관<input data-certificate-issuer type="text" aria-label="발급기관"></label>
    <label>취득일<input data-certificate-date type="text" placeholder="YYYY.MM.DD" aria-label="취득일"></label>
    <label>등록번호<input data-certificate-registration type="text" value="preserved-${index + 1}"></label>`;
  if (kind === "cj-shaped")
    return `<div class="field_wrap" ismultirow="true" data-grade="${grade}">${controls}</div>`;
  if (kind === "renamed-identifiers")
    return `<div data-repeater-item data-grade="${grade}">${controls}</div>`;
  return `<li data-repeater-item data-grade="${grade}">${controls}</li>`;
}

function markup(kind: GenericCertificateFixtureKind): string {
  if (kind === "cj-shaped") {
    return `<section class="certificate_wrap" data-max-items="3"><h3>자격 및 면허</h3>
      <div data-certificate-rows>${rowMarkup(kind, 0)}</div>
      <button type="button" data-add-certificate>자격증 추가</button></section>`;
  }
  if (kind === "renamed-identifiers") {
    return `<section data-max-items="3"><h3>자격 및 면허</h3>
      <div data-rows-renamed>${rowMarkup(kind, 0)}</div>
      <button type="button" data-add-certificate>자격증 추가</button></section>`;
  }
  return `<fieldset data-max-items="3"><legend>자격 및 면허</legend>
    <ol data-certificate-list>${rowMarkup(kind, 0)}</ol>
    <button type="button" data-add-certificate>자격증 추가</button></fieldset>`;
}

function rowContainer(
  document: Document,
  kind: GenericCertificateFixtureKind,
): HTMLElement {
  const selector =
    kind === "cj-shaped"
      ? "[data-certificate-rows]"
      : kind === "renamed-identifiers"
        ? "[data-rows-renamed]"
        : "[data-certificate-list]";
  return document.querySelector<HTMLElement>(selector)!;
}

function wireSearch(
  row: HTMLElement,
  actions: { opens: number; submits: number; results: number },
  options: GenericCertificateFixtureOptions,
) {
  const opener = row.querySelector<HTMLButtonElement>(
    "[data-certificate-search]",
  )!;
  opener.addEventListener("click", () => {
    actions.opens += 1;
    const surface = row.ownerDocument.createElement("div");
    surface.id = `synthetic-search-${Math.random().toString(16).slice(2)}`;
    surface.setAttribute("role", "dialog");
    surface.setAttribute("aria-modal", "true");
    opener.setAttribute("aria-controls", surface.id);
    const frame = row.ownerDocument.createElement("iframe");
    frame.srcdoc = "<!doctype html><html><body></body></html>";
    surface.append(frame);
    row.ownerDocument.body.append(surface);

    let popup = frame.contentDocument!;
    Object.defineProperty(popup, "readyState", {
      configurable: true,
      value: "complete",
    });
    Object.defineProperty(popup, "URL", {
      configurable: true,
      value: "about:srcdoc",
    });
    Object.defineProperty(frame, "contentDocument", {
      configurable: true,
      get: () => popup,
    });
    popup.body.innerHTML = `<form method="post" action="/synthetic/search" target="_self"><label>검색어<input id="query" name="query" type="text" aria-label="검색어"></label>
      <input name="scope" type="hidden" value="certificate">
      <button id="submit" type="submit">검색</button>
    </form>`;
    const query = popup.querySelector<HTMLInputElement>("#query")!;
    popup
      .querySelector<HTMLButtonElement>("#submit")!
      .addEventListener("click", (event) => {
        event.preventDefault();
        actions.submits += 1;
        const responseFrame = row.ownerDocument.createElement("iframe");
        responseFrame.hidden = true;
        row.ownerDocument.body.append(responseFrame);
        const response = responseFrame.contentDocument!;
        Object.defineProperty(response, "readyState", {
          configurable: true,
          value: "complete",
        });
        Object.defineProperty(response, "URL", {
          configurable: true,
          value: new URL("/synthetic/search", row.ownerDocument.URL).href,
        });
        response.body.innerHTML = `<ul aria-label="검색 결과" data-search-query="${query.value}" data-result-count="1" data-search-complete="${options.completeQueryEvidence !== false}"><li><button type="button" data-code="synthetic-code">${query.value}</button></li></ul>`;
        response
          .querySelector<HTMLButtonElement>("button")!
          .addEventListener("click", () => {
            actions.results += 1;
            row.querySelector<HTMLInputElement>(
              "[data-certificate-name]",
            )!.value = query.value;
            row.querySelector<HTMLInputElement>(
              "[data-certificate-code]",
            )!.value = "synthetic-code";
            const grade = row.querySelector<HTMLSelectElement>(
              "[data-certificate-grade]",
            )!;
            grade.disabled = false;
            grade.innerHTML = `<option value="">등급 선택</option><option value="${row.dataset.grade}">${row.dataset.grade}</option>`;
            surface.remove();
          });
        popup = response;
      });
  });
}

export function renderGenericCertificateFixture(
  document: Document,
  kind: GenericCertificateFixtureKind,
  options: GenericCertificateFixtureOptions = {},
): GenericCertificateFixture {
  document.body.innerHTML = markup(kind);
  const container = rowContainer(document, kind);
  const rows = () =>
    Array.from(
      container.querySelectorAll<HTMLElement>(
        kind === "cj-shaped" ? "[ismultirow=true]" : "[data-repeater-item]",
      ),
    );
  const search = { opens: 0, submits: 0, results: 0 };
  rows().forEach((row) => wireSearch(row, search, options));
  const addButton = document.querySelector<HTMLButtonElement>(
    "[data-add-certificate]",
  )!;
  let clickCount = 0;
  addButton.addEventListener("click", () => {
    clickCount += 1;
    const index = rows().length;
    container.insertAdjacentHTML("beforeend", rowMarkup(kind, index));
    wireSearch(rows().at(-1)!, search, options);
  });
  return {
    kind,
    addButton,
    rows,
    clicks: () => clickCount,
    searchActions: () => ({ ...search }),
  };
}
