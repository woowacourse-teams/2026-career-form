# 확장·백엔드 호환 배포

> Topic: release-compatibility
> Status: Current
> Current: [CF-327 호환 배포 순서와 API 호환 규칙 근거](../../raw/issues/CF-327/documents/release-compatibility.md)
> History: [CF-327 호환 배포 순서와 API 호환 규칙 근거](../../raw/issues/CF-327/documents/release-compatibility.md)
> Updated: 2026-10-23

## 현재 상태

확장과 백엔드는 배포 시점이 다르므로 "구 확장 + 신 백엔드"와 "신 확장 + 구 백엔드" 조합이 반드시 생기고, 외부 사용자가 있는 한 이 창을 없앨 수 없다. 현재 호환 장치는 `/api/v1` 경로, `X-Career-Form-Capabilities` 요청 헤더(`address-search-v1`, `quality-v2`), 품질 수집의 `extensionVersion`, 새 확장이 없는 엔드포인트의 404를 `ENDPOINT_UNAVAILABLE`로 강등하는 처리다.

규칙: 응답 스키마가 바뀌면 경로 버전 또는 capability 협상으로 구 클라이언트에 기존 스키마를 유지하고, 요청 변경은 nullable 추가로 한정하며, 새 엔드포인트는 확장이 404를 처리하게 유지하고, 릴리스 PR에 FE/BE 호환 매트릭스를 기록한다. 외부 사용자가 있으면 새 확장 게시 → `extensionVersion`으로 보급 확인 → 백엔드 배포 순서를 따른다.

1.4.0 사례: Hplace v4 네이티브 정책이 `/api/v1/execution-policy` 응답 스키마를 버전 표시 없이 바꿔 구 확장이 응답 전체를 거부할 수 있었다(로컬 validator probe 근거, 브라우저 종단 검증 아님). 요청 DTO 변경은 nullable 추가라 호환이었다. 외부 사용자가 있어 확장 0.4.0을 먼저 게시한 뒤 백엔드를 main에 병합했다. v4 활성화는 설정 기본값이라 운영에서 끌 수 없으므로 이 순서가 유일한 제어 수단이었다. 다음부터는 capability 값을 요청한 확장에만 네이티브 정책을 내려주는 협상을 쓴다.

## 변경 이유

CF-177 K39가 Hplace v4에 한정해 정한 배포 순서가 topic Wiki에 배포 규칙으로 정리되지 않았고, 1.4.0에서 API 버전을 명시하지 못한 채 응답 스키마가 바뀌었다. 같은 일이 반복되지 않도록 현재 장치와 규칙, 사례를 한 topic에 모은다.

## 관련 지식

- [배포 Runbook](deployment-runbook.md)
- [확장 프로그램 릴리스](extension-release.md)
- [Hplace 공통 어댑터](adapter-hplace.md)
- [범용 endpoint 부재의 frontend 오류 전달](generic-endpoint-unavailable.md)
- [지원서 분석 API](application-form-analysis-api.md)
