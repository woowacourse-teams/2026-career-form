# CF-337 approved candidates (2026-10-24, seeder 활성 정책 버전 동기화)

1. 정책 활성 버전의 정본은 DB가 아니라 배포 커밋의 seed다. 기동 seeder가 모든 환경에서 DB 활성 버전을 seed와 같게 맞추므로, develop→dev, release→staging, main→운영 흐름에서 각 환경은 자기 배포 커밋의 버전을 주고 롤백 재배포 시 함께 되돌아간다. 사람이 DB에서 바꾼 값은 다음 기동에서 되돌아간다. 운영 배포 승인이 전환 승인이며 수동 Mongo 전환 절차는 폐기한다.
2. 릴리스 점검의 4값 대조(배포 커밋, seed 버전, DB 버전, API 응답) 중 seed·DB 버전은 `GET /api/v1/policy-versions`로 읽는다. 지켜야 할 규칙은 둘이다. 정책 내용을 바꾸면 버전 번호를 올리고, seed에는 활성 버전의 정책 문서를 항상 포함한다.
