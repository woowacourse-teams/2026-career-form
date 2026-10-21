import { mountDetail } from "./detail.test-fixtures";
export function mountBasicDetail() {
  mountDetail();
  const section = document.querySelector('section[data-code="13"]')!;
  const radios = (name: string, values: string[][], rel = "") =>
    `<div class="subject"><span class="radio" ${rel}>${values.map(([v, l]) => `<label><input type="radio" name="${name}" value="${v}"><span class="label">${l}</span></label>`).join("")}</span></div>`;
  document
    .querySelector('section[data-code="11"] .subject')!
    .insertAdjacentHTML(
      "beforeend",
      radios("genderFlag", [
        ["M", "남"],
        ["F", "여"],
      ])
        .replace('<div class="subject">', "")
        .replace("</div>", ""),
    );
  section.insertAdjacentHTML(
    "beforeend",
    radios(
      "patriot.patriotYn",
      [
        ["false", "비대상"],
        ["true", "대상"],
      ],
      'data-rel-id="patriot" data-rel-type="with" data-rel-value="true"',
    ) +
      radios(
        "handicap.handicapYn",
        [
          ["false", "비대상"],
          ["true", "대상"],
        ],
        'data-rel-id="handicap" data-rel-type="with" data-rel-value="true"',
      ) +
      radios(
        "military.militaryTypeCode",
        [
          ["00", "비대상"],
          ["01", "군필"],
          ["02", "미필"],
          ["03", "면제"],
          ["04", "복무중"],
        ],
        'data-rel-id="military noneMilitary" data-rel-type="complex" data-rel-value="01,04 03"',
      ) +
      '<div class="subject"><select name="nationality"><option value="">선택</option><option value="KR">대한민국</option></select></div>',
  );
}
export function activateBasicDetails() {
  for (const name of [
    "patriot.patriotYn",
    "handicap.handicapYn",
    "military.militaryTypeCode",
  ]) {
    (
      document.querySelector(
        `[name="${name}"][value="${name.startsWith("military") ? "01" : "true"}"]`,
      ) as HTMLInputElement
    ).checked = true;
  }
  const add = (driver: string, html: string) =>
    document
      .querySelector(`[name="${driver}"]`)!
      .closest(".subject")!
      .insertAdjacentHTML("beforeend", html);
  add(
    "patriot.patriotYn",
    '<input type="text" name="patriot.patriotNumber" maxlength="64" data-rel-target="patriot"><input type="text" name="patriot.relationship" maxlength="64" data-rel-target="patriot">',
  );
  add(
    "handicap.handicapYn",
    '<select name="handicap.handicapGradeCode" data-rel-target="handicap"><option value="">선택</option><option value="100">심한 장애인</option><option value="200">심하지 않은 장애인</option></select><select name="handicap.handicapContentsCode" data-rel-target="handicap"><option value="">선택</option><option value="17">지체장애</option></select>',
  );
  add(
    "military.militaryTypeCode",
    '<select name="military.militaryPositionCode" data-rel-target="military"><option value="">선택</option><option value="04">병장</option></select><input type="text" name="military.militaryStartDate" data-rel-target="military" class="date start" data-dates="military.militaryDate:YM"><input type="text" name="military.militaryEndDate" data-rel-target="military" class="date end" data-dates="military.militaryDate:END"><select name="military.militaryDischargeCode" data-rel-target="military"><option value="">선택</option><option value="01">만기제대</option></select><input type="text" name="military.exemptionReason" data-rel-target="noneMilitary" maxlength="512">',
  );
}
export function basicAnalysis(
  request: import("../../api/types").FieldsAnalyzeRequest,
): import("../../api/types").FieldsAnalyzeResponse {
  const map: Record<string, [string, string, Record<string, string>?]> = {
    gender: ["personal.personal.gender", "LOOKUP", { 남성: "남", 여성: "여" }],
    nationality: [
      "personal.personal.nationality",
      "LOOKUP",
      { 대한민국: "대한민국" },
    ],
    veteranStatus: ["veteran.veteran.veteranStatus", "DERIVED"],
    disabilityStatus: ["disability.disability.disabilityStatus", "DERIVED"],
    militaryStatus: [
      "military.military.militaryStatus",
      "LOOKUP",
      {
        군필: "군필",
        미필: "미필",
        면제: "면제",
        복무중: "복무중",
        비대상: "비대상",
      },
    ],
    veteranNumber: ["veteran.veteran.veteranNumber", "DIRECT"],
    veteranRelation: ["veteran.veteran.veteranRelation", "DIRECT"],
    disabilityGrade: [
      "disability.disability.disabilityGrade",
      "LOOKUP",
      { "심한 장애인": "심한 장애인" },
    ],
    disabilityType: [
      "disability.disability.disabilityType",
      "LOOKUP",
      { 지체장애: "지체장애" },
    ],
    militaryRank: [
      "military.military.militaryRank",
      "LOOKUP",
      { 병장: "병장" },
    ],
    serviceStartDate: ["military.military.serviceStartDate", "DIRECT"],
    serviceEndDate: ["military.military.serviceEndDate", "DIRECT"],
    dischargeType: [
      "military.military.dischargeType",
      "LOOKUP",
      { 만기제대: "만기제대" },
    ],
    exemptionReason: ["military.military.exemptionReason", "DIRECT"],
  };
  return {
    snapshotId: request.snapshotId,
    mode: "ADAPTER",
    analysisStatus: "COMPLETE",
    fields: request.sections
      .flatMap((s) => s.fields)
      .map((f) => {
        const key = f.domName?.split(".").at(-1) ?? "";
        const mapping = map[key];
        if (!mapping)
          return {
            candidateId: f.candidateId,
            matchType: "NO_MATCH",
            mappingStatus: "ADAPTER_VERIFIED",
            interactionStatus: "BLOCKED",
            reasonCodes: ["NO_MATCH"],
          } as import("../../api/types").FieldAnalysis;
        const [profileFieldKey, type, optionMap] = mapping;
        return {
          candidateId: f.candidateId,
          matchType: "MATCH",
          mappingStatus: "ADAPTER_VERIFIED",
          interactionStatus: "READY",
          autofillPolicy:
            key === "gender" || key === "nationality"
              ? "CONDITIONAL"
              : "ALLOWED",
          writePlan: {
            command:
              f.control === "radio"
                ? "CHECK_RADIO"
                : f.control === "select"
                  ? "SELECT_OPTION"
                  : "SET_TEXT",
          },
          valueBinding:
            type === "DERIVED"
              ? {
                  type: "DERIVED",
                  recipe: "BOOLEAN_YN",
                  profileFieldKey,
                  trueLabel: "대상",
                  falseLabel: "비대상",
                }
              : type === "LOOKUP"
                ? { type: "LOOKUP", profileFieldKey, optionMap: optionMap! }
                : { type: "DIRECT", profileFieldKey },
        };
      }),
  };
}
