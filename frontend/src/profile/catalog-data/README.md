# Offline Korean profile catalog

entries.json is a bundled UTF-8 array, version **2026-10-07**, with exactly
id, kind, name, detail, aliases per record. No runtime network or credentials.

## Coverage and attribution

Downloaded and verified on 2026-10-07. Broad domestic coverage, not worldwide
or all historical schools and credentials. Total: **5,148 records**,
**1,467,942 bytes** of JSON.

| Official publisher / dataset | Snapshot / extraction | Shipped records |
| --- | --- | ---: |
| 한국교육개발원 국가교육통계센터, KESS 유초중등 학교별 주요 현황 | 2026-04-01 / 2026-09-03 | 2,447 high schools |
| 한국교육개발원 국가교육통계센터, KESS 고등교육통계 학교별 주요 현황 | 2026-04-01 / 2026-08-26 | 493 universities, 1,588 graduate schools |
| 한국산업인력공단 국가자격 종목 목록 정보 | 2025-12-31 | 613 certificates |
| 한국데이터산업진흥원 데이터 자격 검정 상세정보 | 2026-08-21; portal updated 2026-09-04 | 7 certificates |

School counts include campuses and closed schools. Source status remains visible
in detail: closed and renamed institutions can still be relevant to alumni.

### Public sources and permission

- KESS dataset listing (also includes the secondary-school download section):
  <https://kess.kedi.re.kr/contents/dataset?itemCode=04&menuId=m_02_04_03_02&tabId=m2>.
- Higher-education portal provenance:
  <https://www.data.go.kr/data/15139277/fileData.do> (이용허락범위 제한 없음).
- KESS public-data reuse policy:
  <https://kess.kedi.re.kr/post/6662659?itemCode=12>. Public data is freely reusable,
  including commercially, subject to excluded third-party rights. Attribution:
  한국교육개발원 국가교육통계센터 교육통계 데이터베이스, <https://kess.kedi.re.kr>.
- HRDK: <https://www.data.go.kr/data/15082998/fileData.do>
  (이용허락범위 제한 없음).
- KDATA: <https://www.data.go.kr/data/15148115/fileData.do>
  (이용허락범위 제한 없음).
- SQL aliases verified from official qualification headings:
  <https://www.dataq.or.kr/www/sub/a_04.do?menuid=1004> (SQL 개발자 / SQLD),
  <https://www.dataq.or.kr/www/sub/a_03.do?menuid=1003> (SQL 전문가 / SQLP).
  No other abbreviations or school aliases were invented.

### Download artifacts (not bundled)

KESS XLSX URL template:
https://kess.kedi.re.kr/contents/dataSet/downLoad.do?fileNm=FILE&userfileNm=2026.xlsx

| Artifact | FILE / attachment | SHA-256 |
| --- | --- | --- |
| KESS higher XLSX (1,649,584 bytes) | 202672602239494.xlsx | 8e1b36c6b75d87d7bf59c88347401e5b7f5bee3fc1ff9c1666861f746ec5769d |
| KESS secondary XLSX (18,472,276 bytes) | 2026835615251.xlsx | 5c198da8b32085c2cb6966dde5e9f9c7ce7da1567362f5a6df18ff928520685e |
| HRDK CP949 CSV (24,570 bytes) | FILE_000000003660912 | 256691f1b8e1efd9e8b2be03e74b45f9cda550009a575182468c30ea372ce6a5 |
| KDATA UTF-8 BOM CSV (1,596 bytes) | FILE_000000007623862 | 5a8ab8eb9835f5b78cc156655b9c34a98819e4f03ed446a82055a74fd98cd6c0 |

CSV URL template:
https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=ATTACHMENT&fileDetailSn=1&insertDataPrcus=N

HRDK portal JSON-LD points to an unrelated DOCX. The correct CSV above was
resolved through the public selectFileDataDownload.do endpoint, dataset
15082998, detail uddi:b6f6b8a3-05b8-4a06-bc59-e81477c9f0fb.

## Projection and ID strategy

Only the first data worksheet was imported, not workbook summaries. Source
text is trimmed, not renamed. detail retains region, type, campus, establishment,
day/night and status where supplied; certificates retain issuer and HRDK category.
Personal/contact fields, street addresses, statistics and raw files are not
shipped. Same-name schools and different campuses remain separate.

- Higher education: all 2,081 data rows. 학제 containing 대학원 maps to
  graduateSchool; other higher-education types map to university.
  ID = KIND:kess:SCHOOL_CODE:HASH([본분교]).
- Secondary: 고등학교 (2,400), 방송통신고등학교 (42), 고등기술학교 (5)
  map to highSchool. ID = highSchool:kess:KEDI_CODE:HASH([본분교]). All 42
  broadcasting schools lack a KEDI code in this source; fallback ID =
  highSchool:kess:name:HASH([시도,행정구,학교급,학교명,본분교]).
- HRDK: all 613 rows; no individual qualification IDs provided.
  ID = certificate:hrdk:HASH([자격구분코드,자격구분명,계열명,종목명]).
- KDATA: 9 written/practical rows deduplicate by exact 자격명 to 7 records.
  ID = certificate:kdata:HASH([자격명]), except the agreed
  certificate:kdata:sqld and certificate:kdata:sqlp.
- HASH = first 16 hex characters of SHA-256 of UTF-8 JSON array text, with
  ensure_ascii=False and separators comma/colon (no separator whitespace).
  IDs never depend on row order. Source codes and descriptive fallback IDs are
  not guaranteed permanent across revisions; renames and campus changes need
  explicit review, not guessed merges.

Records sort by (kind, name, detail, id). Unique IDs and unique
(kind, name, detail) triples were checked against the source rows.

## Limits

Mixed-level special/various schools are excluded rather than guessing their
high-school level. Historical institutions absent from the 2026 files, foreign
schools, foreign qualifications, other issuers and the KRIVET private-certificate
registry are not covered. Schoolinfo was not used: its linked host had a TLS
hostname mismatch; the www host returned no CSV download on that linked page.
This is broad domestic school coverage plus HRDK/KDATA qualifications, not all
possible credentials. Missing entries must remain usable as manual input.

## Language-test search

`catalog.ts` also projects the repository's existing `LANGUAGE_TEST_OPTIONS`
from `standard-values.ts`: TOEIC, TOEFL, TEPS, OPIc, IELTS, JLPT and HSK.
These seven curated entries are separate from the official school/certificate
JSON and retain the existing labels and aliases without broadening them.
IDs use `languageTest:<existing option value>` and never depend on ordering.
The complete runtime catalog contains 5,155 entries.

Exam selection stores its name and identity only. It does not infer or
overwrite the language, grade, registration number or acquisition date.
Exam variants outside this list remain manual input; TOEIC does not imply
TOEIC Speaking, and TOEFL does not imply a specific test format.
