export function observeQuality(observe: () => unknown): void {
  try {
    const result = observe();
    if (result instanceof Promise) {
      void result.catch(() =>
        console.warn("QUALITY_LOCAL_OBSERVATION_UNAVAILABLE"),
      );
    }
  } catch {
    console.warn("QUALITY_LOCAL_OBSERVATION_UNAVAILABLE");
  }
}
