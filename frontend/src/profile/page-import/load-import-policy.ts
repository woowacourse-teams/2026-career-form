import type { SiteDescriptor } from "../../autofill/api/types";
import {
  executionPolicy,
  installExecutionPolicy,
  type ExecutionPolicy,
} from "../../autofill/workflow/execution-policy";

type PolicyLoader = (
  site: SiteDescriptor,
) => Promise<ExecutionPolicy | undefined>;

/**
 * Greeting forms are read through the same DB-managed execution policy as
 * autofill. Only the page host and path are sent; form values never leave the page.
 * Without a policy nothing is installed and the reader reports an unrecognized page.
 */
export async function prepareImportPolicy(
  document: Document,
  load: PolicyLoader | undefined,
): Promise<void> {
  if (executionPolicy(document) || !load) return;
  const url = new URL(document.URL);
  const policy = await load({ host: url.host, pathPattern: url.pathname });
  if (policy) installExecutionPolicy(document, policy);
}
