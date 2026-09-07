import type {
  ActionCandidateHandle,
  CandidateBlockReason,
  CandidateLookup,
  FieldCandidateHandle,
} from "./types";

interface Registered<T> {
  handle: T;
  blockedReason?: CandidateBlockReason;
}

function liveBlockReason(element: Element): CandidateBlockReason | undefined {
  if (
    element instanceof HTMLElement &&
    (element.hidden ||
      element.closest("[hidden], [aria-hidden='true']") ||
      element.closest("[style*='display: none'], [style*='display:none']"))
  ) {
    return "hidden";
  }
  if (element instanceof HTMLElement && element.closest("[inert]")) {
    return "inert";
  }
  if (
    (element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLButtonElement ||
      element instanceof HTMLOptionElement) &&
    element.disabled
  ) {
    return "disabled";
  }
  if (
    (element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement) &&
    element.readOnly
  ) {
    return "readonly";
  }
  return undefined;
}

function elementSignature(element: Element): string {
  const input = element instanceof HTMLInputElement ? element.type : "";
  const name =
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
      ? element.name
      : "";
  return [element.tagName, input, element.id, name].join("|");
}

export function createStructuralSignature(elements: Element[]): string {
  return elements.map(elementSignature).join("||");
}

export class CandidateRegistry {
  private readonly actions = new Map<
    string,
    Registered<ActionCandidateHandle>
  >();
  private readonly fields = new Map<string, Registered<FieldCandidateHandle>>();
  private readonly fieldItemCounts = new Map<string, number>();
  private readonly fieldItemElements = new Map<string, Element[]>();

  private fieldItemKey(sectionId: string, itemGroupId?: string): string {
    return `${sectionId}::${itemGroupId ?? ""}`;
  }

  setFieldItemCount(
    sectionId: string,
    count: number,
    itemGroupId?: string,
  ): void {
    this.fieldItemCounts.set(this.fieldItemKey(sectionId, itemGroupId), count);
  }

  setFieldItemElements(
    sectionId: string,
    elements: Element[],
    itemGroupId?: string,
  ): void {
    this.fieldItemElements.set(
      this.fieldItemKey(sectionId, itemGroupId),
      elements,
    );
  }

  fieldItemCount(candidateId: string): number | undefined {
    const registered = this.fields.get(candidateId);
    if (!registered) return undefined;
    const itemGroupId = registered.handle.itemGroupId;
    const declaredCount = this.fieldItemCounts.get(
      this.fieldItemKey(registered.handle.sectionId, itemGroupId),
    );
    if (declaredCount !== undefined) return declaredCount;
    return new Set(
      [...this.fields.values()]
        .filter(
          ({ handle }) =>
            handle.sectionId === registered.handle.sectionId &&
            handle.itemGroupId === itemGroupId &&
            handle.itemId !== undefined,
        )
        .map(({ handle }) => handle.itemId),
    ).size;
  }

  registerAction(
    handle: ActionCandidateHandle,
    blockedReason?: CandidateBlockReason,
  ): void {
    this.actions.set(handle.candidateId, { handle, blockedReason });
  }

  registerField(
    handle: FieldCandidateHandle,
    blockedReason?: CandidateBlockReason,
  ): void {
    this.fields.set(handle.candidateId, { handle, blockedReason });
  }

  lookupAction(candidateId: string): CandidateLookup<ActionCandidateHandle> {
    return this.lookup(this.actions.get(candidateId));
  }

  lookupActionByIdentity(identity: {
    sectionId: string;
    displayName?: string;
    domId?: string;
    domName?: string;
  }): CandidateLookup<ActionCandidateHandle> {
    if (
      !identity.displayName &&
      !identity.domName &&
      !identity.domId
    ) {
      return { status: "unknown" };
    }
    const hasStableStructuralName =
      identity.domName !== undefined || identity.domId !== undefined;
    const matches = [...this.actions.values()].filter(
      ({ handle }) =>
        (hasStableStructuralName || handle.sectionId === identity.sectionId) &&
        (identity.displayName === undefined ||
          handle.candidate.displayName === identity.displayName) &&
        (identity.domName === undefined ||
          handle.candidate.domName === identity.domName) &&
        (identity.domId === undefined ||
          handle.candidate.domId === identity.domId ||
          (handle.candidate.domId === undefined &&
            identity.displayName !== undefined)),
    );
    if (matches.length !== 1) return { status: "unknown" };
    return this.lookup(matches[0]);
  }

  lookupField(candidateId: string): CandidateLookup<FieldCandidateHandle> {
    return this.lookup(this.fields.get(candidateId));
  }

  private lookup<T extends ActionCandidateHandle | FieldCandidateHandle>(
    registered: Registered<T> | undefined,
  ): CandidateLookup<T> {
    if (!registered) {
      return { status: "unknown" };
    }
    const elements =
      registered.handle.kind === "action"
        ? [registered.handle.element]
        : registered.handle.elements;
    if (
      elements.some((element) => !element.isConnected) ||
      createStructuralSignature(elements) !== registered.handle.signature
    ) {
      return { status: "stale" };
    }
    if (
      registered.handle.kind === "field" &&
      this.fieldItemElements
        .get(
          this.fieldItemKey(
            registered.handle.sectionId,
            registered.handle.itemGroupId,
          ),
        )
        ?.some((element) => !element.isConnected)
    ) {
      return { status: "stale" };
    }
    const currentBlockReason = [
      ...elements,
      ...(registered.handle.kind === "field"
        ? [...registered.handle.optionElements.values()]
        : []),
    ]
      .map(liveBlockReason)
      .find((reason) => reason !== undefined);
    if (registered.blockedReason || currentBlockReason) {
      return {
        status: "blocked",
        reason: registered.blockedReason ?? currentBlockReason!,
        handle: registered.handle,
      };
    }
    return { status: "ready", handle: registered.handle };
  }
}
