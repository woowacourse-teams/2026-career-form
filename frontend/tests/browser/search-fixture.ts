import { collectFieldsSnapshot } from "../../src/autofill/dom/collect";
import { executeReadonlySearch } from "../../src/autofill/interaction/readonly-search-executor";

export function createSearchFixture(existing = "") {
  const container = document.createElement("section");
  const row = document.createElement("div");
  row.setAttribute("data-repeater-item", "");
  const label = document.createElement("label");
  label.textContent = "전공";
  const target = document.createElement("input");
  target.type = "text";
  target.readOnly = true;
  target.setAttribute("aria-label", "전공");
  target.value = existing;
  label.append(target);
  const opener = document.createElement("button");
  opener.type = "button";
  opener.textContent = "전공 검색";
  opener.setAttribute("aria-controls", "native-search-surface");
  row.append(label, opener);
  const surface = document.createElement("div");
  surface.id = "native-search-surface";
  surface.setAttribute("role", "dialog");
  surface.setAttribute("aria-modal", "true");
  surface.hidden = true;
  const frame = document.createElement("iframe");
  frame.title = "전공 검색";
  surface.append(frame);
  container.append(row, surface);
  document.body.append(container);
  const controller = new AbortController();
  const actions = { opener: 0, search: 0, result: 0, actionChanged: 0 };
  opener.addEventListener(
    "click",
    () => {
      actions.opener++;
      surface.hidden = false;
    },
    { signal: controller.signal },
  );
  frame.addEventListener("fixture-submit", () => actions.search++, {
    signal: controller.signal,
  });
  frame.addEventListener(
    "fixture-action-changed",
    () => actions.actionChanged++,
    { signal: controller.signal },
  );
  frame.addEventListener(
    "fixture-select",
    () => {
      actions.result++;
      target.value = "가상값";
      surface.remove();
    },
    { signal: controller.signal },
  );

  function nextLoad(): Promise<Document> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        frame.removeEventListener("load", loaded);
        controller.signal.removeEventListener("abort", aborted);
      };
      const loaded = () => {
        cleanup();
        const document = frame.contentDocument;
        if (document) resolve(document);
        else reject(new Error("The synthetic search frame is inaccessible"));
      };
      const aborted = () => {
        cleanup();
        reject(new Error("The synthetic search fixture was disposed"));
      };
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("The synthetic search frame did not load"));
      }, 4_000);
      frame.addEventListener("load", loaded, { once: true });
      controller.signal.addEventListener("abort", aborted, { once: true });
    });
  }

  return {
    target,
    frame,
    surface,
    actions,
    nextLoad,
    async load(path = "/__cf178/search/form") {
      const loaded = nextLoad();
      frame.src = path;
      return loaded;
    },
    run() {
      const snapshot = collectFieldsSnapshot(document);
      const fields = snapshot.request.sections.flatMap((section) => [
        ...section.fields,
        ...(section.items?.flatMap((item) => item.fields) ?? []),
      ]);
      const candidate = fields.find((field) => {
        const lookup = snapshot.registry.lookupField(field.candidateId);
        return (
          lookup.status === "blocked" && lookup.handle.elements[0] === target
        );
      });
      if (!candidate)
        throw new Error("The readonly candidate was not collected");
      return executeReadonlySearch({
        document,
        registry: snapshot.registry,
        targetCandidateId: candidate.candidateId,
        canonicalFieldKey: "education.university.majorName",
        expectedValue: "가상값",
        expectedCurrentValue: existing,
        signal: controller.signal,
      });
    },
    dispose() {
      controller.abort();
      container.remove();
    },
  };
}
