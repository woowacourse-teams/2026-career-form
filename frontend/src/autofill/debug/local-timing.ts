/** Local-only performance entries; no profile values or page contents. */
export function startLocalTiming(kind: string, detail: Record<string, string | number> = {}) {
  if (import.meta.env.VITE_LOCAL_WORKFLOW_DIAGNOSTICS !== "1" ||
      import.meta.env.VITE_API_BASE_URL !== "http://localhost:8080") return () => {};
  const start = performance.now();
  return () => {
    performance.measure(`CareerForm:${kind}`, {
      start, end: performance.now(), detail,
    });
  };
}
