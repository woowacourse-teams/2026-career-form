// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  census,
  discardResidue,
  fingerprint,
  fingerprintMap,
  stripFingerprints,
  syntheticFingerprints,
  valueFingerprints,
} from "./census.mjs";
import { watchMounts } from "./mounts.mjs";

const SALT = "test-salt";
const pass = (prior, extra = {}) =>
  census(prior, { ignoreLayout: true, salt: SALT, ...extra });
// What runPage does: watch mounts, take the pre-run value set (hidden
// controls included), then a visible pass as the change baseline.
const baseline = () => {
  if (!window.__careerFormLiveQaMounts) watchMounts();
  const initial = pass(null, { includeHidden: true });
  const before = pass(null);
  return { known: valueFingerprints([initial]), prior: fingerprintMap(before) };
};

const html = `
<form id="frm">
  <section class="writeResume" data-code="11"><h3>지원자</h3>
    <label for="nm">성명</label><input id="nm" name="name" value="실제이름">
    <input type="hidden" name="resumeSn" value="77">
    <input type="password" name="pw" value="secret">
    <label><input type="radio" name="gender" value="M" checked>남</label>
    <label><input type="radio" name="gender" value="F">여</label>
    <select name="nationality"><option value="">선택</option><option value="KR">대한민국</option></select>
    <input name="ghost" style="display:none" value="x">
    <input type="file" name="photo">
  </section>
  <div class="select-wrap"><input type="hidden" class="js-field" name="schGb" value="">
    <input type="button" class="btn-select" id="schGb_1" value="선택하세요.">
    <label class="field-title">학력선택</label>
    <div class="select-option"><button>고등학교</button><button>대학교(4년)</button></div>
  </div>
  <div id="detail" style="display:none"><label for="br">군별</label><input id="br" name="branch" value="실제군별"></div>
</form>
<career-form-profile-panel><input name="ours" value="x"></career-form-profile-panel>`;

const names = (result) => result.controls.map((c) => c.name);

afterEach(() => window.__careerFormLiveQaMounts?.disconnect());

describe("census", () => {
  beforeEach(() => {
    document.body.innerHTML = html;
  });

  it("lists visible controls and skips hidden inputs, invisible and extension ones", () => {
    const result = pass(null);
    expect(names(result)).toEqual([
      "name",
      "pw",
      "gender",
      "nationality",
      "photo",
      "schGb",
    ]);
    expect(result.controls.map((c) => c.i)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("lists invisible controls too when asked, flagged hidden", () => {
    const hidden = pass(null, { includeHidden: true }).controls.filter(
      (c) => c.hidden,
    );
    expect(hidden.map((c) => c.name)).toEqual(["ghost", "branch"]);
  });

  it("never returns values on a first pass", () => {
    const text = JSON.stringify(pass(null, { includeHidden: true }));
    for (const secret of ["실제이름", "secret", "실제군별"])
      expect(text).not.toContain(secret);
    const name = pass(null).controls[0];
    expect(name).toMatchObject({
      label: "성명",
      hasValue: true,
      section: "지원자",
    });
    expect(name.shown).toBeUndefined();
  });

  it("salts fingerprints so the same value hashes differently per run", () => {
    const a = census(null, { ignoreLayout: true, salt: "a" }).controls[0].fp;
    const b = census(null, { ignoreLayout: true, salt: "b" }).controls[0].fp;
    expect(a).not.toBe(b);
  });

  it("groups radios with their option labels and reads select and button-select options", () => {
    const { controls } = pass(null);
    expect(controls[2]).toMatchObject({
      type: "radio-group",
      options: ["남", "여"],
    });
    expect(controls[3].selectOptions).toEqual(["선택", "대한민국"]);
    expect(controls[5]).toMatchObject({
      type: "button-select",
      label: "학력선택",
      hasValue: false,
      selectOptions: ["고등학교", "대학교(4년)"],
    });
  });

  it("shows only values the run wrote", () => {
    const { known, prior } = baseline();
    document.querySelector('select[name="nationality"]').value = "KR";
    document.querySelector('input[name="schGb"]').value = "3";
    document.querySelector("#schGb_1").value = "대학교(4년)";
    const after = pass(prior, { known });
    const byName = Object.fromEntries(after.controls.map((c) => [c.name, c]));
    expect(byName.nationality).toMatchObject({
      changed: true,
      shown: "KR|대한민국",
    });
    expect(byName.schGb).toMatchObject({
      changed: true,
      shown: "3|대학교(4년)",
    });
    expect(byName.name).toMatchObject({ changed: false, preexisting: true });
    expect(byName.name.shown).toBeUndefined();
    expect(JSON.stringify(after)).not.toContain("실제이름");
  });

  it("never shows a pre-run value that becomes visible during the run", () => {
    const { known, prior } = baseline();
    document.getElementById("detail").style.display = "";
    const branch = pass(prior, { known }).controls.find(
      (c) => c.name === "branch",
    );
    expect(branch).toMatchObject({ added: true, preexisting: true });
    expect(branch.shown).toBeUndefined();
  });

  it("never shows a pre-run value whose control was re-mounted under a new key", () => {
    const { known, prior } = baseline();
    const input = document.getElementById("nm");
    input.removeAttribute("id");
    input.name = "basicInformation.name";
    const moved = pass(prior, { known }).controls.find(
      (c) => c.name === "basicInformation.name",
    );
    expect(moved).toMatchObject({ added: true, preexisting: true });
    expect(moved.shown).toBeUndefined();
  });

  it("never shows a pre-run value when a hidden control takes over a cleared control's key", () => {
    document.body.innerHTML = `
      <section><h3>학력</h3>
        <div id="a" style="display:none"><label>학교명<input name="school" value="실제고교"></label></div>
        <div id="b"><label>학교명<input name="school" value="실제대학"></label></div>
      </section>`;
    const known = valueFingerprints([pass(null, { includeHidden: true })]);
    document.querySelector("#b input").value = "";
    const prior = fingerprintMap(pass(null));
    document.getElementById("a").style.display = "";
    document.getElementById("b").style.display = "none";
    const text = JSON.stringify(pass(prior, { known }));
    expect(text).not.toContain("실제고교");
    expect(text).not.toContain("실제대학");
  });

  it("never shows a pre-run value the site re-renders into a cleared control", () => {
    const { known } = baseline();
    document.getElementById("nm").value = "";
    const prior = fingerprintMap(pass(null));
    document.getElementById("nm").value = "실제이름";
    const name = pass(prior, { known }).controls.find((c) => c.name === "name");
    expect(name).toMatchObject({ changed: true, preexisting: true });
    expect(name.shown).toBeUndefined();
  });

  it("shows a pre-run value only when it is a synthetic profile value", () => {
    document.getElementById("nm").value = "테스트지원자";
    const { known } = baseline();
    document.getElementById("nm").value = "";
    const prior = fingerprintMap(pass(null));
    document.getElementById("nm").value = "테스트지원자";
    const synthetic = [fingerprint(SALT, "테스트지원자")];
    const name = pass(prior, { known, synthetic }).controls.find(
      (c) => c.name === "name",
    );
    expect(name).toMatchObject({ preexisting: true, shown: "테스트지원자" });
  });

  it("never shows a pre-run value the run left alone, even when it matches the synthetic profile", () => {
    document.body.innerHTML = `
      <div><span id="g">성별</span><div role="radiogroup" aria-labelledby="g">
        <button type="button" role="radio" aria-checked="true">남성</button>
        <button type="button" role="radio" aria-checked="false">여성</button></div></div>
      <label>병역<select name="army"><option value="">선택</option>
        <option value="Y9" selected>있음</option><option value="Y">있음</option></select></label>`;
    const { known, prior } = baseline();
    const synthetic = ["남성", "있음", "Y|있음"].map((v) =>
      fingerprint(SALT, v),
    );
    const controls = pass(prior, { known, synthetic }).controls;
    expect(controls.map((c) => [c.preexisting, c.shown])).toEqual([
      [true, undefined],
      [true, undefined],
    ]);
  });

  it("never shows a pre-run value the site puts back whose text only matches the synthetic profile", () => {
    document.body.innerHTML = `<label>병역<select name="army"><option value="">선택</option>
      <option value="Y9" selected>있음</option><option value="Y">있음</option></select></label>`;
    const known =
      (watchMounts(), valueFingerprints([pass(null, { includeHidden: true })]));
    const select = document.querySelector("select");
    select.value = "";
    const prior = fingerprintMap(pass(null));
    select.value = "Y9";
    const synthetic = ["있음", "Y|있음"].map((v) => fingerprint(SALT, v));
    const [army] = pass(prior, { known, synthetic }).controls;
    expect(army).toMatchObject({ changed: true, preexisting: true });
    expect(army.shown).toBeUndefined();
  });

  it("shows nothing in a document the run is not watching (a new page after a redirect)", () => {
    const known = valueFingerprints([pass(null, { includeHidden: true })]);
    const prior = fingerprintMap(pass(null));
    document.querySelector('select[name="nationality"]').value = "KR";
    const result = pass(prior, { known });
    expect(result.controls.some((c) => c.shown !== undefined)).toBe(false);
  });

  it("never shows text a contenteditable or listbox was mounted with", () => {
    const { known, prior } = baseline();
    const extra = document.createElement("div");
    extra.innerHTML = `<div contenteditable="true" aria-label="자기소개">실제 소개</div>
      <div role="listbox" aria-label="언어">실제 언어</div>`;
    document.querySelector("section").append(extra);
    window.__careerFormLiveQaMounts.flush();
    const text = JSON.stringify(pass(prior, { known }));
    expect(text).not.toContain("실제 소개");
    expect(text).not.toContain("실제 언어");
  });

  it("never shows a value a control was mounted with during the run, until the run changes it", () => {
    const { known, prior } = baseline();
    const stop = watchMounts();
    const row = document.createElement("div");
    row.innerHTML = `<label>회사명<input name="career[1].company" value="실제회사"></label>`;
    document.querySelector("section").append(row);
    stop.flush();
    const mounted = () =>
      pass(prior, { known }).controls.find(
        (c) => c.name === "career[1].company",
      );
    expect(mounted()).toMatchObject({ added: true });
    expect(mounted().shown).toBeUndefined();
    row.querySelector("input").value = "가상회사";
    expect(mounted().shown).toBe("가상회사");
    stop.disconnect();
  });

  it("shows a value that was not on the page before the run even if it did not change", () => {
    document.body.innerHTML = `<label><input type="radio" name="p" value="false">비대상</label>
      <label><input type="radio" name="p" value="true">대상</label>`;
    const { known } = baseline();
    document.querySelector('[value="false"]').checked = true;
    const prior = fingerprintMap(pass(null));
    const [group] = pass(prior, { known }).controls;
    expect(group).toMatchObject({ changed: false, shown: "비대상 [v=false]" });
  });

  it("shows nothing at all without the pre-run value set", () => {
    const prior = fingerprintMap(pass(null));
    document.querySelector('select[name="nationality"]').value = "KR";
    expect(pass(prior).controls.some((c) => c.shown !== undefined)).toBe(false);
  });

  it("marks controls that did not exist before as added and shows the run's value", () => {
    const { known, prior } = baseline();
    const extra = document.createElement("input");
    extra.name = "career[1].company";
    extra.value = "가상회사";
    document.querySelector("section").append(extra);
    const added = pass(prior, { known }).controls.find(
      (c) => c.name === "career[1].company",
    );
    expect(added).toMatchObject({
      added: true,
      changed: true,
      shown: "가상회사",
    });
  });

  it("reads Greeting toggle groups (role=radiogroup without native radios)", () => {
    document.body.innerHTML = `
      <div><span id="lb">장애여부</span>
        <div role="radiogroup" aria-labelledby="lb">
          <button type="button" role="radio" aria-checked="false">비대상</button>
          <button type="button" role="radio" aria-checked="true">대상</button>
        </div></div>`;
    const [group] = pass(null).controls;
    expect(group).toMatchObject({
      type: "radio-group",
      label: "장애여부",
      options: ["비대상", "대상"],
      hasValue: true,
    });
  });

  it("does not count a dropdown placeholder as a value", () => {
    document.body.innerHTML = `
      <label id="g">성별</label>
      <button type="button" role="combobox" aria-labelledby="g" data-placeholder-shown><span>선택</span></button>
      <button type="button" role="combobox" aria-label="학위"><span>학사</span></button>`;
    const [gender, degree] = pass(null).controls;
    expect(gender.hasValue).toBe(false);
    expect(degree.hasValue).toBe(true);
  });

  it("reads placeholder states the way Greeting widgets mark them", () => {
    document.body.innerHTML = `
      <button type="button" role="combobox" aria-label="a" data-placeholder>값처럼 보임</button>
      <button type="button" role="combobox" aria-label="b" data-placeholder-shown="false"><span>학사</span></button>
      <button type="button" role="combobox" aria-label="c"><span>선택해 주세요</span></button>`;
    expect(pass(null).controls.map((c) => c.hasValue)).toEqual([
      false,
      true,
      false,
    ]);
  });

  it("takes the caption of its own cell, not a sibling field's", () => {
    document.body.innerHTML = `
      <table><tr><th>A</th><td><input name="a"></td><th>B</th><td><select name="b"><option>선택</option></select></td></tr></table>
      <div><label for="other">다른 칸</label><input id="other" name="o"><span class="label">주소</span><input name="addr"></div>`;
    const byName = Object.fromEntries(
      pass(null).controls.map((c) => [c.name, c.label]),
    );
    expect(byName.a).toBe("near:A");
    expect(byName.b).toBe("near:B");
    expect(byName.addr).toBe("near:주소");
  });

  it("labels selects by title or a non-empty nearby caption", () => {
    document.body.innerHTML = `
      <div class="form-item"><div class="select-label">지원 직무</div>
        <div class="selectric"><strong class="blind"></strong><select name="role"><option>선택</option></select></div></div>
      <select name="t" title="장애구분"><option>선택</option></select>`;
    const [role, titled] = pass(null).controls;
    expect(role.label).toBe("near:지원 직무");
    expect(titled.label).toBe("장애구분");
  });

  it("does not use Map or Set, which some sites replace", () => {
    // Hyundai's page scripts replace Map/Set; page functions must not need them.
    expect(census.toString()).not.toMatch(/\b(Map|Set)\b/);
  });
});

describe("stripFingerprints", () => {
  it("removes fp and key before anything is written to disk", () => {
    const frames = [
      {
        frame: "f",
        controls: [{ i: 0, name: "a", fp: "x", key: "k", hasValue: true }],
      },
    ];
    expect(stripFingerprints(frames)).toEqual([
      { frame: "f", controls: [{ i: 0, name: "a", hasValue: true }] },
    ]);
    expect(frames[0].controls[0].fp).toBe("x");
  });
});

describe("discardResidue", () => {
  const frames = (...fps) => [
    {
      key: "main",
      main: true,
      frame: "https://x.example/form",
      controls: fps.map((fp, n) => ({
        key: `k${n}`,
        type: "text",
        fp,
        hasValue: Boolean(fp),
      })),
    },
  ];
  it("passes when every control holds its pre-run value after the discard", () => {
    expect(discardResidue(frames("a", "b", ""), frames("a", "b", ""))).toEqual({
      verified: true,
      unexpected: 0,
      rekeyed: 0,
      before: 2,
      after: 2,
      formLost: false,
      sameUrl: true,
      sameStep: true,
      controls: { before: 3, after: 3 },
    });
  });
  it("matches a control the reload re-keyed by value, but not a new value", () => {
    const rekey = (list, n, key) => {
      list[0].controls[n].key = key;
      return list;
    };
    expect(
      discardResidue(
        frames("a", "b"),
        rekey(frames("a", "b"), 1, "tmpl-guid2"),
      ),
    ).toMatchObject({ verified: true, unexpected: 0, rekeyed: 1 });
    expect(
      discardResidue(
        frames("a", "b"),
        rekey(frames("a", "SYNTH"), 1, "tmpl-guid2"),
      ),
    ).toMatchObject({ verified: false, unexpected: 1, rekeyed: 0 });
    // A re-keyed control cannot reuse a value a stable key already holds.
    expect(
      discardResidue(frames("a", ""), rekey(frames("a", "a"), 1, "tmpl-guid2")),
    ).toMatchObject({ verified: false, unexpected: 1 });
  });
  it("fails when a run value replaced a pre-run value, even if the count matches", () => {
    expect(
      discardResidue(frames("a", "b"), frames("a", "SYNTH")),
    ).toMatchObject({
      verified: false,
      unexpected: 1,
      before: 2,
      after: 2,
    });
  });
  it("fails when checkbox states were swapped between controls", () => {
    expect(discardResidue(frames("1", ""), frames("", "1"))).toMatchObject({
      verified: false,
      unexpected: 1,
    });
  });
  it("fails when the form is gone after the discard", () => {
    expect(discardResidue(frames("a"), [])).toMatchObject({
      verified: false,
      formLost: true,
    });
  });
  it("fails when the discard ended on another page", () => {
    const after = frames("a");
    after[0].frame = "https://x.example/login";
    expect(discardResidue(frames("a"), after)).toMatchObject({
      verified: false,
      sameUrl: false,
    });
  });
  it("fails when the discard ended on another Hplace step", () => {
    expect(
      discardResidue(frames("a"), frames("a"), { stepBefore: 2, stepAfter: 1 }),
    ).toMatchObject({ verified: false, sameStep: false });
  });
  it("fails when most of the form's controls are missing after the discard", () => {
    expect(
      discardResidue(frames("a", "", "", "", ""), frames("a")),
    ).toMatchObject({ verified: false, controls: { before: 5, after: 1 } });
  });
});

describe("fingerprint helpers", () => {
  it("hashes exactly like the page function", () => {
    document.body.innerHTML = `<input name="a" value="값">`;
    const [c] = census(null, { ignoreLayout: true, salt: "s" }).controls;
    expect(fingerprint("s", "값")).toBe(c.fp);
  });

  it("covers formatted variants of synthetic profile values", () => {
    const fps = syntheticFingerprints("s", {
      schemaVersion: 1,
      profile: {
        personal: { koreanFamilyName: "테스트", koreanGivenName: "지원자" },
        contact: { phone: "01000001001" },
        careers: [{ startDate: "2020-03-01", endMonth: "2023-02" }],
      },
    });
    for (const v of [
      "테스트지원자",
      "010-0000-1001",
      "2020.03.01",
      "2020.03",
      "2020-03",
      "2023.02",
      "2023. 02",
    ])
      expect(fps).toContain(fingerprint("s", v));
    expect(fps).not.toContain(fingerprint("s", "실제이름"));
  });
});
