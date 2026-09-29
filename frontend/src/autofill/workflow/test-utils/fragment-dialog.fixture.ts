/**
 * De-identified same-document dialog search whose result is a fragment link
 * (`<a href="#…" onclick>`). The dialog is an existing surface kind with
 * explicit result signals (`data-search-query`, `data-search-complete`,
 * `data-result-count`), so readiness and completeness pass on the unfixed code
 * and the tests isolate fragment activation and the URL guard.
 *
 * The inline `onclick` attribute is a no-op marker (`return true;`); the
 * selection side effect is a regular listener. The dialog is hidden rather
 * than removed so the still-connected link performs jsdom's fragment
 * navigation, which lands in a later task.
 */
export interface FragmentDialogFixtureOptions {
  readonly value?: string;
  readonly href?: string;
  /** Prevent the default fragment navigation from the listener. */
  readonly preventDefault?: boolean;
  /** Runs inside the result click listener after the value is reflected. */
  readonly onSelect?: () => void;
}

export interface FragmentDialogFixture {
  readonly target: HTMLInputElement;
  readonly opener: HTMLButtonElement;
  readonly clicks: { opener: number; search: number; result: number };
  resultLink(): HTMLAnchorElement | undefined;
}

export function createFragmentDialogFixture(
  options: FragmentDialogFixtureOptions = {},
): FragmentDialogFixture {
  const value = options.value ?? "<고등학교명>";
  const href = options.href ?? "#n";
  document.body.innerHTML = `
    <div data-repeater-item><label>학교명
      <input id="target" type="text" readonly aria-label="학교명"></label>
      <button id="opener" type="button">학교 검색</button>
    </div>`;
  const target = document.querySelector<HTMLInputElement>("#target")!;
  const opener = document.querySelector<HTMLButtonElement>("#opener")!;
  const clicks = { opener: 0, search: 0, result: 0 };
  let link: HTMLAnchorElement | undefined;
  opener.addEventListener("click", () => {
    clicks.opener++;
    const surface = document.createElement("div");
    surface.setAttribute("role", "dialog");
    surface.setAttribute("aria-modal", "true");
    surface.id = "fragment-search-surface";
    opener.setAttribute("aria-controls", surface.id);
    surface.innerHTML = `
      <h2>학교 검색</h2>
      <label>학교 검색어 <input id="query" type="text"></label>
      <button id="submit" type="button">검색</button>
      <ul aria-label="검색 결과" data-search-complete="true"></ul>`;
    document.body.append(surface);
    const query = surface.querySelector<HTMLInputElement>("#query")!;
    surface
      .querySelector<HTMLButtonElement>("#submit")!
      .addEventListener("click", () => {
        clicks.search++;
        const results = surface.querySelector("ul")!;
        results.setAttribute("data-search-query", query.value);
        results.setAttribute("data-result-count", "1");
        const item = document.createElement("li");
        const anchor = document.createElement("a");
        anchor.setAttribute("href", href);
        anchor.setAttribute("onclick", "return true;");
        anchor.textContent = value;
        anchor.addEventListener("click", (event) => {
          clicks.result++;
          if (options.preventDefault) event.preventDefault();
          target.value = value;
          surface.hidden = true;
          options.onSelect?.();
        });
        item.append(anchor);
        results.replaceChildren(item);
        link = anchor;
      });
  });
  return { target, opener, clicks, resultLink: () => link };
}
