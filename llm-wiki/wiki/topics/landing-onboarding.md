# 랜딩·온보딩 웹 페이지

> Topic: landing-onboarding
> Status: Current
> Current: [CF-384 AI 자동 기입 스크롤 장면과 직접 체험 중심의 랜딩](../../raw/issues/CF-384/documents/landing-onboarding.md)
> History: [CF-96 근거](../../raw/issues/CF-96/documents/landing-onboarding.md), [CF-193 단계형 프로필 등록 온보딩](../../raw/issues/CF-193/documents/landing-onboarding.md), [CF-363 설치 없이 체험하기와 기술 소개](../../raw/issues/CF-363/documents/landing-onboarding.md), [CF-384 AI 자동 기입 스크롤 장면과 직접 체험 중심의 랜딩](../../raw/issues/CF-384/documents/landing-onboarding.md)
> Updated: 2026-11-02

## 현재 상태

랜딩은 히어로와 AI 자동 기입 4단계(칸 읽기, 칸 의미 판단, 프로필 값 채우기, 애매한 칸 확인 요청)를 화면 고정 스크롤 장면으로 보여주고, 바로 아래 10칸 가상 지원서와 간이 패널로 된 직접 체험, 마감 알림 장면(하루 전 알림, 지원 완료 시 남은 알림 취소), 안심 포인트·설치 버튼·FAQ 순서로 둔다. 체험은 자동 기입을 누르기 전까지 아래 스크롤을 붙잡고 건너뛰기를 두며, 700px 이하에서는 붙잡지 않고 링크 보내기와 설치 버튼을 보인다. 연출은 미리 렌더한 클레이 webp와 transform/opacity만 쓰고 동작 줄이기 설정에서는 단계가 움직임 없이 바뀐다. 기술 소개와 정책 페이지도 같은 디자인이며 정책의 문의 이메일은 `개설 후 기재`다. 모든 사이트 페이지는 앵커가 없으면 맨 위에서 열린다.

`/try/`는 CF-363대로 실제 사이드패널 UI로 체험하는 페이지로 남고, 확장 온보딩은 CF-193의 단계형 프로필 등록을 따른다. 체험 시작·완료는 `trial_*` 이벤트로 `surface`만 기록한다. 독립 웹 빌드와 가상 데이터 경계를 유지하고, 정책 문서는 미시행 초안이며 사이트 공개 배포는 아직 없다.

## 변경 이유

문구와 장식 요소가 많아 핵심이 묻혔고, AI로 칸의 의미를 읽어 채운다는 점과 체험이 소개 흐름에 드러나지 않았다. 스크롤 장면으로 AI 동작을 보여준 뒤 같은 지원서에서 바로 눌러보게 해 설치 결정으로 잇는다.
