import { describe, expect, it } from "vitest";
import {
  catalogKindForField,
  searchCatalog,
  type CatalogEntry,
} from "./catalog-search";

const entries: readonly CatalogEntry[] = [
  {
    id: "d",
    kind: "certificate",
    name: "SQL 개발자",
    detail: "KDATA",
    aliases: ["SQLD", "SQL 개발자(SQLD)"],
  },
  {
    id: "p",
    kind: "certificate",
    name: "SQL 전문가",
    detail: "KDATA",
    aliases: ["SQLP"],
  },
  {
    id: "a",
    kind: "university",
    name: "가상대학교",
    detail: "서울 본교",
    aliases: [],
  },
  {
    id: "b",
    kind: "university",
    name: "가상대학교",
    detail: "부산 분교",
    aliases: [],
  },
  {
    id: "g",
    kind: "graduateSchool",
    name: "가상대학교 대학원",
    detail: "일반대학원",
    aliases: [],
  },
];

describe("local catalog search", () => {
  it.each(["sqld", " SQL D ", "SQL 개발자 (SQLD)"])(
    "finds verified aliases and spacing variants: %s",
    (query) => {
      expect(
        searchCatalog(entries, "certificate", query).map((entry) => entry.id),
      ).toEqual(["d"]);
    },
  );
  it("returns SQLD and SQLP as candidates without resolving ambiguous SQL", () => {
    expect(
      searchCatalog(entries, "certificate", "SQL").map((entry) => entry.id),
    ).toEqual(["d", "p"]);
  });
  it("keeps same-name campuses and filters by school level", () => {
    expect(
      searchCatalog(entries, "university", "가상대학교").map(
        (entry) => entry.id,
      ),
    ).toEqual(["a", "b"]);
    expect(
      searchCatalog(entries, "graduateSchool", "가상대학교").map(
        (entry) => entry.id,
      ),
    ).toEqual(["g"]);
  });
  it("supports narrowing by location while preserving separate identities", () => {
    expect(
      searchCatalog(entries, "university", "가상대학교 부산").map(
        (entry) => entry.id,
      ),
    ).toEqual(["b"]);
  });
  it.each(["", "   ", "등록되지 않은 학교"])(
    "returns no candidates for %j",
    (query) => {
      expect(searchCatalog(entries, "university", query)).toEqual([]);
    },
  );
  it("applies only to certificate and education name fields", () => {
    expect(catalogKindForField("certificate", "name")).toBe("certificate");
    expect(catalogKindForField("highSchool", "schoolName")).toBe("highSchool");
    expect(catalogKindForField("university", "majorName")).toBeUndefined();
    expect(catalogKindForField("career", "companyName")).toBeUndefined();
  });
});
