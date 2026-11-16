# 서버 HTTPS 도메인과 인증서

> Topic: https-domains
> Status: Current
> Current: [CF-429 서버 HTTPS 도메인과 확장 HTTPS 전환 준비](../../raw/issues/CF-429/documents/https-domains.md)
> History: [CF-429 서버 HTTPS 도메인과 확장 HTTPS 전환 준비](../../raw/issues/CF-429/documents/https-domains.md)
> Updated: 2026-11-09

## 현재 상태

2026-11-06부터 운영은 `https://career-form.duckdns.org`(운영 백엔드 18080), 개발은 `https://career-form-dev.duckdns.org`(개발 백엔드 18080), 스테이징은 `https://career-form-test.duckdns.org`(스테이징 백엔드 18081)로 응답한다. 개발과 스테이징은 같은 서버에서 Nginx `server_name`으로 나뉜다. 인증서는 Let's Encrypt이고 Certbot Nginx 플러그인으로 설치했으며 세 인증서 모두 2027-02-04(UTC)에 만료된다. 두 서버의 `certbot-renew.timer`가 켜져 있어 만료 30일 전부터 자동 갱신한다. Amazon Linux 2023에서는 Certbot을 설치해도 이 타이머가 꺼져 있으므로 직접 켜고 `enabled`를 확인한다.

HTTP→HTTPS 리다이렉트는 없다. 스토어 확장 1.5.0이 운영 IP의 `http://` origin을 쓰기 때문이다. Nginx 설정과 인증서는 서버 안에만 있고 저장소에는 없다.

HTTPS 전환 배포 때는 스토어 빌드의 `VITE_API_BASE_URL`을 HTTPS 도메인으로 바꾸고, `host_permissions` 변경에 따른 권한 재승인을 안내하고, 새 버전 보급을 확인한 뒤에 리다이렉트를 건다. 서버를 다시 만들면 Certbot 설치·도메인 설정·발급·타이머 켜기를 다시 한다. 단계별 목록은 근거 문서를 따른다.

## 변경 이유

서버 교체 뒤 확장과 관리 화면을 HTTPS로 쓰려고 세 환경에 도메인과 인증서를 붙였다. 도메인, 만료일, 서버 안에만 있는 설정, 나중 배포 순서가 어디에도 기록되지 않아 CF-429에서 남긴다.

## 관련 지식

- [확장 프로그램 릴리스](extension-release.md)
- [배포 Runbook](deployment-runbook.md)
- [확장·백엔드 호환 배포](release-compatibility.md)
