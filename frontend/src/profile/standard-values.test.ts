import { expect, it } from "vitest";
import {
  ATTENDANCE_TYPE_OPTIONS,
  LANGUAGE_OPTIONS,
  LANGUAGE_TEST_OPTIONS,
  SCHOOL_REGION_OPTIONS,
} from "./standard-values";

it("provides shared recommendations for language and education fields", () => {
  expect(LANGUAGE_OPTIONS).toEqual(expect.arrayContaining(["영어", "일본어", "중국어"]));
  expect(LANGUAGE_TEST_OPTIONS).toEqual(expect.arrayContaining(["TOEIC", "TOEFL", "OPIc"]));
  expect(SCHOOL_REGION_OPTIONS).toEqual(expect.arrayContaining(["서울", "부산", "해외"]));
  expect(ATTENDANCE_TYPE_OPTIONS).toEqual(["주간", "야간"]);
});
