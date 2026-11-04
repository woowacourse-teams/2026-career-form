# Offline Korean profile catalog

entries.json is a bundled UTF-8 array, version **2026-10-07**, with exactly
id, kind, name, detail, aliases per record. No runtime network or credentials.

## Coverage and attribution

Downloaded and verified on 2026-10-07; KRIVET and curated qualifications
added and verified on 2026-11-04. Broad domestic coverage, not worldwide
or all historical schools and credentials. Total: **5,262 records**,
**1,494,264 bytes** of JSON.

| Official publisher / dataset                                        | Snapshot / extraction                 |                          Shipped records |
| ------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------: |
| 한국교육개발원 국가교육통계센터, KESS 유초중등 학교별 주요 현황     | 2026-04-01 / 2026-09-03               |                       2,447 high schools |
| 한국교육개발원 국가교육통계센터, KESS 고등교육통계 학교별 주요 현황 | 2026-04-01 / 2026-08-26               | 493 universities, 1,588 graduate schools |
| 한국산업인력공단 국가자격 종목 목록 정보                            | 2025-12-31                            |                         613 certificates |
| 한국데이터산업진흥원 데이터 자격 검정 상세정보                      | 2026-08-21; portal updated 2026-09-04 |                           7 certificates |
| 한국직업능력연구원 공인민간자격등록현황                             | registered 2026-08-26                 |                          99 certificates |
| 대한상공회의소 자격평가사업단 종목 안내 (curated)                   | 2026-11-04                            |                          14 certificates |
| 국사편찬위원회 한국사능력검정시험 안내 (curated)                    | 2026-11-04                            |                            1 certificate |

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
- KRIVET: <https://www.data.go.kr/data/15069557/fileData.do>
  (한국직업능력연구원 공인민간자격등록현황, 이용허락범위 제한 없음).
- KCCI curated names (names and issuer only, no copied descriptions), checked
  against the official 종목소개 pages on 2026-11-04:
  <https://license.korcham.net/co/examguide.do?cd=0102&mm=21> (menu and grade
  tables: mm=21&cd=0103 컴퓨터활용능력 1급/2급, mm=22&cd=0102 워드프로세서
  단일등급, mm=23&cd=0107 비서 1~~3급, mm=41&cd=0104 전산회계운용사 1~~3급,
  mm=61&cd=0106 한글속기 1~3급, mm=32&cd=0105 전자상거래운용사,
  mm=28&cd=0108 경영정보시각화능력). Q-Net confirms 시행기관 대한상공회의소 and
  관련부처 고용노동부 for 컴퓨터활용능력 1급/2급
  (<https://q-net.or.kr/crf005.do?id=crf00503&jmCd=0493>, jmCd=0492) and lists
  워드프로세서 under 관련부처 대한상공회의소 (jmCd=0488). Only 컴퓨터활용능력
  carries the 국가기술자격 category in detail; the other KCCI entries carry the
  issuer alone because no fetched page states their category.
- 한국사능력검정시험: issuer 국사편찬위원회,
  <https://www.historyexam.go.kr/pageLink.do?link=examInfo> ("국사편찬위원회가
  주관·시행").
- 데이터 분석 aliases ADP and ADsP verified from the official qualification
  headings 데이터분석전문가(ADP) and 데이터분석준전문가(ADsP):
  <https://www.dataq.or.kr/www/sub/a_05.do?menuid=1005>,
  <https://www.dataq.or.kr/www/sub/a_06.do?menuid=1006>.
- SQL aliases verified from official qualification headings:
  <https://www.dataq.or.kr/www/sub/a_04.do?menuid=1004> (SQL 개발자 / SQLD),
  <https://www.dataq.or.kr/www/sub/a_03.do?menuid=1003> (SQL 전문가 / SQLP).
  No other abbreviations or school aliases were invented.
- Autofill matching (not catalog data) accepts one site spelling difference:
  a 한국폴리텍 university or graduate school whose site label carries a
  campus-group number (`한국폴리텍 I 대학 …`) matches the unnumbered KESS name
  only when the number appears on one side, and removing it points to exactly
  one catalog entry (`matchesCatalogNumberedCollege`).

### Download artifacts (not bundled)

KESS XLSX URL template:
https://kess.kedi.re.kr/contents/dataSet/downLoad.do?fileNm=FILE&userfileNm=2026.xlsx

| Artifact                               | FILE / attachment    | SHA-256                                                          |
| -------------------------------------- | -------------------- | ---------------------------------------------------------------- |
| KESS higher XLSX (1,649,584 bytes)     | 202672602239494.xlsx | 8e1b36c6b75d87d7bf59c88347401e5b7f5bee3fc1ff9c1666861f746ec5769d |
| KESS secondary XLSX (18,472,276 bytes) | 2026835615251.xlsx   | 5c198da8b32085c2cb6966dde5e9f9c7ce7da1567362f5a6df18ff928520685e |
| HRDK CP949 CSV (24,570 bytes)          | FILE_000000003660912 | 256691f1b8e1efd9e8b2be03e74b45f9cda550009a575182468c30ea372ce6a5 |
| KDATA UTF-8 BOM CSV (1,596 bytes)      | FILE_000000007623862 | 5a8ab8eb9835f5b78cc156655b9c34a98819e4f03ed446a82055a74fd98cd6c0 |
| KRIVET CP949 CSV (11,520 bytes)        | FILE_000000007630434 | af2472fcb243257688ae62379afe1e5dff22f5f7f29669027597b2d8f85c366b |

CSV URL template:
https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=ATTACHMENT&fileDetailSn=1&insertDataPrcus=N

HRDK portal JSON-LD points to an unrelated DOCX. The correct CSV above was
resolved through the public selectFileDataDownload.do endpoint, dataset
15082998, detail uddi:b6f6b8a3-05b8-4a06-bc59-e81477c9f0fb. KRIVET was resolved the
same way: dataset 15069557, detail uddi:dd42dfb1-fe74-4303-a2e2-c3411586bb4d
(portal updated 2026-09-04), CP949, 102 data rows.

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
- KRIVET: 102 source rows, 99 shipped records, 0 skipped for an existing exact
  name. The 자격종목 column is shipped as the name without 등급: the source lists
  all grades of a qualification in one 등급 cell (for example `1급, 2급`), so no
  per-grade rows exist. One duplicate row (한자급수자격검정) is dropped, and rows
  sharing 자격종목 and 자격관리자 (한자능력급수, 한자.한문 전문지도사) merge into
  one record because they would otherwise share the same name and detail.
  Cells are trimmed. detail = 자격관리자 · 국가공인민간자격 · 소관 부처.
  ID = certificate:krivet:HASH([자격종목,등급,자격관리자]), where 등급 is the
  source cell, or the sorted distinct cells joined with `/` when rows merge, so
  the ID does not depend on row order. Validity dates, 기공인기간 and raw files are
  not shipped. 리눅스마스터 comes from this file (한국정보통신진흥협회).
- Curated: 14 KCCI qualifications (컴퓨터활용능력 1급/2급, 워드프로세서, 비서
  1~~3급, 전산회계운용사 1~~3급, 한글속기 1~3급, 전자상거래운용사,
  경영정보시각화능력) and 한국사능력검정시험. ID =
  certificate:curated:SLUG with a fixed English slug per entry. Grades are
  separate entries where the official page lists separate 급. 컴퓨터활용능력 is
  verified as 국가기술자격 (고용노동부); the other detail strings carry the issuer
  only. ADP and ADsP are aliases on the existing 데이터 분석 전문가 and
  데이터 분석 준전문가 records; their IDs are unchanged.
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
schools, foreign qualifications, unregistered private qualifications and other
issuers are not covered. KRIVET covers only the 2026-08-26 national-approved
registry; no public file lists KCCI items, so those are a short curated list. Schoolinfo was not used: its linked host had a TLS
hostname mismatch; the www host returned no CSV download on that linked page.
This is broad domestic school coverage plus HRDK/KDATA qualifications, not all
possible credentials. Missing entries must remain usable as manual input.

## Certificate selection

Choosing a certificate fills `issuer` with the first segment of its detail
(the text before the first `·`) only when issuer is blank; whitespace counts as
blank. It never overwrites a non-blank issuer, and editing the name keeps the
issuer while releasing the link. Typing a name, direct input and imports never
fill it.

## Language-test search

`catalog.ts` also projects the repository's existing `LANGUAGE_TEST_OPTIONS`
from `standard-values.ts`: TOEIC, TOEIC Speaking, TOEFL, TEPS, OPIc, IELTS,
JLPT and HSK, plus TEPS Speaking, G-TELP, FLEX, JPT, SJPT, HSKK, TSC, DELF,
DALF, DELE, Goethe-Zertifikat, TestDaF and TOPIK (21 in total, no aliases for the
new ones). These curated entries are separate from the official
school/certificate JSON and retain the existing labels and aliases without
broadening them. IDs use `languageTest:<existing option value>` and never
depend on ordering. The complete runtime catalog contains 5,283 entries.
Adding a curated exam adds a new ID and keeps `CATALOG_VERSION`; changing the
version invalidates every stored selection.

Exam selection stores its name and identity only. It does not infer or
overwrite the language, grade, registration number or acquisition date.
Exam variants outside this list, such as TOEIC Writing,
remain manual input. TOEIC and TOEIC Speaking are separate entries; neither
implies the other, and TOEFL does not imply a specific test format.
