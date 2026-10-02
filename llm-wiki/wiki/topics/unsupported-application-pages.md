# 미지원 지원서 페이지 안내

> Topic: unsupported-application-pages
> Status: Current
> Current: [CF-147 미지원 지원서 페이지 중단 계약](../../raw/issues/CF-147/documents/unsupported-application-pages.md)
> History: [CF-147 미지원 지원서 페이지 중단 계약](../../raw/issues/CF-147/documents/unsupported-application-pages.md)
> Updated: 2026-10-02

## 현재 상태

준비 분석이 `GENERIC`이고 `LLM_UNAVAILABLE` 경고를 포함하면 미지원 안내 단계에서
종료한다. 필드 분석과 지원서 DOM 변경을 하지 않으며 수동 복사는 유지한다.
경고 없는 `GENERIC`과 `ADAPTER` 흐름은 기존대로 진행한다.

## 변경 이유

범용 기입을 끈 환경에서 다음 분석 단계로 진행하지 않고 미지원 상태를 사용자에게
명확히 안내한다.
