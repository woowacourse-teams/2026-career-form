import { afterEach, expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import { getWorkflowAdapter } from "../adapters/workflow";
import { collectPreparationSnapshot } from "../dom/collect";
import type { ActionCandidateHandle } from "../dom/types";
import { createPreparationOptions } from "./preparation-options";

afterEach(() => document.body.replaceChildren());
it.each([
  [1, 2, true],
  [2, 3, true],
  [2, 2, false],
  [1, 3, false],
  [0, 1, false],
])(
  "records an adapter-verified fresh control only after one supported row addition %s→%s",
  (before, after, expected) => {
    document.body.innerHTML =
      '<button type="button">항목 추가</button><button type="button">주전공</button>';
    const profile = createEmptyProfile();
    const fresh = document.querySelectorAll("button")[1]!;
    const freshDefaultControls = { current: new WeakSet<Element>() };
    const options = createPreparationOptions({
      adapter: { ...getWorkflowAdapter(""), freshDefaultAfterAdd: () => fresh },
      pageDocument: document,
      profile,
      repository: { load: async () => profile },
      freshDefaultControls,
      writeController: { current: new AbortController() },
      mounted: { current: true },
      recordOperation: () => {},
    })(collectPreparationSnapshot(document));
    options.onVerifiedAddition?.(
      { element: document.querySelector("button")! } as ActionCandidateHandle,
      before,
      after,
    );
    expect(freshDefaultControls.current.has(fresh)).toBe(expected);
    expect(
      freshDefaultControls.current.has(document.querySelector("button")!),
    ).toBe(false);
  },
);
