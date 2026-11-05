# 확장·백엔드 호환 배포 순서와 API 호환 규칙

> Issue: CF-327
> Collected: 2026-10-23
> Approval-Digest: 460019c1c58c3248f460202a9b0e81f8fa783ffef0981abc96f7bccb2ae237f0
> Source-Revision: 82bcb5cd7e384096ee9b6f70e7f71803ed561af6

이 문서는 2026-10-23에 승인된 CF-327 후보 3을 수집한 기록이다. Approval-Digest는 [승인 후보 스냅샷](approved-candidates.md) 전체 UTF-8 바이트의 SHA-256이다. CF-177 K39가 Hplace v4에 한정해 정한 배포 순서를 확장·백엔드 전체의 호환 규칙으로 일반화하며, 이전 topic Wiki에 없던 주제라 Supersedes가 없다.

## 승인 후보

확장과 백엔드는 배포 시점이 다르므로 호환을 설계한다. 현재 장치: `/api/v1` 경로, `X-Career-Form-Capabilities` 요청 헤더(`address-search-v1`, `quality-v2`), 품질 수집의 `extensionVersion`, 새 확장이 없는 엔드포인트의 404를 `ENDPOINT_UNAVAILABLE`로 강등하는 처리. 규칙: 응답 스키마가 바뀌면 경로 버전 또는 capability 협상으로 구 클라이언트에 기존 스키마를 유지하고, 요청 변경은 nullable 추가로 한정하며, 릴리스 PR에 FE/BE 호환 매트릭스를 기록한다. 외부 사용자가 있으면 새 확장 게시 → 보급 확인 → 백엔드 배포 순서를 따른다(CF-177 K39). 1.4.0 사례: Hplace v4 네이티브 정책이 `/api/v1/execution-policy` 응답 스키마를 버전 표시 없이 바꿔 구 확장이 응답 전체를 거부할 수 있었고(로컬 validator probe 근거, 브라우저 종단 검증 아님), 요청 DTO 변경은 nullable 추가라 호환이었다. 외부 사용자가 있어 확장 0.4.0을 먼저 게시한 뒤 백엔드를 main에 병합했다.

## 왜 순서가 필요한가

확장은 Web Store 심사와 사용자 Chrome의 자동 갱신을 거쳐 며칠에 걸쳐 퍼지고, 백엔드는 main 병합 즉시 모든 사용자에게 바뀐다. 두 배포 사이에는 반드시 "구 확장 + 신 백엔드" 또는 "신 확장 + 구 백엔드" 조합이 생긴다. 외부 사용자가 있는 한 이 창을 없앨 수 없으므로, 어느 조합이 안전한지를 코드로 만들어 두고 그 조합이 생기도록 순서를 정한다.

## 현재 호환 장치

| 장치 | 위치 | 역할 |
|---|---|---|
| `/api/v1` 경로 버전 | 모든 백엔드 컨트롤러 | 경로 수준의 큰 버전. 지금까지 v1 하나다 |
| `X-Career-Form-Capabilities` 요청 헤더 | `frontend/src/autofill/api/background-handler.ts`, `backend/.../PreparationAnalysisController.java` | 확장이 지원하는 기능(`address-search-v1`, `quality-v2`)을 서버에 알려 응답을 고르게 한다 |
| `extensionVersion` 수집 | 품질 실행 등록·보고, `QualityCollectionService` | 운영에 어떤 확장 버전이 얼마나 퍼졌는지 관측한다 |
| 404 → `ENDPOINT_UNAVAILABLE` | `background-handler.ts`, `frontend/src/autofill/generic/generic-analysis.ts` | 새 확장이 구 백엔드의 없는 엔드포인트를 만나면 섹션 단위 기능 저하로 끝내고 멈추지 않는다 |

## 규칙

1. **응답 스키마 변경은 협상한다.** 기존 엔드포인트의 응답 구조·enum이 바뀌면 경로 버전(`/api/v2/...`)을 올리거나 `X-Career-Form-Capabilities` 값으로 새 스키마를 요청한 클라이언트에만 새 응답을 준다. 구 클라이언트에는 기존 스키마를 유지한다. 구 클라이언트의 검증기가 거부할 새 필드·enum 값을 기본 응답에 넣지 않는다.
2. **요청 변경은 nullable 추가로 한정한다.** 구 확장이 보내지 않는 필드는 서버가 null로 받아 기존 동작을 유지한다. 필수 필드 추가나 의미 변경은 새 경로 버전으로 한다.
3. **새 엔드포인트는 확장이 404를 처리한다.** 새 확장이 구 백엔드를 만나도 `ENDPOINT_UNAVAILABLE`로 강등되게 유지한다.
4. **릴리스 PR에 호환 매트릭스를 적는다.** 구 확장+신 백엔드, 신 확장+구 백엔드 두 조합에서 각각 무엇이 동작하고 무엇이 저하되는지, 그리고 그 근거(테스트 또는 probe)를 적는다.
5. **외부 사용자가 있으면 확장을 먼저 게시한다.** 새 확장 게시 → 품질 수집 `extensionVersion`으로 보급 확인 → 백엔드 main 병합. 규칙 1–3을 지켰다면 어느 순서든 안전하지만, 규칙 1을 지키지 못한 변경이 있을 때는 이 순서만 안전하다.

## 1.4.0 사례

- 백엔드 1.4.0은 Hplace 지원 사이트에 네이티브 v4 실행 정책을 `/api/v1/execution-policy` 응답으로 내려준다. 응답에 `nativeForm`, `sectionContracts`, 새 DERIVED enum(`HANJA_FULL_NAME`) 등 1.3.0 확장의 검증기가 모르는 구조가 들어 있다. CF-177 K39의 로컬 구 validator probe는 구 확장이 이 응답 전체를 `INVALID_RESPONSE`로 거부할 수 있음을 보였다. 실제 구 확장의 브라우저 종단 검증은 하지 않았다.
- 1.3.0 백엔드는 같은 사이트를 범용 경로로 처리했으므로, 백엔드를 먼저 올리면 구 확장 사용자는 Hplace 사이트에서 이전보다 나빠진다.
- 요청 DTO 변경(`InteractionDecisionRequest`의 `targetKind` 등)은 nullable 추가와 enum 값 추가라 구 확장 요청과 호환이다.
- 새 확장이 1.3.0 백엔드를 만나면 범용 분류·분석 엔드포인트 404를 `ENDPOINT_UNAVAILABLE`로 강등해 범용 섹션만 저하되고, Hplace 사이트는 범용 경로로 처리된다.
- 외부 사용자가 있어 확장 0.4.0을 2026-10-23에 먼저 게시하고 보급을 확인한 뒤 백엔드 1.4.0을 main에 병합하는 순서로 진행했다.
- 이 사례에서 규칙 1을 지키지 못한 이유는 v4 정책이 실행 정책 스키마 자체의 확장이었기 때문이며, 다음부터는 capability 값(예: `native-policy-v4`)을 요청한 확장에만 네이티브 정책을 내려주는 방식으로 협상한다.

## 근거

- `frontend/src/autofill/api/background-handler.ts`(capabilities 헤더, 404 표식), `frontend/src/autofill/generic/generic-analysis.ts`(`ENDPOINT_UNAVAILABLE`), `frontend/src/autofill/policy/background.ts`(응답 검증)
- `backend/src/main/java/com/careerform/formanalysis/api/PreparationAnalysisController.java`, `backend/src/main/java/com/careerform/formanalysis/dto/InteractionDecisionRequest.java`, `backend/src/main/java/com/careerform/quality/QualityCollectionService.java`
- `llm-wiki/raw/issues/CF-177/documents/contract-decisions.md` K39, `llm-wiki/raw/issues/CF-177/documents/adapter-hplace.md`
- [Hplace 활성 정책 버전은 설정값이다](hplace-active-policy-version.md)
