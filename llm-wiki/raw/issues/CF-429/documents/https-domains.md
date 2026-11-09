# 서버 HTTPS 도메인과 확장 HTTPS 전환 준비

> Issue: [CF-429](https://github.com/woowacourse-teams/2026-career-form/issues/429)
> Collected: 2026-11-09
> Approval-Digest: 3de776138edcbbd38fb265a268b202b1c658876fb218ac4c59ffe022a3604c74
> Source-Revision: b0cb4e1

## 도메인과 연결 대상 (2026-11-06 적용)

| 도메인 | 서버 | Nginx 연결 대상 | 인증서 만료(UTC) |
| --- | --- | --- | --- |
| `career-form.duckdns.org` | 운영 앱 서버 | 운영 백엔드 `127.0.0.1:18080` | 2027-02-04 01:20 |
| `career-form-dev.duckdns.org` | 개발·스테이징 앱 서버 | 개발 백엔드 `127.0.0.1:18080` | 2027-02-04 02:48 |
| `career-form-test.duckdns.org` | 개발·스테이징 앱 서버 | 스테이징 백엔드 `127.0.0.1:18081` | 2027-02-04 02:48 |

- DNS는 DuckDNS가 관리하고, 각 도메인은 해당 서버의 탄력적 IP를 가리킨다. 개발과 스테이징은 같은 서버이며 Nginx가 요청 도메인(`server_name`)으로 백엔드를 나눈다.
- 인증서는 Let's Encrypt이고 Certbot Nginx 플러그인(`certbot --nginx --no-redirect`)으로 발급·설치했다. 인증서는 도메인마다 따로 있고 유효기간은 90일이다.
- 운영 서버는 기존 `conf.d/career-form-default.conf`의 `server_name`에 운영 도메인을 넣었다. 개발·스테이징 서버는 `conf.d/career-form-domains.conf`를 새로 두고 dev·test 가상 호스트를 정의했다. IP로 접속하는 기본 서버와 내부 품질 통계 경로(`quality-staging.conf`, 포트 18082)는 그대로다.
- 변경 전 Nginx 설정은 두 서버 모두 `/etc/nginx.before-certbot-20261106`에 백업했다.
- 이 Nginx 설정과 인증서는 서버 안에만 있고 저장소에는 없다. 서버를 새로 만들면 아래 재설정 절차를 다시 해야 한다.

## 자동 갱신

- 두 서버 모두 `certbot-renew.timer`를 `enable --now`로 켰다. Certbot은 만료 30일 전부터 갱신한다.
- Amazon Linux 2023의 `certbot` 패키지는 타이머를 설치만 하고 켜지 않는다. 발급 메시지는 "예약 작업을 설정했다"고 하지만 타이머는 `disabled`였다. 설치 뒤에는 `systemctl is-enabled certbot-renew.timer`가 `enabled`인지 확인한다.
- 2026-11-06 `sudo certbot renew --dry-run --no-random-sleep-on-renew`가 세 인증서 모두 성공했다.

## HTTP 상태

- HTTP를 HTTPS로 넘기는 리다이렉트는 없다. 세 도메인과 기존 IP 주소 모두 HTTP와 HTTPS를 받는다.
- 스토어에 게시한 확장 1.5.0은 운영 서버 IP의 `http://` origin으로 빌드되어 있다. 리다이렉트를 먼저 걸면 이 버전의 요청이 실패할 수 있다.

## HTTPS 전환 배포 때 할 일

1. 운영 스토어 빌드의 `VITE_API_BASE_URL`을 `https://career-form.duckdns.org`로 지정하고, ZIP의 `host_permissions`에 이 origin이 들어갔는지 확인한다.
2. `host_permissions` origin이 바뀌므로 기존 사용자에게 권한 재승인 요청이 뜰 수 있다. 스토어 제출 메모와 공지에 적는다. 제출·심사·게시는 사람이 한다.
3. 개발 확인 빌드는 `https://career-form-dev.duckdns.org`, 스테이징 확인 빌드는 `https://career-form-test.duckdns.org`를 쓴다. 스테이징 확인에 SSH 터널은 필요 없다.
4. 새 버전 보급을 품질 수집의 `extensionVersion` 분포로 확인한 뒤에만 Nginx에 HTTP→HTTPS 리다이렉트를 건다. 리다이렉트는 별도 작업이다.
5. 서버를 다시 만들면 Certbot 설치, 도메인별 `server_name` 설정, 인증서 발급, `certbot-renew.timer` 켜기를 다시 한다. 2GB 메모리 서버에서 백엔드 두 개가 떠 있을 때 `dnf install`이 서버를 멈춘 적이 있다(원인 미확정). 이때는 다른 서버에서 `dnf download`로 받은 같은 버전 RPM을 `rpm -Uvh`로 설치한다.
6. 만료 전에 갱신이 되었는지 `sudo certbot certificates`로 만료일을 확인한다. 첫 갱신 예정 시기는 2027-01 초다.

## 유지되는 경계

- 인증서 개인키, 계정, 시크릿은 기록하지 않는다.
- 확장 코드와 백엔드 코드는 이 기록 시점에 바꾸지 않았다. 코드 변경은 CF-429 범위다.
