# 이력서 파일로 프로필 가져오기

> Topic: resume-file-import
> Status: Current
> Current: [CF-470 이력서 파일로 프로필 가져오기](../../raw/issues/CF-470/documents/resume-file-import.md)
> History: [CF-470 이력서 파일로 프로필 가져오기](../../raw/issues/CF-470/documents/resume-file-import.md)
> Updated: 2026-11-17

## 현재 상태

패널의 `프로필 가져오기`는 출처 고르기(지원서 화면, 이력서 파일)로 시작하고, 이력서 파일은 OS 파일 창을 바로 연다. 온보딩 이름 단계 카드에도 같은 버튼이 있고, 온보딩 Greeting 단계 장면은 출처 고르기에서 지원서 화면을 누르는 흐름을 보여 준다.

PDF, MD, TXT 글자는 확장 안에서 추출한다. 5MB 초과, 20000자 초과, 글자 없는 PDF, 지원하지 않는 형식은 서버 요청 없이 거절한다. 전송 안내에서 계속을 눌러야 서버(#469 API)로 보내고, 초안은 기존 Greeting 가져오기와 같은 확인 화면과 병합 규칙으로 저장한다. 카탈로그 필드는 카탈로그 검색이 하나로 맞춘 값만 채운다. 파일과 추출 글자는 저장하지 않는다.

날짜는 `YYYY-MM-DD` 또는 `YYYY-MM`으로 온다. `YYYY-MM`은 `YYYY-MM-01`로 저장하고 확인 화면에 `일 확인` 표시를 붙이며, 연도만 있거나 형식이 틀린 날짜는 비운다.

pdf.js는 pdfjs-dist legacy 빌드 두 파일과 packed CMap 전체를 확장에 그대로 넣어 확장 안에서만 불러온다. 확장 페이지는 같은 출처 Worker, 지원서 안 패널은 main thread에서 처리한다. Console 기록은 접두사 `[CareerForm resume-import]`의 다섯 단계이고 값, 파일 이름, 글자는 남기지 않는다. 계측 이벤트는 [선택적 이용 계측](usage-analytics.md)을 따른다.

서버 쪽 변환 계약과 검증 규칙은 #469에서 정한다.

## 변경 이유

첫 사용자가 이미 가진 이력서 문서로 프로필 초안을 만들어 첫 등록을 빠르게 하려고 더했다(CF-470). 표준 CMap 이름만 가진 한글 PDF도 읽도록 CMap 전체를 넣었고, 일 없이 연월만 적은 이력서가 많아 연월 날짜를 1일로 채우고 표시하기로 2026-11-17 사용자가 결정했다.
