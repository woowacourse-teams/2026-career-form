import type { FieldCandidateHandle } from "../dom/types";
import { executionPolicy } from "../workflow/execution-policy";
import { sameAddressNodes, stagedAddressNodes } from "./staged-address-dom";
import { visible } from "./primitives";
type Nodes = NonNullable<ReturnType<typeof stagedAddressNodes>>;
const receipts = new WeakMap<
  Element,
  { nodes: Nodes; values: string[]; url: string; policy: string }
>();
export function recordStagedAddress(nodes: Nodes) {
  receipts.set(nodes.row, {
    nodes,
    values: nodes.fields.map((f) => f.value),
    url: nodes.row.ownerDocument.URL,
    policy: JSON.stringify(executionPolicy(nodes.row.ownerDocument)),
  });
}
export function stagedAddressReceipt(handle: FieldCandidateHandle) {
  const document = handle.elements[0]?.ownerDocument;
  if (!document) return;
  const n = stagedAddressNodes(document);
  if (!n) return;
  const index = n.policy.fields.findIndex(
    (f) =>
      f.name === handle.candidate.domName ||
      f.legacyName === handle.candidate.domName,
  );
  if (
    index < 0 ||
    handle.elements.length !== 1 ||
    handle.elements[0] !== n.fields[index] ||
    handle.isCurrentContext?.() === false
  )
    return;
  const receipt = receipts.get(n.row);
  if (
    !receipt ||
    receipt.url !== document.URL ||
    receipt.policy !== JSON.stringify(executionPolicy(document)) ||
    !sameAddressNodes(receipt.nodes, n) ||
    !n.fields.every((f, i) => !!f.value && f.value === receipt.values[i]) ||
    n.postcode.textContent?.trim() !== receipt.values[0]
  )
    return;
  return {
    index,
    value: receipt.values[index],
    display: index === 0 ? n.postcode : n.fields[index],
    visible: visible(index === 0 ? n.postcode : n.fields[index], true),
  };
}
