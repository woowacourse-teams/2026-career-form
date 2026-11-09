# 비회원 분석 자격의 환경별 활성화와 API 이용

> Topic: anonymous-admission-activation
> Status: Current
> Current: [CF-359 환경별 활성화와 API 이용 절차](../../raw/issues/CF-359/documents/anonymous-admission-activation.md)
> History: [CF-359 환경별 활성화와 API 이용 절차](../../raw/issues/CF-359/documents/anonymous-admission-activation.md)
> Updated: 2026-11-09

## 현재 상태

환경별 목표 정책은 dev 비활성, staging 활성, prod 전환 후 활성이다. 이 정책의 확정이 실제 환경에서의 활성화를 뜻하지 않는다. 배포 workflow의 deploy job, Compose와 Spring 사이에 네 설정 전달 경로를 연결했다. 활성화 값이 없거나 비어 있으면 보호는 OFF다. 암호화 키는 deploy job에만 전달한다. GitHub 설정 등록과 실제 런타임 활성화는 별개이며, 프록시 전제와 운영 활성화 완료는 확인되지 않았다.

prod 전환은 등록 API만 먼저 제공하고 해당 환경의 자격을 사용하는 확장을 배포한 뒤 분석 자격 검사와 AI 호출 제한을 활성화한다. 기존 확장은 자격 없이 분석하면 활성화 뒤 거절된다. dev는 서버의 두 활성화 값과 확장 플래그를 false로 유지한다. staging은 HTTPS, 프록시와 환경별 확장을 준비한 뒤 활성화하고 prod 전환 전에 검증한다. 관리자 AI 평가는 dev에서만 운영하며 설치 보호와 동시에 활성화하면 서버 시작을 거부한다.

보호 대상은 POST /api/v1/preparation/analyze, /api/v1/fields/analyze, /api/v1/generic/sections/classify, /api/v1/generic/fields/analyze, /api/v1/generic/interaction-decisions다. 정상 프록시 및 HTTPS 조건에서 UUID 또는 토큰 누락, 잘못된 조합과 폐기 자격은 401 INVALID_INSTALLATION으로 거절한다. 정책 처리만 수행해도 분석 자격은 확인하며 실제 AI 호출이 없으면 AI 이용량은 차감하지 않는다.

토큰은 확장 설치 직후가 아니라 첫 분석 요청 전에 발급하고 로컬에 저장해 재사용한다. 직접 API 테스트도 해당 환경의 등록 API에서 먼저 자격을 발급받는다. 알림의 기존 구독 검증과 로컬 프로필 편집은 이번 분석 자격과 분리한다. 자격 저장은 현재 서버 주소별로 나뉘지 않으므로 로컬 검증 환경과 prod를 같은 확장 설치에서 주소만 바꿔 테스트하지 않는다.

## 변경 이유

초기 구현의 기본 비활성 상태와 배포 후 활성화를 구분하고, 사람이 제공할 설정과 환경별 검증 절차 및 인증 실패 범위를 명시한다.

## 관련 문서

- [비회원 설치 식별과 AI 호출 제어](anonymous-analysis-admission.md)

## 설정 연결 보완

2026-11-09 설정 전달 누락을 수정했다. 코드 연결은 실제 활성화와 다르다. 당시 production의 등록 플래그는 true지만 TRUSTED_PROXIES Variable은 없어 배포 전 키, 프록시와 HTTPS를 준비하거나 등록도 false로 둬야 한다. 실제 환경값 변경과 배포, Secret 값 검증은 수행하지 않았다. 검증은 합성 Compose 렌더링과 실제 Spring YAML 해석을 사용했다.
