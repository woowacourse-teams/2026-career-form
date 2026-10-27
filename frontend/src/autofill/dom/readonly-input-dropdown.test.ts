import { afterEach, expect, it } from "vitest";
import { createEmptyProfile } from "../../profile/model";
import type { FieldCandidate } from "../api/types";
import { collectFieldsSnapshotWithDropdowns } from "./collect";
import { labelOf } from "./metadata";
import { buildReviewPlan } from "../review/review-plan";
import { executeApprovedWritesAfterPageSettles } from "../write/executor";
import { observeReadonlySearch } from "../interaction/readonly-search";

const OPTIONS = ["가 항목", "나 항목", "다 항목"];

afterEach(() => {
  document.body.onmousedown = null;
  document.onkeydown = null;
  document.body.replaceChildren();
});

function mountField(inputAttributes: string, extra = "") {
  document.body.innerHTML = `
    <form id="application">
      <section id="section-a">
        <h2>구분 정보</h2>
        <div class="row">
          <label for="target">선택 항목</label>
          <div class="box"><input id="target" type="text" readonly ${inputAttributes} />${extra}</div>
        </div>
      </section>
    </form>
    <div id="portal"></div>`;
  const input = document.getElementById("target") as HTMLInputElement;
  let clicks = 0;
  input.addEventListener("click", () => {
    clicks += 1;
  });
  return { input, clicks: () => clicks };
}

/** Options pick by click, close on outside mousedown or Escape. */
function wireList(
  input: HTMLInputElement,
  list: HTMLElement,
  remove: boolean,
  peers: readonly HTMLElement[] = [list],
) {
  const close = () =>
    peers.forEach((peer) => {
      if (remove) peer.remove();
      else peer.hidden = true;
    });
  list.addEventListener("click", (event) => {
    const option =
      event.target instanceof Element ? event.target.closest("li") : null;
    if (!option) return;
    input.value = option.textContent ?? "";
    close();
  });
  document.body.onmousedown = (event) => {
    if (!list.contains(event.target as Node)) close();
  };
  document.onkeydown = (event) => {
    if (event.key === "Escape") close();
  };
}

function mountAriaListbox() {
  const field = mountField(
    'role="combobox" aria-haspopup="listbox" aria-controls="target-options" aria-expanded="false"',
  );
  const list = document.createElement("ul");
  list.id = "target-options";
  list.setAttribute("role", "listbox");
  list.hidden = true;
  list.innerHTML = OPTIONS.map((text) => `<li role="option">${text}</li>`).join(
    "",
  );
  document.getElementById("portal")!.append(list);
  field.input.addEventListener("click", () => {
    list.hidden = !list.hidden;
  });
  wireList(field.input, list, false);
  return { ...field, list };
}

/** No ARIA at all: a plain list is mounted into a portal only when clicked. */
function mountDeferredList(count = 1) {
  const field = mountField("");
  const mounted: HTMLElement[] = [];
  field.input.addEventListener("click", () => {
    if (mounted.some((list) => list.isConnected)) return;
    for (let index = 0; index < count; index += 1) {
      const list = document.createElement("ul");
      list.innerHTML = OPTIONS.map((text) => `<li>${text}</li>`).join("");
      document.getElementById("portal")!.append(list);
      mounted.push(list);
      wireList(field.input, list, true, mounted);
    }
  });
  return { ...field, mounted };
}

function fields(snapshot: {
  request: { sections: { fields: FieldCandidate[] }[] };
}) {
  return snapshot.request.sections.flatMap((section) => section.fields);
}

async function writeOption(value: string) {
  const snapshot = await collectFieldsSnapshotWithDropdowns(document);
  const field = fields(snapshot).find(
    (candidate) => candidate.control === "select",
  );
  if (!field) throw new Error("readonly dropdown was not collected");
  const profile = createEmptyProfile();
  profile.personal.koreanGivenName = value;
  const items = buildReviewPlan({
    profile,
    registry: snapshot.registry,
    analysis: {
      snapshotId: snapshot.request.snapshotId,
      mode: "GENERIC",
      analysisStatus: "COMPLETE",
      fields: [
        {
          candidateId: field.candidateId,
          matchType: "MATCH",
          mappingStatus: "LLM_SUGGESTED",
          interactionStatus: "READY",
          autofillPolicy: "ALLOWED",
          valueBinding: {
            type: "DIRECT",
            profileFieldKey: "personal.personal.koreanGivenName",
          },
          writePlan: { command: "SELECT_OPTION" },
        },
      ],
    },
  }).items;
  expect(items[0]).not.toMatchObject({ status: "unavailable" });
  return executeApprovedWritesAfterPageSettles({
    items,
    registry: snapshot.registry,
    document,
    approvedCandidateIds: new Set([field.candidateId]),
  });
}

it("collects an ARIA readonly combobox as a custom select with its options", async () => {
  const { list } = mountAriaListbox();

  const snapshot = await collectFieldsSnapshotWithDropdowns(document);

  const field = fields(snapshot).find(
    (candidate) => candidate.domId === "target",
  );
  expect(field).toMatchObject({ element: "custom", control: "select" });
  expect(field?.readonly).toBeUndefined();
  expect(field?.options?.map((option) => option.displayName)).toEqual(OPTIONS);
  expect(field?.displayName).toBe("선택 항목");
  expect(list.hidden).toBe(true);
});

it("selects the exact option of an ARIA readonly combobox through the dropdown executor", async () => {
  const { input, list } = mountAriaListbox();

  const results = await writeOption("나 항목");

  expect(results[0]).toMatchObject({ status: "written" });
  expect(input.value).toBe("나 항목");
  expect(list.hidden).toBe(true);
});

it("collects and writes a readonly input whose plain list is mounted on click", async () => {
  const { input, mounted } = mountDeferredList();

  const snapshot = await collectFieldsSnapshotWithDropdowns(document);
  const field = fields(snapshot).find(
    (candidate) => candidate.domId === "target",
  );
  expect(field).toMatchObject({ element: "custom", control: "select" });
  expect(field?.options?.map((option) => option.displayName)).toEqual(OPTIONS);
  expect(mounted.every((list) => !list.isConnected)).toBe(true);

  const results = await writeOption("다 항목");

  expect(results[0]).toMatchObject({ status: "written" });
  expect(input.value).toBe("다 항목");
  expect(mounted.every((list) => !list.isConnected)).toBe(true);
});

it("closes a probed list that only a second click on its own input closes", async () => {
  // Like some UI kits: the input toggles its list, Escape and outside
  // mousedown are ignored, and an open list marks the rest of the page inert.
  const { input } = mountField("");
  const list = document.createElement("ul");
  list.innerHTML = OPTIONS.map((text) => `<li>${text}</li>`).join("");
  list.hidden = true;
  document.getElementById("portal")!.append(list);
  const form = document.getElementById("application")!;
  input.addEventListener("click", () => {
    list.hidden = !list.hidden;
    form.inert = !list.hidden;
  });

  const snapshot = await collectFieldsSnapshotWithDropdowns(document);

  expect(list.hidden).toBe(true);
  expect(form.inert).toBe(false);
  expect(
    fields(snapshot).find((candidate) => candidate.domId === "target"),
  ).toMatchObject({ element: "custom", control: "select" });
});

it("keeps a readonly input as text when one click opens two new lists", async () => {
  const { input, mounted } = mountDeferredList(2);

  const snapshot = await collectFieldsSnapshotWithDropdowns(document);

  const field = fields(snapshot).find(
    (candidate) => candidate.domId === "target",
  );
  expect(field).toMatchObject({
    element: "input",
    control: "text",
    readonly: true,
  });
  expect(field?.options).toBeUndefined();
  expect(mounted.every((list) => !list.isConnected)).toBe(true);
  expect(input.value).toBe("");
  const lookup = snapshot.registry.lookupField(field!.candidateId);
  if (lookup.status !== "blocked") throw new Error("expected readonly lookup");
  expect(observeReadonlySearch(lookup.handle)).toMatchObject({
    status: "unsupported",
    reason: "search_opener_not_found",
  });
});

it("keeps a readonly input as text when its click opens no surface", async () => {
  const { clicks } = mountField("");

  const snapshot = await collectFieldsSnapshotWithDropdowns(document);

  const field = fields(snapshot).find(
    (candidate) => candidate.domId === "target",
  );
  expect(clicks()).toBe(1);
  expect(field).toMatchObject({
    element: "input",
    control: "text",
    readonly: true,
  });
  const lookup = snapshot.registry.lookupField(field!.candidateId);
  if (lookup.status !== "blocked") throw new Error("expected readonly lookup");
  expect(observeReadonlySearch(lookup.handle).status).toBe("unsupported");
});

it("closes an unrecognized layer its probe mounted and keeps the input as text", async () => {
  const { input } = mountField("");
  input.addEventListener("click", () => {
    const layer = document.createElement("div");
    layer.className = "layer";
    layer.textContent = "안내";
    document.getElementById("portal")!.append(layer);
    document.onkeydown = (event) => {
      if (event.key === "Escape") layer.remove();
    };
  });

  const snapshot = await collectFieldsSnapshotWithDropdowns(document);

  expect(document.querySelector(".layer")).toBeNull();
  expect(
    fields(snapshot).find((candidate) => candidate.domId === "target"),
  ).toMatchObject({ element: "input", control: "text", readonly: true });
});

it("never clicks a readonly input inside a link or a group with another opener", async () => {
  document.body.innerHTML = `
    <form id="application"><section>
      <div class="row"><label for="linked">링크 칸</label>
        <a href="/elsewhere"><input id="linked" type="text" readonly /></a></div>
      <div class="row"><label for="grouped">버튼 칸</label>
        <div><input id="grouped" type="text" readonly /><button type="button">열기</button></div></div>
      <div class="row"><input id="submit" type="submit" readonly value="보내기" /></div>
    </section></form>`;
  let clicks = 0;
  document.querySelectorAll("input").forEach((input) =>
    input.addEventListener("click", (event) => {
      event.preventDefault();
      clicks += 1;
    }),
  );

  const snapshot = await collectFieldsSnapshotWithDropdowns(document);

  expect(clicks).toBe(0);
  expect(
    fields(snapshot).filter((field) => field.control === "select"),
  ).toHaveLength(0);
});

it("hands a readonly input that opens a search dialog to the readonly search path", async () => {
  const { input } = mountField("");
  input.addEventListener("click", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-label", "항목 검색");
    dialog.innerHTML =
      '<input type="text" aria-label="검색어" /><button type="button">검색</button><ul></ul>';
    document.getElementById("portal")!.append(dialog);
    document.onkeydown = (event) => {
      if (event.key === "Escape") dialog.remove();
    };
  });

  const snapshot = await collectFieldsSnapshotWithDropdowns(document);

  const field = fields(snapshot).find(
    (candidate) => candidate.domId === "target",
  );
  expect(field).toMatchObject({
    element: "input",
    control: "text",
    readonly: true,
  });
  expect(document.querySelector("[role='dialog']")).toBeNull();
  const lookup = snapshot.registry.lookupField(field!.candidateId);
  if (lookup.status !== "blocked") throw new Error("expected readonly lookup");
  const eligibility = observeReadonlySearch(lookup.handle);
  expect(eligibility.status).toBe("eligible");
  if (eligibility.status === "eligible")
    expect(eligibility.identity.selfOpener).toBe(true);
});

it("does not use a readonly input's current display value as its field label", () => {
  document.body.innerHTML = `
    <div><label for="shown">현재 선택값</label>
      <input id="shown" type="text" readonly value="현재 선택값" placeholder="구분" /></div>`;

  expect(labelOf(document.getElementById("shown")!, true)).toBe("구분");
});
