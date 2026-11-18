# 이력서 파일로 프로필 가져오기

> Issue: [CF-470](https://github.com/woowacourse-teams/2026-career-form/issues/470)
> Collected: 2026-11-17
> Approval-Digest: 102f649b7554e03c10a1f9639801231e7738df4302b109d0015a44049c931c54
> Source-Revision: ddb3ee8f

[승인 후보 스냅샷](approved-candidates.md)의 후보 1, 2, 3과 후보 4의 Console 기록 부분을 확장 쪽 이력서 가져오기 기준으로 옮겼다. 서버 변환(#469)의 계약은 이 문서의 범위가 아니다.

## 흐름

- 패널(Chrome 사이드 패널과 지원서 안 패널)의 `프로필 가져오기`는 출처 고르기(지원서 화면, 이력서 파일)로 시작한다. 지원서 화면은 Greeting 지원서에서만 고를 수 있고 고르면 기존 지원서 가져오기가 열린다.
- 이력서 파일은 OS 파일 창을 바로 연다. 온보딩 이름 단계 카드에도 같은 진입 버튼이 있다. 온보딩 Greeting 단계의 가져오기 장면은 출처 고르기에서 지원서 화면을 누르는 흐름을 보여 준다.
- PDF, MD, TXT 글자는 확장 안에서 추출한다. 5MB 초과, 20000자 초과, 글자 없는 PDF, 지원하지 않는 형식은 서버 요청 없이 거절한다.
- 전송 안내에서 계속을 눌러야 #469 API로 보낸다. 초안은 기존 page-import 확인 화면과 병합 규칙으로 저장한다.
- 카탈로그 필드는 카탈로그 검색이 하나로 맞춘 값만 채우고 못 맞추면 비운다.
- 파일과 추출 글자는 저장하지 않는다.

## 날짜

서버 초안의 날짜는 `YYYY-MM-DD` 또는 일이 없을 때 `YYYY-MM`이다. `YYYY-MM`은 `YYYY-MM-01`로 저장하고 확인 화면 그 항목에 `일 확인` 표시를 붙인다. 연도만 있거나 형식이 틀린 날짜는 비운다.

## PDF 글자 추출 포함 방식

- pdfjs-dist legacy 빌드(manifest 최소 Chrome 121 대응) 두 파일과 packed CMap 전체(`cmaps/*.bcmap` 168개와 LICENSE, 1,167,747 B)를 빌드에 그대로 복사하고 web_accessible_resources(`pdfjs/cmaps/*` 포함)에 둔다.
- `cMapUrl`은 확장 내부 경로만 쓰고 `cMapPacked`를 켠다.
- 확장 페이지는 같은 출처 Worker를 쓰고, 지원서 안 패널(content script)은 worker 모듈을 `globalThis.pdfjsWorker`로 불러 main thread에서 처리한다.
- content script 번들에는 pdf.js를 넣지 않으며 `assert-build`가 파일, 노출 설정, CMap 전체 포함을 검사한다.

## Console 기록

접두사는 `[CareerForm resume-import]`이고 단계는 `file_read`, `text_extract`, `server_request`, `catalog_match`, `save`다. 파일 형식, 글자 수, 범주별 초안 건수, 카탈로그 맞춘·비운 건수, 형식 오류 건수, 연월 날짜 건수(`monthDates`), 저장 건수, 실패 사유 코드만 남기고 값, 파일 이름, 글자는 남기지 않는다.
