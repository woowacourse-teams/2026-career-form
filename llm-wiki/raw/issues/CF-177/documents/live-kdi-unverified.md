# Hplace 미검증 테넌트 후속 수정과 구조 미확인 칸 표시

> Issue: CF-177
> Collected: 2026-10-20
> Approval-Digest: 1f3a2c11feb57fc5644601525129931c8a94c47711ea779bde7c6e96b59ba32d
> Source-Revision: 82bf5e6cc0a00110f3b8efaf36fad800055ad6ad

이 문서는 2026-10-20에 별도로 승인된 4차 후보 K66–K69를 수집한 기록이다. Approval-Digest는 후보 파일 `.git/cf-workflow/drafts/knowledge-candidates-r4.md` 전체 UTF-8 바이트의 SHA-256이며 수집 직전에 다시 계산해 일치를 확인했다. 앞선 K01–K65의 승인과 내용은 [manifest](../manifest.md)와 [C12·C13·시연 근거](live-c12-c13-demo.md)를 따르며, 이 문서는 K62·K64를 정정하고 K68·K69를 더한다. 실제 지원자 값·계정·세션·URL 쿼리·대화 전문은 포함하지 않고 예시 값은 모두 합성이다.

## 기준선과의 관계

- K66은 K62의 "BE 필수 앵커 = 영문 이름·생년월일"을 "영문 이름"으로 대체한다.
- K67은 K64의 "모호한 안내는 미기입"을 홍길동 표준 예시 순서를 따르는 범위로 좁힌다.
- K68·K69는 새 동작이며 기존 근거를 바꾸지 않는다.
- 최종 점검(리뷰어 7명)에서 반영한 보강은 `82bf5e6`에 포함된다: 상세 모듈 location 가드, 영문 이름 접미사 필수, 같은 순서 예시 반복 허용, 월 단위 복무일의 일 단위 화면 거부, 분석 요청 sentinel 회귀, 호스트 끝 점 정규화.

## 승인 후보

### K66. 상세 기본정보의 생년월일도 선택 앵커다 (K62 정정)

KDI step 1 섹션 11에는 생년월일·성별 칸이 없다. 영문 이름과 생년월일을 함께 요구하던 앵커 때문에 상세 모듈 전체가 fail-closed되어 영문 이름이 비었다. 지금은 현주소와 마찬가지로 생년월일 제어가 하나도 없는 화면만 생년월일을 생략할 수 있고, 있는데 형식이 다르면 계속 차단한다. 상세 섹션의 필수 앵커는 영문 이름 하나다(FE `detail.ts`, BE `HplaceFormFingerprint.DETAIL_REQUIRED`). K62의 "BE 필수 = 영문 이름·생년월일"을 대체한다.

근거: 88a398f; kdi-red.log, kdi-red-be.log.

### K67. 순서 문구가 없으면 홍길동 표준 예시의 순서를 따른다 (K64 정정)

KDI 안내는 `* Hong, Gildong (여권상 영문성명 기재)`처럼 순서 문구 없이 예시만 있다. 순서 문구("이름 + 성" 등)가 없을 때는 안내 안의 홍길동 표준 예시가 정확히 한 순서로만 나타나면 그 순서를 따른다(`Hong, Gildong`·`HONG GILDONG`은 성 이름, `Gildong Hong`·`Gil-dong Hong`은 이름 성). 형식은 기존처럼 띄어쓰기이며 쉼표는 넣지 않는다(사용자 결정). 같은 순서의 예시가 반복되면 그 순서(`Hong, Gildong (예: HONG GILDONG)`), 두 순서가 섞이거나 홍길동이 아닌 예시는 미기입이다. 순서 접미사 없는 영문 이름 후보는 BE 응답과 무관하게 FE 쓰기에서 거부한다(방어). K64의 "모호한 안내는 미기입"을 이 범위에서 좁힌다.

근거: 88a398f·최종 점검 커밋 `english-name.ts`, `detail-write.ts`, `hplace-run2-english.test.ts`.

### K68. 구조를 확인하지 못한 1단계 칸은 입력 불가로 표시한다

에이치닷 1단계에서 칸이 화면에 있고 열려 있으며 프로필 값이 있는데 legacy 상세·기본 계약을 통과하지 못하면, 결과 "확인 필요"에 `입력 불가(화면 구조 확인 불가)`(실패 코드 `STRUCTURE_UNVERIFIED`)로 표시한다. 기존 보류 항목처럼 프로필 값과 복사 버튼이 함께 나오며, 영문 이름은 기본 순서(성 이름)로 조합한 값을 보인다. 화면에 없는 칸, 닫힌 조건부 칸, 프로필 값이 없는 칸, 정상 화면은 표시하지 않는다. 이 화면은 회사 판별이 `hplace`가 아니라 실행 정책 엔진(`policy`) 경로로 잡히므로 회사 이름이 아니라 에이치닷 지문과 writeResume 경로로 대상을 판단하고, 범용(GENERIC) 실행에서는 호출하지 않는다. AGENTS.md의 "안전한 매핑을 검증할 수 없으면 해당 필드를 입력 불가로 표시" 규칙과 Issue #177 AC7을 legacy 경로에도 적용한 것이다. 데모 overlay처럼 `document.location`이 없는 분리 문서에서는 판정 전에 빠져나와야 한다. 첫 구현은 이를 놓쳐 결과 단계에 도달하지 못하는 회귀(17건)가 전체 테스트에서만 드러났다.

근거: 683a551·fb2327d `unverified-structure.ts`, `AutofillWorkflow.hplace-unverified-structure.test.tsx`; unverified-red.log; `AutofillOverlay*.test.tsx` 회귀.

### K69. 자동 기입 진단 로그는 기본으로 꺼진다

develop의 개발용 진단 스위치는 기본 켜짐이라 일반 빌드에서도 CF-177의 `skip`·stage·build 줄과 기존 단계 표가 콘솔에 나왔다. 이제 `VITE_AUTOFILL_DEBUG=true`로 빌드할 때만 켜지고(테스트 모드는 항상 꺼짐), 실평가 하네스는 이 값을 명시해 빌드하므로 영향이 없다. 시연 중 보인 콘솔 오류 3종(CSP `script-src:` 지시어 오타, fonts.gstatic.com CORS 차단, 그로 인한 리소스 실패)은 자동 기입 없이 페이지만 열어도 나는 사이트 쪽 오류이며 확장과 무관하다.

근거: 08bcf5e `autofill-debug.ts`; debug-default-red.log; 콘솔 관찰(plan.md 2026-10-20 체크포인트).

## topic별 반영

- adapter-hplace: K66, K67, K68, K69
- adapter-field-inventory: K66, K67, K68
- adapter-development: K66(FE·BE 동시 변경 범위), K69
