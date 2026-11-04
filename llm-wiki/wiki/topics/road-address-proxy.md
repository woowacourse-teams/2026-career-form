# 도로명주소 검색 프록시

> Topic: road-address-proxy
> Status: Current
> Current: [도로명주소 검색 프록시 ADR](../../raw/issues/CF-392/documents/adr/392-road-address-proxy.md)
> History: [도로명주소 검색 프록시 ADR](../../raw/issues/CF-392/documents/adr/392-road-address-proxy.md)
> Updated: 2026-11-04

## 현재 상태

확장은 `POST /api/v1/address/search`로 백엔드를 거쳐 행정안전부 도로명주소 API를 검색한다. 승인키는 서버 환경 설정에만 두고, 검색어는 개인정보로 다뤄 URL, 로그, 지표, 트레이스, 오류 응답과 캐시에 남기지 않는다. 외부 실패는 고정 오류 하나로 바꾸고 클라이언트별 메모리 고정 창 제한을 둔다.

## 변경 이유

프로필 주소를 표준화하려면 확장에서 주소를 검색해야 하지만 승인키를 확장에 넣을 수 없고 MV3는 원격 스크립트를 금지한다. 상세 근거와 대안은 ADR을 따른다. ADR은 제안됨 상태이며 사람 승인은 PR 검토에서 받는다.
