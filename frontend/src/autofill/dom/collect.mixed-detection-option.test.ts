import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { collectFieldsSnapshot, collectPreparationSnapshot } from "./collect";

afterEach(() => document.body.replaceChildren());

const KIND_OPTIONS =
  '<option value="">구분</option><option value="01">고등학교</option><option value="03">대학교</option>';
const MIXED_FORM = `<section><h3>학력</h3><div id="list">${[0, 1]
  .map(
    () =>
      `<div class="r"><select name="eduKind">${KIND_OPTIONS}</select><input name="schoolName" type="text"></div>`,
  )
  .join("")}</div><button type="button">학력 추가</button></section>`;

function fixtureHtml(name: string): string {
  return readFileSync(
    join(process.cwd(), "fixtures/dom-snapshots", name, "sanitized.html"),
    "utf8",
  );
}

/** Everything the collectors hand out, minus the random snapshot id. */
function digest(value: unknown): string {
  const text = JSON.stringify(value, (key, item) =>
    key === "snapshotId" ? "snapshot" : item,
  );
  return createHash("sha256").update(text).digest("hex");
}

function mixedRowCount(
  options?: Parameters<typeof collectFieldsSnapshot>[2],
): number {
  const snapshot = collectFieldsSnapshot(document, undefined, options);
  const candidateIds = new Set(
    snapshot.request.sections.flatMap((section) => [
      ...section.fields.map((field) => field.candidateId),
      ...(section.items ?? []).flatMap((item) =>
        item.fields.map((field) => field.candidateId),
      ),
    ]),
  );
  return [...candidateIds].filter((candidateId) => {
    const lookup = snapshot.registry.lookupField(candidateId);
    return "handle" in lookup && lookup.handle.mixedSectionRow;
  }).length;
}

// Digests of the default-argument collection output, recorded before the
// opt-in `mixedSectionDetection` argument existed.
const BASELINE: Record<string, { fields: string; preparation: string }> = {
  "lg-ai-research-birth-split-email": {
    fields: "1663b5c4caed514eb1289b6fd20f7c813611e48bba422ccf3b1a87a016693e1c",
    preparation:
      "3023a0ebb4428cc9b7fcce3dc9401eb4c83e5d7ee5430d0421e535639f409f71",
  },
  "sk-careers-application-form": {
    fields: "786e4c950f8955974e93d1fe03bf166d9c4a716214c66b714db71a39f4b67efe",
    preparation:
      "d055060eb865da8290bc4be8018934bce9a130e894a1b72b749223f299145485",
  },
};

describe("mixedSectionDetection collection option", () => {
  it("keeps the default collection of the mixed education form detecting mixed rows", () => {
    document.body.innerHTML = MIXED_FORM;
    expect(mixedRowCount()).toBe(4);
    expect(mixedRowCount({})).toBe(4);
    expect(mixedRowCount({ mixedSectionDetection: true })).toBe(4);
  });

  it("skips mixed section detection in field collection only when asked", () => {
    document.body.innerHTML = MIXED_FORM;
    expect(mixedRowCount({ mixedSectionDetection: false })).toBe(0);
    const on = collectFieldsSnapshot(document);
    const off = collectFieldsSnapshot(document, undefined, {
      mixedSectionDetection: false,
    });
    expect(digest(off.request)).toBe(digest(on.request));
  });

  it("skips mixed section detection in preparation collection only when asked", () => {
    document.body.innerHTML = MIXED_FORM;
    const actionId = (snapshot: ReturnType<typeof collectPreparationSnapshot>) =>
      snapshot.request.sections.flatMap((section) => section.actionCandidates)[0]!
        .candidateId;
    const on = collectPreparationSnapshot(document);
    expect(on.mixedSectionGroup?.(actionId(on))).toBeDefined();
    const explicit = collectPreparationSnapshot(document, {
      mixedSectionDetection: true,
    });
    expect(explicit.mixedSectionGroup?.(actionId(explicit))).toBeDefined();
    const off = collectPreparationSnapshot(document, {
      mixedSectionDetection: false,
    });
    expect(off.mixedSectionGroup?.(actionId(off))).toBeUndefined();
    expect(digest(off.request)).toBe(digest(on.request));
  });

  it.each(Object.keys(BASELINE))(
    "collects %s exactly as before when the argument is omitted",
    (name) => {
      document.body.innerHTML = fixtureHtml(name);
      const expected = BASELINE[name]!;
      expect(digest(collectFieldsSnapshot(document).request)).toBe(
        expected.fields,
      );
      expect(digest(collectPreparationSnapshot(document).request)).toBe(
        expected.preparation,
      );
      expect(
        digest(
          collectFieldsSnapshot(document, undefined, {
            mixedSectionDetection: true,
          }).request,
        ),
      ).toBe(expected.fields);
      expect(
        digest(
          collectPreparationSnapshot(document, { mixedSectionDetection: true })
            .request,
        ),
      ).toBe(expected.preparation);
    },
    120_000,
  );
});
