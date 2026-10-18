# DOM 스냅샷 검토 기록: ahnlab-write-resume-form

[수집 정책](../../../../harness/policies/dom-snapshot-fixtures.md)에 따른 v4 등록 기록이다.
정제 구조의 오프라인 처리만 검증하며 실사이트 성공률을 입증하지 않는다.

## 대상과 승인

- Issue #252, site_id `ahnlab`, 유일한 지원서 form의 입력 영역.
- 2026-10-18 재수집: 추가질문을 프로필 키 미매칭 음성 사례로 유지한다.
- 승인된 추출 코드: `extract-v3.js`,
  SHA-256 `eadd613b5817c6c0c8c000c774af245f3dbd842d4a180370e9412c25eb227e38`.
- 승인된 오프라인 후처리: `div.row > div.span > span.text` 3곳의 본문을
  `[TEXT]`로 교체했다. 브라우저 접근과 태그 변경은 없다.
- v4 SHA-256: `f85570bc1f96ee0cc2abb5a465f78e993f6b600e6fa92a38e3179d03d86823f8`.
- 설치 제품 revision은 `UNVERIFIED`다.

## 철회한 버전

v2는 폼 내부 header/session 텍스트 잔존, v3는 읽기 전용 지원자 이름 표시 잔존으로
철회·삭제됐다. 두 버전의 HTML과 원래 표시값은 등록하거나 재인용하지 않는다.

## 정제와 구조 보존

| 항목 | v4 기록 |
| --- | --- |
| 컨트롤 | 48: text 20, radio 11, select 11, number 2, checkbox 3, file 1 |
| 숨김 컨트롤 / 선택지 / 라벨 | 4 / 332 / 48 |
| for 보유 라벨 / 끊긴 for / 중복 ID | 12 / 0 / 0 |
| 반복 묶음 구조 통계 | [19, 3] |
| 버튼 | 정제 전 12, 정제 후 3. 제외 영역의 버튼 9개 제거 |
| 제외 | 숨김 input 13개, 폼 밖 컨트롤·팝업, 폼 내부 header/nav/footer 및 세션 관련 영역 5곳 |
| 익명화와 합성 코드 | id·name 31개, 선택지 코드 14개 |
| 텍스트 치환 | `[TEXT]` 4곳 = 후처리 대상 `span.text` 3곳 + 그 밖의 추출 `option` 1곳. 추출 실행 전체 횟수·중복 횟수는 UNVERIFIED |
| 합성 상태·동작 | CSS 숨김을 hidden으로 보존. 이벤트·서버 동작 추가 없음 |

실제 입력값·선택 상태·실행 코드·외부 리소스는 제외했다. 공통 텍스트와 필요한
식별자·참조는 사람 검토를 받았다. v2와는 페이지 준비 상태가 달라 추가질문 컨트롤
4개가 더 있다. 숨김·비활성 상태도 그대로 유지했다.

## 텍스트 치환 수 정정 (Issue #264)

초기 기록은 보고된 추출 카운터 3과 후처리 대상 3을 합산해 6곳으로 기록했으나,
이는 최종 HTML의 서로 다른 위치 수와 일치하지 않는다. `sanitized.html`에는
`[TEXT]`가 4개이며 속성 안의 `[TEXT]`는 없다.

| 확인 항목 | 결과 |
| --- | --- |
| `[TEXT]` 위치 | `span.text` 3곳(지원자 영역, 이메일, 핸드폰번호), 국가 선택지 `option` 1곳 |
| 후처리 대상 | `div.row > div.span > span.text` 3곳. HTML의 `span.text` `[TEXT]` 3곳과 일치 |
| 추출 코드 | `.worktrees-evidence/fixture-collect-20261017/extract-v3.js`, SHA-256 `eadd613b5817c6c0c8c000c774af245f3dbd842d4a180370e9412c25eb227e38`이 위 승인 해시와 같음을 확인 |
| 추출 치환 동작 | `reviewText`가 텍스트 노드·텍스트 속성에서 이메일, URL, 전화, 5자리 이상 숫자, 날짜, 80자 초과, 현재 입력값과 같은 텍스트를 `[TEXT]`로 바꾼다. 제외 영역은 자식 복사 전에 제거되므로 제거된 영역의 치환은 집계되지 않는다 |
| 최종 HTML의 분해 | `redacted_text_extraction` 1 = 후처리 대상 밖의 `option` 1곳. `redacted_text_post_filter` 3 = 후처리 대상 `span.text` 3곳. 합계 `redacted_text_count` 4 |
| 추출 실행 전체 치환 수·중복 위치 | UNVERIFIED. 수집 보고에는 `redactedText` 3이 있으나 대응 원문 로그와 단계별 위치 목록을 찾지 못함 |

- 단계별 필드는 최종 HTML의 중복 없는 위치 분류이며 추출 실행의 전체 치환 횟수가 아니다.
  `option`은 후처리 대상 밖이므로 추출 단계에서 남은 1곳으로 구분한다.
- `.worktrees-evidence/CF-252/v4-scan.log`의 `REDACTED_DISPLAY_COUNT 3`과
  `SHA256_VERIFIED`는 후처리 대상 수와 v4 해시를 뒷받침한다. 비추적 수집 디렉터리의
  `ahnlab-write-resume-v4-sanitized.html`도 등록 HTML과 SHA-256이 같다.
- UNVERIFIED: 초기 불일치의 정확한 원인, 추출 실행 전체 치환 수, 후처리와의 중복 여부·횟수.
  철회본 v3는 삭제됐고 기존 초안은 다른 수집 버전의 통계라 근거로 사용하지 않았다.
  겹침이나 제거된 위치 수를 역산해 확정하지 않는다.
- 원본이나 철회본을 다시 수집하지 않았으며 기존 사람 검토를 재판정하지 않았다.
  HTML은 변경하지 않았고 v4 SHA-256은 위 전체 해시와 같다.

## 등록 전 검토

| 검사 | 결과 | 검토일 |
| --- | --- | --- |
| 개인정보 잔존 여부 | PASSED, 사용자 확인(v4) | 2026-10-18 |
| 실패 조건의 구조 보존 | PASSED, 사용자 확인(v3 구조와 추가질문 유지, v4 태그 개수 동일) | 2026-10-18 |
| 자동 개인정보 패턴·실행성·제외 영역 검사 | 통과, 잔존 탐지 0건. 사람 검토를 대체하지 않음 | 2026-10-18 |

수집 도구의 원본 DOM·Console 자동 보관 여부는 초안에서 완전히 확인되지 않았다.
후속 작업에서 그 항목을 확인한 것으로 바꾸지 않는다. 기존 수집자 기록상 작업 소유
임시 참조와 정제 임시 파일은 정리됐으며 철회본 삭제는 사용자가 확인했다.

## 오프라인 재현

- 명령: `cd frontend && npx vitest run --project unit src/autofill/workflow/dom-snapshot.ahnlab.test.ts`.
- 제품 기준 revision: `a8b3a5725a4c940e9bdde820d28699c9e1300554`.
- 실제 `collectFieldsSnapshot`으로 우편번호 후보의 displayName 누락을 확인한다.
- 변이: 메모리에서만 aria-label을 추가하면 displayName과 해당 라벨 문맥을 얻는다.
- 추가질문 4개를 보존하고, 고정 API 기권 응답이 `NO_MATCH`로 유지되는지 확인한다.
  이는 실제 LLM이 기권한다는 근거가 아니다.
- localhost:8080 미실행으로 실제 백엔드/JEV 매칭은 NOT RUN이다.
- Playwright Chromium을 `offline=true`로 열고 HTTP(S) 요청을 차단했다.
  외부 요청 시도 0건, 컨트롤 48·선택지 332·라벨 48·버튼 3을 확인했다.
- 근거: `.worktrees-evidence/CF-252/v4-scan.log`,
  `start-implementation.log`, `fixture-red.log`, `fixture-green.log`.

원래 우편번호 칸은 `type=text`, `maxlength=126`이며 numeric inputMode와 postal-code
autocomplete가 없다. 자체 title은 DOM에만 있고 수집 후보에는 포함되지 않는다.
2026-10-18 사용자 승인(오케스트레이터 추천안: 범용 흐름에서 실제 요소 자체
title/placeholder만 읽기). 기존 registry로 해석한 요소의 자체 속성을 범용 등급에만
전달한다. 공유 수집·정적 후보 타입·API는 확장하지 않는다.
고정 응답으로 원래 v4 칸의 addressLine1 차단 및 postalCode 허용을 검사하며,
합성 autocomplete 변이 검사도 유지한다.
페이지 CSS·스크립트·이벤트·폼 밖 검색 팝업·서버 반응·설치 확장 실행은 재현하지 않는다.

## 등록

`frontend/fixtures/dom-snapshots/ahnlab-write-resume-form/`에 v4 HTML을 무변경 등록한다.
연결 테스트는 `frontend/src/autofill/workflow/dom-snapshot.ahnlab.test.ts`다.
최종 판정은 등록 가능이다. 이번 오프라인 검사에서 생성한 Chromium context와 browser는
종료했다. 추출 코드의 원본 대응표와 브라우저 세션은 이 작업에서 접근하지 않았다.
