// Page function (serialized into the page): reads the extension panel's
// current screen from its open shadow root. Returns fixed UI text only
// (headings, field labels, guidance), never the preview values. Ported from
// the CF-177 live-eval tool.
export function panelState() {
  const host = document.querySelector("career-form-profile-panel");
  if (!host) return { stage: "closed" };
  const root = host.shadowRoot;
  if (!root) return { stage: "unreadable" };
  const all = (selector, from = root) =>
    [].slice.call(from.querySelectorAll(selector));
  const clean = (element, max = 160) =>
    (element?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  const exception = all("header").find(
    (header) => clean(header.querySelector("span")) === "예외",
  );
  if (exception)
    return { stage: "exception", title: clean(exception.querySelector("h2")) };
  // The rest of this alert can carry a raw error message: keep the prefix only.
  if (
    all('[role="alert"]').some((e) =>
      clean(e).startsWith("사이트 정책을 불러오지 못했습니다"),
    )
  )
    return {
      stage: "exception",
      title: "사이트 정책을 불러오지 못했습니다",
      policy: true,
    };
  const headings = all("h2").map((e) => clean(e));
  if (headings.includes("아직 지원하지 않아요"))
    return { stage: "unsupported" };
  if (headings.includes("기입 결과")) {
    const counts = {};
    for (const tab of all(
      '[role="tablist"][aria-label="기입 결과 구분"] [role="tab"]',
    )) {
      const match = /^(확인 필요|입력 완료) ([0-9]+)개$/.exec(
        tab.getAttribute("aria-label") ?? "",
      );
      if (match)
        counts[match[1] === "확인 필요" ? "needsReview" : "completed"] = Number(
          match[2],
        );
    }
    const pending = all('section[aria-label="확인 필요한 항목"] article').map(
      (row) => {
        const category =
          row.closest("section[aria-label]")?.getAttribute("aria-label") ?? "";
        const locate = row.querySelector('button[aria-label$=" 필드로 이동"]');
        return {
          category:
            category && category !== "확인 필요한 항목"
              ? category.slice(0, 60)
              : null,
          label:
            (locate?.getAttribute("aria-label") ?? "")
              .replace(/ 필드로 이동$/, "")
              .slice(0, 80) || null,
          guidance:
            clean(
              [].slice
                .call(row.children)
                .find((child) => child.tagName === "P"),
            ) || null,
          written: all("span", row).some((span) => clean(span) === "입력됨"),
        };
      },
    );
    return { stage: "result", counts, pending };
  }
  const buttons = all("button");
  const write = buttons.find((b) =>
    /^(?:[1-9][0-9]*개 항목 기입하기|선택하지 않고 계속)$/.test(clean(b)),
  );
  if (write) return { stage: "review", writeEnabled: !write.disabled };
  if (buttons.some((b) => clean(b) === "준비하고 계속"))
    return { stage: "preparation-review" };
  return root.querySelector('[role="region"][aria-label="지원서 자동 기입"]')
    ? { stage: "other" }
    : { stage: "profile" };
}

// Node side: terminal panel states the driver must not wait out.
export function panelFailureCode(state) {
  if (state?.stage === "unsupported") return "extension-unsupported";
  if (state?.stage !== "exception") return null;
  if (state.policy) return "policy-unavailable";
  return /진전을 확인할 수 없|분석 한도에 도달/.test(state.title ?? "")
    ? "extension-stalled"
    : "extension-exception";
}
