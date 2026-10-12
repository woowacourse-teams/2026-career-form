// Synthetic values; structure follows collect.greeting.test.ts and collection.test.ts.
export const universityPrefix = "educationalBackground.universities";

export function universityRow(index: number): string {
  const prefix = `${universityPrefix}.${index}`;
  return `<div data-scope="accordion" data-part="item">
    <div data-scope="field" data-part="root"><label>학교명*</label>
      <input name="${prefix}.schoolName" role="combobox" value="합성대학교${index === 0 ? "A" : "B"}">
    </div>
    <div data-scope="field" data-part="root"><label>입학일*</label>
      <button type="button" name="${prefix}.enrollmentPeriod.startDate" data-scope="date-picker" data-part="trigger">${index === 0 ? "2020. 03" : "2022. 03. 02"}</button>
    </div>
    <div data-scope="field" data-part="root"><label>졸업일*</label>
      <button type="button" name="${prefix}.enrollmentPeriod.endDate" data-scope="date-picker" data-part="trigger">2024. 02</button>
    </div>
  </div>`;
}

export function greetingImportFixture(): string {
  return `<form>
    <div data-scope="field" data-part="root"><label>이름</label>
      <input name="basicInformation.name" value="합성지원자">
    </div>
    <div data-scope="field" data-part="root"><label>연락처</label>
      <input type="tel" name="basicInformation.phoneNumber.nationalNumber" value="010-0000-0000">
    </div>
    <div data-scope="field" data-part="root"><label>이메일</label>
      <input type="email" name="basicInformation.email" value="fixture@example.invalid">
    </div>
    <div data-scope="field" data-part="root"><label>대학교*</label>
      <div data-scope="accordion" data-part="root">${universityRow(1)}${universityRow(0)}</div>
    </div>
    <input type="password" name="password" value="synthetic-secret">
    <textarea name="coverLetter">합성 제외 내용</textarea>
    <button type="submit">제출</button>
  </form>`;
}
