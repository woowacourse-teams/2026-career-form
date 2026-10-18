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
| 텍스트 치환 | 추출 3곳 + 읽기 전용 표시 후처리 3곳 = 6곳 |
| 합성 상태·동작 | CSS 숨김을 hidden으로 보존. 이벤트·서버 동작 추가 없음 |

실제 입력값·선택 상태·실행 코드·외부 리소스는 제외했다. 공통 텍스트와 필요한
식별자·참조는 사람 검토를 받았다. v2와는 페이지 준비 상태가 달라 추가질문 컨트롤
4개가 더 있다. 숨김·비활성 상태도 그대로 유지했다.

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
2026-10-18 오케스트레이터가 사용자 답변 없이 30분 경과 후 기존 registry로 해석한
요소의 자체 title/placeholder를 범용 등급에만 전달하는 방식을 결정했다.
이를 사용자 승인으로 간주하지 않는다. 공유 수집·정적 후보 타입·API는 확장하지 않는다.
고정 응답으로 원래 v4 칸의 addressLine1 차단 및 postalCode 허용을 검사하며,
합성 autocomplete 변이 검사도 유지한다.
페이지 CSS·스크립트·이벤트·폼 밖 검색 팝업·서버 반응·설치 확장 실행은 재현하지 않는다.

## 등록

`frontend/fixtures/dom-snapshots/ahnlab-write-resume-form/`에 v4 HTML을 무변경 등록한다.
연결 테스트는 `frontend/src/autofill/workflow/dom-snapshot.ahnlab.test.ts`다.
최종 판정은 등록 가능이다. 이번 오프라인 검사에서 생성한 Chromium context와 browser는
종료했다. 추출 코드의 원본 대응표와 브라우저 세션은 이 작업에서 접근하지 않았다.
