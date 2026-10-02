# 버튼 드롭다운의 값 보존과 실제 반영 판정

> Issue: [CF-142](https://github.com/woowacourse-teams/2026-career-form/issues/142)
> Collected: 2026-10-02
> Approval-Digest: b1d28af146b567a09987ebfeab7e0ee823bc4be8723710f1f19355b77ac2c7e0
> Source-Revision: ca54009aa971b283f3149710361dc57c666e67e8

## 계승하는 패널과 완료 기준

CF-140의 실제 값 기반 완료 판정을 계승한다. 원문 `llm-wiki/raw/issues/CF-140/documents/generic-result-completion.md`는 bundle manifest의 Supersedes로 연결한다. in-page 단일 패널, 실행 수명과 접근성, 기존 승인·덮어쓰기 정책과 회사 어댑터 판정은 유지한다.

승인한 실제 쓰기가 성공하고 읽을 수 있는 현재 값이 기대값과 일치할 때만 범용 항목을 완료로 집계한다. 불일치, 빈 값, 읽기 불가와 false verifier는 확인 필요에 남긴다. 결과 모델과 progress verifier가 같은 현재 값을 확인하며 출처만으로 미검증 처리하지 않는다. 완료는 입력값 반영 확인이지 매핑 의미나 저장·제출 완료의 보증이 아니다.

## 수집과 재열기의 값 보존

드롭다운 수집과 재열기는 대상과 다른 필드의 값 보존을 검사한다. 자체 probe가 값을 바꾸면 원래 값으로 복구한 뒤 중단한다. 실제 사용자 수정은 복구 대상으로 덮어쓰지 않는다. 취소와 지연 복수 메뉴가 나타난 경우에도 수집을 위해 연 목록을 정리한다.

현재 비옵션 표시값이나 false placeholder marker는 빈칸으로 오인하지 않는다. 수집 시점의 비식별 관계와 옵션만 분석에 전달하며 값 snapshot은 로컬 probe 수명 안에서 사용한다.

## 승인과 실제 선택

사용자 승인과 유일한 일치 옵션이 필요하다. 비동기 프로필 재검증이 끝난 뒤 현재 값, 원래 목록 소유 관계와 옵션을 다시 확인해 그 사이 바뀐 값을 덮어쓰지 않는다.

옵션 click 이후 MutationObserver로 실제 표시값의 반영을 확인한다. generic retention과 customFieldValue가 동일한 실제 값을 읽도록 연결한다. click 이벤트만 성공하고 placeholder가 그대로이면 완료로 집계하지 않는다.

## 검증 근거

관련 7개 파일 132개 테스트와 신규 안전성 2개 파일 28개 테스트가 통과했다. 최초 독립 게이트의 여섯 안전성 결함을 실패 테스트로 재현하고 수정한 뒤 같은 리뷰어의 재확인 승인을 받았다.

실제 Chromium의 합성 production workflow에서 정상은 완료 4개, 불일치와 값 미반영은 완료 0개·확인 필요 4개였다. 불명확 관계, probe 값 변경과 지연 복수 메뉴는 수집 0개로 중단했다. 모든 경로의 다른 입력을 보존하고 열린 메뉴가 남지 않음을 확인했다. 데스크톱·390px 모바일 화면과 생성한 자원 정리를 확인했다.

typecheck, lint, 변경 파일 포맷과 build는 통과했다. 전체 frontend의 기존 실패와 Docker WSL 환경에 따른 verify.py 실행 제한은 전체 통과로 기록하지 않는다. 실제 지원서 저장·이동·미리보기·제출은 검증 범위가 아니다.

## 참고 코드

- `frontend/src/autofill/dom/button-dropdown.ts`
- `frontend/src/autofill/write/button-dropdown-executor.ts`
- `frontend/src/autofill/dom/custom-field-value.ts`
- `frontend/src/autofill/write/native-executor.ts`
- `frontend/src/autofill/workflow/button-dropdown.integration.test.tsx`
