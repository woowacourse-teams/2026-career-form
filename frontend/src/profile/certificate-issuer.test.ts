import { expect, it } from "vitest";
import entries from "./catalog-data/entries.json";
import {
  canonicalIssuerName,
  issuerComparisonKey,
  sameIssuer,
} from "./certificate-issuer";

it("removes legal-entity markers from an issuer name", () => {
  expect(canonicalIssuerName("(재)한국데이터산업진흥원")).toBe(
    "한국데이터산업진흥원",
  );
  expect(canonicalIssuerName("(사)한국금융연수원")).toBe("한국금융연수원");
  expect(canonicalIssuerName("사단법인  보험연수원")).toBe("보험연수원");
  expect(canonicalIssuerName("재단법인 서울대학교발전재단")).toBe(
    "서울대학교발전재단",
  );
  expect(canonicalIssuerName(" 주식회사 케이티 ")).toBe("케이티");
  expect(canonicalIssuerName("(주)피씨티")).toBe("피씨티");
});

it("keeps the original separators and removes the spaces next to them", () => {
  expect(canonicalIssuerName("주식회사 케이티ㆍ주식회사 한국경제신문")).toBe(
    "케이티ㆍ한국경제신문",
  );
  expect(canonicalIssuerName("(사)한국포렌식학회/한국인터넷진흥원")).toBe(
    "한국포렌식학회/한국인터넷진흥원",
  );
});

it("matches the two spellings of the same body", () => {
  expect(sameIssuer("한국데이터산업진흥원", "(재)한국데이터산업진흥원")).toBe(
    true,
  );
  expect(sameIssuer("한국 데이터산업 진흥원", "한국데이터산업진흥원")).toBe(
    true,
  );
});

it("matches the verified official aliases of a body", () => {
  expect(sameIssuer("HRDK", "한국산업인력공단")).toBe(true);
  expect(sameIssuer("산업인력공단", "한국산업인력공단")).toBe(true);
  expect(sameIssuer("hrdk", "산업인력공단")).toBe(true);
  expect(sameIssuer("K-DATA", "(재)한국데이터산업진흥원")).toBe(true);
  expect(sameIssuer("KCCI", "대한상공회의소")).toBe(true);
});

it("does not match different bodies", () => {
  expect(sameIssuer("한국산업인력공단", "대한상공회의소")).toBe(false);
  expect(sameIssuer("한국생산성본부", "한국금융연수원")).toBe(false);
  expect(sameIssuer("한국경제신문", "매일경제신문사")).toBe(false);
});

it("never matches an empty issuer", () => {
  expect(sameIssuer("", "")).toBe(false);
  expect(sameIssuer("  ", "한국산업인력공단")).toBe(false);
  expect(sameIssuer("(재)", "(재)")).toBe(false);
});

it("never lets two different catalog issuers share a name key", () => {
  const issuers = new Set(
    entries
      .filter((entry) => entry.kind === "certificate")
      .map((entry) => canonicalIssuerName(entry.detail.split(" · ")[0] ?? "")),
  );
  const canonical = [...issuers];
  expect(canonical.every(Boolean)).toBe(true);
  const keys = canonical.map(issuerComparisonKey);
  expect(new Set(keys).size).toBe(canonical.length);
  const overlap = canonical.flatMap((left, index) =>
    canonical.slice(index + 1).filter((right) => sameIssuer(left, right)),
  );
  expect(overlap).toEqual([]);
});
