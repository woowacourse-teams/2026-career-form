// Local active policy snapshot captured 2026-10-14: SK v37, Hyundai v24, Greeting v17.
// 2026-10-22 (CF-310): SK v38 — the high-school add rule re-identifies by the status
// select. The SK and Greeting disability aliases live in the server fieldRules only,
// so this snapshot keeps Greeting v17.
// Contains policy configuration only. Tests must run without a database connection.
// Refresh this snapshot alongside tests when the active execution-policy contract changes.
import { beforeEach, afterEach } from "vitest";
import activePolicies from "./active-execution-policies.json";
import provider from "../../../../backend/src/main/resources/policies/address-provider-v1.json";
import {
  installExecutionPolicy,
  type ExecutionPolicy,
} from "../../autofill/workflow/execution-policy";
export type FixtureSite = "sk" | "hyundai" | "greeting";
export function fixturePolicy(site: FixtureSite): ExecutionPolicy {
  return structuredClone({
    ...activePolicies[site].executionPolicy,
    providerPolicy: provider,
  }) as unknown as ExecutionPolicy;
}
/** Explicit policy installation for engine tests. Production never infers policies from test URLs. */
export function usePolicyFixture(site: FixtureSite) {
  const url =
    site === "sk"
      ? "https://www.skcareers.com/Application/Index/fixture"
      : site === "hyundai"
        ? "https://talent.hyundai.com/apply/applyWrite.hc"
        : "https://fixture.career.greetinghr.com/apply";
  const runtimeNow = (
    globalThis as unknown as {
      jsdom?: { reconfigure(options: { url: string }): void };
    }
  ).jsdom;
  runtimeNow?.reconfigure({ url });
  installExecutionPolicy(document, fixturePolicy(site));
  let restore: (() => void) | undefined;
  beforeEach(() => {
    const runtime = (
      globalThis as unknown as {
        jsdom?: { reconfigure(options: { url?: string }): void };
      }
    ).jsdom;
    runtime?.reconfigure({ url });
    const install = () => {
      const host = new URL(document.URL).hostname;
      const matches =
        site === "sk"
          ? host === "www.skcareers.com"
          : site === "hyundai"
            ? ["talent.hyundai.com", "career.hyundai-autoever.com"].includes(
                host,
              )
            : host.endsWith(".greetinghr.com");
      installExecutionPolicy(
        document,
        matches ? fixturePolicy(site) : undefined,
      );
    };
    if (runtime) {
      const original = runtime.reconfigure.bind(runtime);
      runtime.reconfigure = (options) => {
        original(options);
        install();
      };
      restore = () => {
        runtime.reconfigure = original;
      };
    }
    install();
  });
  afterEach(() => {
    installExecutionPolicy(document);
    restore?.();
  });
}

/** Register the same site-keyed policy the API loader installs, for API contract tests. */
export function installSiteFixture(
  site: FixtureSite,
  host: string,
  pathPattern: string,
) {
  const page = document.implementation.createHTMLDocument("policy fixture");
  Object.defineProperty(page, "URL", {
    value: `https://${host}${pathPattern}`,
  });
  installExecutionPolicy(page, fixturePolicy(site));
  return () => installExecutionPolicy(page);
}
