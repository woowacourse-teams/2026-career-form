# 품질 관측 호출의 인터럽트 처리

## 실행 기준

품질 관측은 호출자가 이미 인터럽트된 경우 작업 제출 전에 null을 반환하고 인터럽트 상태를 보존한다. 제출 후 인터럽트는 기존 InterruptedException 처리와 미완료 작업 취소를 유지한다.

## 회귀 검증

완료 Future를 고정한 테스트로 빠른 완료와 인터럽트 사이의 경쟁을 재현하고 실제 실행기로 제출 후 인터럽트와 취소를 검증한다.

## 구현 근거

- `backend/src/main/java/com/careerform/quality/QualityObservationExecutor.java`: observe의 제출 전 isInterrupted 검사와 기존 예외 처리 및 취소 경로.
- `backend/src/test/java/com/careerform/quality/QualityObservationExecutorTest.java`: 완료 Future를 반환하는 실행기 경계에서 null 반환, 인터럽트 보존과 submit 미호출을 검증한다. 실제 작업 스레드가 호출자를 인터럽트하고 완료를 막는 테스트로 취소와 다음 관측 실행을 확인한다.

실제 develop 배포 성공 여부는 로컬 자동 검증과 구분한다.
