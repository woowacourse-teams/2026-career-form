import { executionPolicy } from "../../workflow/execution-policy";
import { createCollectionModule } from "./collection";
import { createWorkflowModule } from "./workflow";
import { createWriteModule } from "./write";
type Adapters = {
  collection: ReturnType<typeof createCollectionModule>["collectionAdapter"];
  workflow: ReturnType<typeof createWorkflowModule>["workflowAdapter"];
  write: ReturnType<typeof createWriteModule>["writeAdapter"];
};
const cache = new WeakMap<
  Document,
  { contract: unknown; adapters: Adapters }
>();
export function hiddenCodeAdapters(document: Document) {
  const contract = executionPolicy(document)?.browserPolicy?.hiddenCodeContract;
  if (
    !contract ||
    document.location.host !== contract.host ||
    document.location.pathname !== contract.path
  )
    return undefined;
  const previous = cache.get(document);
  if (previous?.contract === contract) return previous.adapters;
  const adapters = {
    collection: createCollectionModule(document, contract).collectionAdapter,
    workflow: createWorkflowModule(document, contract).workflowAdapter,
    write: createWriteModule(document, contract).writeAdapter,
  };
  cache.set(document, { contract, adapters });
  return adapters;
}
