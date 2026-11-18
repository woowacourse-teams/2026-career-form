/** Opt-in diagnostics for a localhost build; never include profile or page values. */
export function localWorkflowLog(
  phase: string,
  detail: Record<string, string | number | boolean | undefined>,
): void {
  if (
    import.meta.env.VITE_LOCAL_WORKFLOW_DIAGNOSTICS !== "1" ||
    import.meta.env.VITE_API_BASE_URL !== "http://localhost:8080"
  )
    return;
  // 객체 대신 글자로 남겨, 접힌 콘솔이나 외부 도구에서도 그대로 읽히게 한다.
  console.debug("[CareerForm local workflow]", phase, JSON.stringify(detail));
  // Local QA bridge: the isolated content-script console is not always
  // observable from tooling, so mirror the same value-free phase to the page.
  try {
    window.postMessage({ careerFormLocalLog: phase, detail }, "*");
  } catch {
    // A page without messaging support simply keeps the console line.
  }
}
