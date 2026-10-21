import { pathToFileURL } from "node:url";

/** Returns Korean error messages for env flags that must not ship. */
export function releaseFlagViolations(env) {
  const violations = [];
  if (
    String(env.VITE_AUTOFILL_DEBUG ?? "")
      .trim()
      .toLowerCase() === "true"
  ) {
    violations.push(
      "VITE_AUTOFILL_DEBUG=true 상태로는 배포용 ZIP을 만들 수 없습니다. 이 플래그는 원본 값을 콘솔에 출력합니다. 플래그를 해제한 뒤 다시 실행해 주세요.",
    );
  }
  return violations;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const violations = releaseFlagViolations(process.env);
  if (violations.length > 0) {
    for (const message of violations) console.error(message);
    process.exit(1);
  }
}
