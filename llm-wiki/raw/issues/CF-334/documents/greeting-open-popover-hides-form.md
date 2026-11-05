# Greeting 지원서의 열린 Ark UI 팝오버가 양식 전체를 숨김으로 수집시키는 경로와 CF-334 수정

> Issue: CF-334
> Collected: 2026-10-25
> Approval-Digest: acc59bf96d7344d991b653eadd0a2176e178eb4f64ddbc6260622d7e2ee5adef
> Source-Revision: a36ea0edc18069159b8dd52d6d395e4792068d04

이 문서는 2026-10-25 CF-334([BE] Greeting 컬리 구조 반복 마지막 분석 응답이 간헐적으로 MATCH 0/81로 돌아와 27칸이 조용히 빈다)에서 승인된 후보 1·2를 Greeting 어댑터 관점에서 수집한 기록이다. Approval-Digest는 [승인 후보 스냅샷](approved-candidates.md) 전체 UTF-8 바이트의 SHA-256이다. 바꾸지 않은 내용(검색 서버 액션 요청 구조, v18 장애 정도 별칭, 필드 확장과 검증 범위)은 Supersedes가 가리키는 CF-310 근거와 그 앞의 근거를 따른다. 실제 지원값·계정·세션은 포함하지 않으며 컬리 지원서는 공개 공고의 빈 양식이다.

## 승인 후보

1. 드라이버가 열어 둔 Ark UI 팝오버가 나머지 화면에 `aria-hidden`을 걸어 모든 칸이 숨김으로 수집되고, 재결합 신원에 `visibility`가 들어 있어 그 회차가 승인 0건으로 조용히 끝난다. CF-334는 숨김을 감지하면 열린 위젯을 닫고 다시 수집하며, 남는 칸은 결과 경고에 이름으로 표시한다.
2. 열린 채 남는 경로는 선택 없이 끝난 검색의 정리 단계(`searchFlows.cleanup`)가 그 순간의 `aria-expanded`만 보고 trigger가 현재 요소가 아니면 건너뛰는 데 있다. 정책 보강은 별도 후보다.

## 근거

### 숨김의 정체

- Greeting 지원서의 검색 콤보박스·달력·선택 메뉴는 Ark UI(Zag) 팝오버다. 팝오버가 열리면 hideOthers가 팝오버 바깥의 형제 루트에 `aria-hidden="true"`를 건다. 확장의 수집기(`collect.ts`의 `isHidden`)는 `[aria-hidden='true']` 조상이 있는 요소를 숨김으로 보므로, 팝오버 하나가 열린 채 남으면 양식의 모든 칸이 `visibility: hidden`으로 수집된다.
- 2026-10-25 컬리 지원서(공개 공고, 빈 양식) 반복 실행에서 무너진 회차의 수집 요청 객체를 직전 회차와 대조하니 81칸 중 80칸이 `visibility: visible → hidden`만 달랐다(이름·구역·행 동일). 숨김 감지 순간의 읽기 전용 DOM 덤프(91·115회차)에서 포커스는 대학원 전공 검색 콤보박스 입력에 있었고 그 콤보박스가 `data-state="open"`이었으며, `aria-hidden` 조상은 페이지 루트였다. 20초가 지나도 풀리지 않았다.
- 백엔드는 무관하다. 무너진 회차에서도 `fields/analyze` 응답은 `68/75`·`74/81`로 정상이었고, `0/81`·`1/81`은 프론트 정적 필드 세션이 첫 응답을 이후 회차의 DOM 후보에 다시 묶는 단계의 결과다. 신원 JSON에 `visibility`가 포함되므로 숨김 스냅샷에서는 전 칸이 묶이지 않아 `NO_MATCH`가 되고, 회차 끝 재분석(`refreshAfterPass`)은 `visibility !== "visible"`인 칸을 변경으로 치지 않아 `plan.items`가 0인 채 결과 화면이 뜬다. 결과 패널 "확인 필요"에도 나타나지 않았다.
- 2026-10-22(CF-333 측정) 1회·재실행 1회와 2026-10-25 60회 중 4회(7·11·26·44회차)에서 관측했다. Issue #334 최초 보고의 "마지막 분석 응답이 `MATCH 0/81`로 돌아왔다"는 서술은 백엔드 응답이 아니라 프론트 재결합 요약을 가리키므로 정정한다. CF-333 raw 문서 자체에는 이 서술이 없다.

### 열린 채 남는 경로

- Greeting 정책(`greeting-browser-v1.json`)의 `searchFlows.cleanup`은 검색이 선택 없이 끝난 뒤 그 순간의 `aria-expanded`만 보고 Escape 여부를 정하고, trigger가 현재 요소가 아니면 정리를 건너뛴다. 입력 뒤 늦게 열린 목록은 그대로 남는다.
- 정리 단계가 Escape 뒤 닫힘(`aria-expanded="false"`)을 기다리고 blur까지 하도록 Greeting 정책을 올리는 보강(v19)은 정책 버전 올림과 seed 갱신이 필요해 CF-334에 섞지 않고 별도 후보로 남긴다.

### CF-334 수정

- 분석 회차 시작과 기입 회차 끝의 수집은 `visible-fields-settle.ts`를 지난다. 직전 정상 스냅샷의 보이는 칸 수(4개 이상)의 절반도 보이지 않으면 일시 숨김으로 보고, 100ms 간격으로 최대 3초까지 다시 수집한다. 기준은 실행 객체에 두어 실행마다 초기화되고, 일시 숨김으로 판정된 스냅샷은 기준을 갱신하지 않는다.
- 다시 수집하기 전에 `dismissLeftoverComponentPopups`(`policy/components/workflow-popup.ts`)가 Component forms 정책이 있는 문서에서만 열린 검색 콤보박스(`aria-expanded="true"`)·달력 trigger(`data-state="open"`)·선택 버튼(`button[aria-controls][aria-expanded="true"]`)에 Escape를 보내고 포커스를 뺀다. 값은 바꾸지 않는다. 대기만으로는 44회차를 막지 못했고(숨김이 20초 넘게 지속), 닫기를 더한 뒤 40회(136~175회차) 중 숨김 2회(159·161)가 모두 첫 재수집에서 보이는 칸 81개로 돌아와 정상 종료했으며 무너진 회차는 0회였다.
- 그래도 묶이지 않은 칸은 정적 필드 세션이 `unresolvedFields`(후보 id와 표시명)로 응답에 붙이고, 기입할 것 없이 끝나는 회차에서만 결과 경고에 "페이지가 바뀌어 다시 연결하지 못한 항목 N개: …"로 표시한다. 행 추가 직후 회차처럼 재분석이 뒤따르는 정상 공백(매 회차 세 번째 요약이 `3/81`로 떨어진 뒤 `74/81`로 복귀)에는 붙이지 않는다.
- 디버그 빌드는 `dismissed leftover popups=N`, `stage name=fields-resettled|fields-still-hidden`을 콘솔에 남긴다.

## 한계

- 숨김 2회의 복귀는 수정 빌드 0845f23의 관측이고, 경고 표시 시점을 바꾼 a36ea0e는 단위 테스트로만 확인했다. 머지 뒤 dev 배포 빌드의 재확인은 남아 있다.
- 숨김 감지 기준(4개 이상, 절반 미만)은 컬리 양식(81칸)에서 정했다. 칸이 4개 미만인 화면은 판정하지 않는다.
