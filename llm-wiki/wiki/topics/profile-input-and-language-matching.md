# 프로필 입력과 안전한 어학 선택

> Topic: profile-input-and-language-matching
> Status: Current
> Current: [ADR 500 등급표가 있는 어학 시험의 등급 표준값 선택](../../raw/issues/CF-500/documents/adr/500-language-grade-options.md)
> History: [CF-82 프로필 입력과 안전한 어학 선택](../../raw/issues/CF-82/documents/product/profile-input-and-language-matching.md); [ADR 500 등급표가 있는 어학 시험의 등급 표준값 선택](../../raw/issues/CF-500/documents/adr/500-language-grade-options.md)
> Updated: 2026-11-21

## 현재 상태

어학은 기본적으로 자유 텍스트로 보존한다. 예외로 등급표가 공식으로 고정된 10개 시험(OPIc, TOEIC Speaking, JLPT, TOPIK, HSK, HSKK, DELF, DALF, DELE, Goethe-Zertifikat)을 카탈로그에서 고르면 등급을 목록에서 골라 `<시험>:<코드>` 표준 ID로 저장한다(CF-500). 점수형 시험과 직접 입력한 시험명은 `등급·점수` 자유 입력이고, 기존 자유 입력 값은 바꾸지 않는다. 자동 기입은 등급 ID를 짧은 코드로 넘긴다. 결정 전문은 [ADR 500](../../raw/issues/CF-500/documents/adr/500-language-grade-options.md)을 따른다. 학력은 제한된 선택지를 표준 ID로 저장한다. 표준 ID의 회사 옵션 선택은 현재 페이지에서 수집한 명시적 별칭 후보가 정확히 하나일 때만 허용한다.

## 변경 이유

채용 사이트별 어학 표현 차이를 프로필 입력에 억지로 맞추지 않으면서도, 자동 입력은 불확실한 선택을 하지 않게 한다.

등급표가 실제로 나뉜 시험은 직접 입력 대신 등급 중에서 고르자는 사용자 의견으로 CF-82의 '어학 자유 텍스트' 결정을 등급표 시험에 한해 바꿨다. 적용 범위(급수 시험까지)와 점수 처리(등급만)는 사용자가 정했다(CF-500).
