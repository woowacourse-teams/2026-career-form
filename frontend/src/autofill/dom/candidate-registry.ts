import { displayState, withDomReadPass } from "./read-pass";
import { localWorkflowLog } from "../debug/local-workflow";
import {
  captureControlState,
  controlIdentity,
  correspondingControls,
  isWritableWriteElement,
} from "./write-target";
import { targetOnlyRadio } from "../policy/radio-validation";
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
  if (element instanceof HTMLElement) {
    const view = element.ownerDocument.defaultView;
    for (
      let current: Element | null = element;
      current;
      current = current.parentElement
    ) {
      const style = displayState(current);
      if (style?.display === "none" || style?.visibility === "hidden") {
        return "hidden";
      }
    }
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
    (element.disabled || element.matches(":disabled"))
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
  private readonly replacementState = new Map<
    string,
    {
      before: ReturnType<typeof captureControlState>;
      contextCurrent: () => boolean;
      row?: Element;
    }
  >();

  isLegacyField(candidateId: string): boolean {
    return this.fields.get(candidateId)?.handle.owner === "legacy";
  }

  /** Called once before the batch, while collected row callbacks are valid. */
  captureReplacementState(): void {
    this.replacementState.clear();
    for (const [id, { handle }] of this.fields) {
      if (this.lookupField(id).status === "stale") continue;
      const rows = this.fieldItemElements.get(
        this.fieldItemKey(handle.sectionId, handle.itemGroupId),
      );
      const row =
        handle.itemIndex !== undefined ? rows?.[handle.itemIndex] : undefined;
      const parents = (rows ?? []).map((element) => ({
        element,
        parent: element.parentElement,
        siblings: Array.from(element.parentElement?.children ?? []),
      }));
      const kinds = handle.mixedSectionRow?.group.kindSelects.map((select) => ({
        select,
        value: select.value,
      }));
      const rowChoices = () =>
        (rows ?? []).flatMap((element) =>
          Array.from(
            element.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
              "select, input[type='radio']",
            ),
          ),
        );
      const choicesBefore = captureControlState(rowChoices());
      const contextWasCurrent = handle.isCurrentContext?.() !== false;
      this.replacementState.set(id, {
        before: captureControlState(handle.elements),
        ...(row ? { row } : {}),
        contextCurrent: () =>
          contextWasCurrent &&
          (!handle.isCurrentContext || !!row) &&
          ((handle.itemId === undefined && handle.itemIndex === undefined) ||
            (!!row && rows?.length === this.fieldItemCount(id))) &&
          parents.every(
            ({ element, parent, siblings }) =>
              element.isConnected &&
              element.parentElement === parent &&
              parent?.children.length === siblings.length &&
              siblings.every((sibling, index) => parent.children[index] === sibling),
          ) &&
          (kinds?.every(
            ({ select, value }) => select.isConnected && select.value === value,
          ) ?? true) &&
          correspondingControls(choicesBefore, rowChoices()) !== undefined,
      });
    }
  }

  /**
   * The caller must separately preserve the approved profile binding. Complex
   * controls and approvals containing popup/opener/option objects are not moved.
   */
  revalidateField(candidateId: string, allowReplacement: boolean): boolean {
    // Local QA diagnostics: record which guard refused the rebind so the
    // failure class can be fixed from evidence instead of guesswork.
    const deny = (reason: string): false => {
      localWorkflowLog("rebind-deny", { reason });
      return false;
    };
    const entry = this.fields.get(candidateId);
    const snapshot = this.replacementState.get(candidateId);
    if (!entry || !snapshot) return deny("no-snapshot");
    const { handle } = entry;
    const lookup = this.lookupField(candidateId);
    if (lookup.status !== "stale") {
      const same = handle.elements.every(
        (element, index) =>
          controlIdentity(element) === snapshot.before[index]?.identity,
      );
      if (!same) localWorkflowLog("rebind-deny", { reason: "identity-changed" });
      return same;
    }
    if (!allowReplacement) return deny("not-allowed");
    if (handle.owner === "legacy") return deny("legacy-owned");
    if (handle.elements.length !== 1) return deny("multi-element");
    if (handle.elements[0].isConnected) return deny("still-connected");
    if (handle.customElements?.length) return deny("custom-widget");
    if (handle.buttonDropdown) return deny("button-dropdown");
    if (handle.optionElements.size) return deny("captured-options");
    if (!snapshot.contextCurrent()) return deny("context-changed");
    const correspondence = correspondingControls(
      snapshot.before,
      Array.from(
        handle.elements[0].ownerDocument.querySelectorAll<
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        >("input, select, textarea"),
      ),
    );
    const replacement = correspondence?.get(handle.elements[0]);
    if (!correspondence) return deny("no-correspondence");
    if (!replacement) return deny("ambiguous-or-missing");
    if (snapshot.row && !snapshot.row.contains(replacement))
      return deny("other-row");
    const rebound: FieldCandidateHandle = {
      ...handle,
      elements: [replacement],
      signature: createStructuralSignature([replacement]),
      ...(handle.isCurrentContext
        ? {
            isCurrentContext: () =>
              snapshot.contextCurrent() &&
              snapshot.row?.contains(replacement) === true,
          }
        : {}),
    };
    this.fields.set(candidateId, { ...entry, handle: rebound });
    if (this.lookupField(candidateId).status !== "ready")
      return deny("rebound-not-ready");
    return true;
  }

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
    if (!identity.displayName && !identity.domName && !identity.domId) {
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
          handle.candidate.domId === identity.domId),
    );
    if (matches.length !== 1) return { status: "unknown" };
    return this.lookup(matches[0]);
  }

  private readCache?: Map<string, CandidateLookup<FieldCandidateHandle>>;

  /** Only for synchronous, read-only planning; never span a write or await. */
  withReadCache<T>(read: () => T): T {
    const previous = this.readCache;
    this.readCache = new Map();
    try {
      return withDomReadPass(read);
    } finally {
      this.readCache = previous;
    }
  }

  lookupField(candidateId: string): CandidateLookup<FieldCandidateHandle> {
    const cached = this.readCache?.get(candidateId);
    if (cached) return cached;
    const result = this.lookup(this.fields.get(candidateId));
    this.readCache?.set(candidateId, result);
    return result;
  }

  /** 개발 진단 로그 전용. 최신성 검사를 거치지 않으므로 기입에 사용하지 않는다. */
  debugField(
    candidateId: string,
  ): Registered<FieldCandidateHandle> | undefined {
    return this.fields.get(candidateId);
  }

  private lookup<T extends ActionCandidateHandle | FieldCandidateHandle>(
    registered: Registered<T> | undefined,
  ): CandidateLookup<T> {
    if (!registered) {
      return { status: "unknown" };
    }
    if (registered.handle.isCurrentContext?.() === false) {
      localWorkflowLog("stale-why", { reason: "context" });
      return { status: "stale" };
    }
    const elements =
      registered.handle.kind === "action"
        ? [registered.handle.element]
        : [
            ...registered.handle.elements,
            ...(registered.handle.customElements ?? []),
          ];
    if (
      elements.some((element) => !element.isConnected) ||
      createStructuralSignature(elements) !== registered.handle.signature
    ) {
      localWorkflowLog("stale-why", {
        reason: elements.some((element) => !element.isConnected)
          ? "disconnected"
          : "signature",
      });
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
      localWorkflowLog("stale-why", { reason: "item-elements" });
      return { status: "stale" };
    }
    // A disabled placeholder option, or an initially hidden combobox menu,
    // must not make its owning field unavailable. The concrete target option
    // is checked immediately before its write instead.
    const targetOnly =
      registered.handle.kind === "field" && targetOnlyRadio(elements);
    const targetVisible = elements.some(isWritableWriteElement);
    // A readonly input that opens its own option list is selected, not typed.
    const inputDropdown =
      registered.handle.kind === "field" &&
      registered.handle.buttonDropdown?.surface === "input"
        ? registered.handle.buttonDropdown.trigger
        : undefined;
    const reasons = elements.map((element) => {
      const reason = liveBlockReason(element);
      return element === inputDropdown && reason === "readonly"
        ? undefined
        : reason;
    });
    // A hidden duplicate must not block a handle that still owns a visible,
    // enabled control. Prefer the visible control's reason when none is usable.
    const currentBlockReason = targetVisible
      ? undefined
      : (reasons.find(
          (reason) => reason !== undefined && reason !== "hidden",
        ) ?? reasons.find((reason) => reason !== undefined));
    const registeredReason =
      (targetOnly && registered.blockedReason === "disabled") ||
      (targetVisible && registered.blockedReason === "hidden")
        ? undefined
        : registered.blockedReason;
    const blockedReason =
      targetOnly && currentBlockReason === "disabled"
        ? undefined
        : currentBlockReason;
    if (registeredReason || blockedReason) {
      return {
        status: "blocked",
        reason: registeredReason ?? blockedReason!,
        handle: registered.handle,
      };
    }
    return { status: "ready", handle: registered.handle };
  }
}
