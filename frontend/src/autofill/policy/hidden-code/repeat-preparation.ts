import { alignRows } from "../row-alignment";
import { runDomPlan } from "../action-plan";
// Common executor for forms with hidden codes and DOM-backed option controls.
import {
  contractValue,
  contractText,
  contractPattern,
  type HiddenCodeContract,
} from "./contract";
import type { Profile, ProfileEntry } from "../../../profile/model";

export function createRepeatPreparationModule(
  document: Document,
  contract: HiddenCodeContract,
) {
  const EDUCATION_OPTIONS = contractValue<{ label: string; code: string }[]>(
    contract.definitions.rowKinds,
  );

  const WAIT_TIMEOUT_MILLISECONDS = contractValue<number>(
    contract.definitions.rowTimeoutMs,
  );
  const EDUCATION_KIND_LIMITS: Readonly<Record<string, number>> = contractValue<
    Readonly<Record<string, number>>
  >(contract.definitions.rowKindLimits);

  type EducationKind = (typeof EDUCATION_OPTIONS)[number];

  interface EducationRow {
    element: HTMLElement;
    hidden: HTMLInputElement;
    trigger: HTMLInputElement;
    selectWrap: HTMLElement;
    index: number;
  }

  interface ProtectedOriginalRow {
    kind: EducationKind;
    valueSignature: string;
  }

  function profileKinds(profile: Profile): EducationKind[] | undefined {
    const preparation = contract.behavior.rowPreparation;
    if (
      profile[preparation.sourceCategory].some(
        (entry) => !preparation.sectionOrder.includes(entry.sectionId),
      )
    )
      return undefined;
    const kinds: EducationKind[] = [];
    for (const section of preparation.sectionOrder) {
      for (const entry of profile[preparation.sourceCategory].filter(
        (entry) => entry.sectionId === section,
      )) {
        const matches = contract.behavior.rowKinds.filter(
          (rule) =>
            rule.section === section &&
            (!rule.valueField || entry.values[rule.valueField] === rule.value),
        );
        if (matches.length !== 1) return undefined;
        const option = EDUCATION_OPTIONS.find(
          (option) => option.code === matches[0].code,
        );
        if (!option) return undefined;
        kinds.push(option);
      }
    }
    return kinds.every(
      (kind) =>
        kinds.filter((other) => other.code === kind.code).length <=
        EDUCATION_KIND_LIMITS[kind.code],
    )
      ? kinds
      : undefined;
  }

  function directRows(article: HTMLElement): HTMLElement[] {
    return Array.from(
      article.querySelectorAll<HTMLElement>(
        contract.behavior.rowPreparation.rowSelector,
      ),
    );
  }

  function educationRow(element: HTMLElement): EducationRow | undefined {
    const groups = Array.from(
      element.querySelectorAll<HTMLElement>(
        contract.behavior.rowPreparation.groupSelector,
      ),
    );
    if (groups.length !== 1) return undefined;
    const wraps = Array.from(
      groups[0]!.querySelectorAll<HTMLElement>(
        contract.targets.rowOptionContainer,
      ),
    ).filter((wrap) => {
      const hidden = wrap.querySelectorAll<HTMLInputElement>(
        contract.targets.directRowKindCode,
      );
      const trigger = wrap.querySelectorAll<HTMLInputElement>(
        contract.targets.directRowKindTrigger,
      );
      return hidden.length === 1 && trigger.length === 1;
    });
    if (wraps.length !== 1) return undefined;
    const selectWrap = wraps[0]!;
    const hidden = selectWrap.querySelector<HTMLInputElement>(
      contract.targets.directRowKindCode,
    );
    const trigger = selectWrap.querySelector<HTMLInputElement>(
      contract.targets.directRowKindTrigger,
    );
    const match = trigger?.id.match(
      contractPattern(contract.patterns.rowKindIndex),
    );
    if (!hidden || !trigger || !match) return undefined;
    return { element, hidden, trigger, selectWrap, index: Number(match[1]) };
  }

  function optionIsExact(
    option: HTMLButtonElement,
    expected: EducationKind,
  ): boolean {
    return (
      option.dataset[contract.behavior.datasetKeys.code] === expected.code &&
      option.textContent?.trim() === expected.label
    );
  }

  function optionsAreComplete(row: EducationRow): boolean {
    const choices = Array.from(
      row.selectWrap.querySelectorAll<HTMLButtonElement>(
        contract.targets.rowKindOptions,
      ),
    );
    const resetChoices = choices.filter(
      (choice) =>
        choice.dataset[contract.behavior.datasetKeys.code] ===
          contract.behavior.rowPreparation.resetCode &&
        choice.classList.contains(contract.tokens.resetClass) &&
        choice.textContent?.trim() === contract.tokens.emptyChoiceWithPeriod,
    );
    const educationChoices = choices.filter(
      (choice) =>
        choice.dataset[contract.behavior.datasetKeys.code] !==
        contract.behavior.rowPreparation.resetCode,
    );
    return (
      choices.length ===
        educationChoices.length +
          contract.behavior.rowPreparation.resetOptionCount &&
      resetChoices.length ===
        contract.behavior.rowPreparation.resetOptionCount &&
      (!contract.behavior.rowPreparation.requireCompleteOptions ||
        educationChoices.length === EDUCATION_OPTIONS.length) &&
      (!contract.behavior.rowPreparation.requireCompleteOptions ||
        EDUCATION_OPTIONS.every(
          (expected) =>
            educationChoices.filter((choice) => optionIsExact(choice, expected))
              .length === 1,
        ))
    );
  }

  function rowHasUserValue(row: EducationRow): boolean {
    return Array.from(
      row.element.querySelectorAll<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >("input, textarea, select"),
    ).some((field) => {
      if (field === row.hidden || field === row.trigger) return false;
      if (!(field instanceof HTMLInputElement)) {
        return field.value.trim().length > 0;
      }
      if (field.type === "hidden" || field.type === "button") return false;
      if (field.type === "checkbox" || field.type === "radio") {
        return field.checked;
      }
      if (field.type === "file") return field.files?.length !== 0;
      return field.value.trim().length > 0;
    });
  }

  function rowValueSignature(row: EducationRow): string {
    return Array.from(
      row.element.querySelectorAll<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >("input, textarea, select"),
      (field) =>
        [
          field.tagName,
          field.type,
          field.id,
          field.name,
          field.value,
          field instanceof HTMLInputElement &&
          (field.type === "checkbox" || field.type === "radio")
            ? String(field.checked)
            : "",
        ].join("\u0000"),
    ).join("\u0001");
  }

  function selectionMatches(
    row: EducationRow,
    expected: EducationKind,
  ): boolean {
    return (
      row.hidden.value === expected.code &&
      row.trigger.value.trim() === expected.label
    );
  }

  function isEmptyRow(row: EducationRow): boolean {
    return (
      row.hidden.value.trim() === "" &&
      (row.trigger.value.trim() === "" ||
        row.trigger.value.trim() === contract.tokens.emptyChoiceWithPeriod ||
        row.trigger.value.trim() === contract.tokens.emptyChoice) &&
      !rowHasUserValue(row)
    );
  }

  function isVisibleEnabled(element: HTMLElement): boolean {
    return (
      element.isConnected &&
      !element.matches(":disabled") &&
      !element.closest(contract.targets.unavailableAncestors) &&
      (() => {
        const view = element.ownerDocument.defaultView;
        if (!view) return false;
        for (
          let current: HTMLElement | null = element;
          current;
          current = current.parentElement
        ) {
          const style = view.getComputedStyle(current);
          if (style.display === "none" || style.visibility === "hidden") {
            return false;
          }
        }
        return true;
      })()
    );
  }

  function isVisibleControl(control: HTMLInputElement): boolean {
    return !control.disabled && isVisibleEnabled(control);
  }

  function isVisibleEnabledOption(option: HTMLButtonElement): boolean {
    return !option.disabled && isVisibleEnabled(option);
  }

  function hasRevealedEducationFields(row: EducationRow): boolean {
    const selectors = contract.behavior.rowPreparation.revealTemplates.map(
      (parts) => contractText(parts, [row.index]),
    );
    return selectors.every((selector) => {
      const controls = Array.from(
        row.element.querySelectorAll<HTMLInputElement>(
          contractText(contract.templates.rowDetails, [selector]),
        ),
      );
      return controls.length === 1 && isVisibleControl(controls[0]!);
    });
  }

  function signalAborted(signal: AbortSignal | undefined): boolean {
    return signal?.aborted === true;
  }

  function waitFor(
    document: Document,
    condition: () => boolean,
    signal: AbortSignal | undefined,
  ): Promise<boolean> {
    if (signalAborted(signal)) return Promise.resolve(false);
    if (condition()) return Promise.resolve(true);
    const view = document.defaultView;
    if (!view || !document.documentElement) return Promise.resolve(false);
    return new Promise((resolve) => {
      let done = false;
      const finish = (value: boolean) => {
        if (done) return;
        done = true;
        observer.disconnect();
        view.clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
        resolve(value);
      };
      const abort = () => finish(false);
      const observer = new view.MutationObserver(() => {
        if (signalAborted(signal)) return finish(false);
        if (condition()) finish(true);
      });
      const timeout = view.setTimeout(
        () => finish(!signalAborted(signal) && condition()),
        WAIT_TIMEOUT_MILLISECONDS,
      );
      signal?.addEventListener("abort", abort, {
        once: true,
      });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "disabled", "hidden", "maxlength", "value"],
      });
    });
  }

  function currentRows(article: HTMLElement): EducationRow[] | undefined {
    const rows = directRows(article).map(educationRow);
    return rows.every((row): row is EducationRow => row !== undefined)
      ? rows
      : undefined;
  }

  function isStable(
    article: HTMLElement,
    originalRows: readonly HTMLElement[],
    selectedOriginalRows: ReadonlyMap<HTMLElement, ProtectedOriginalRow>,
    expectedLength: number,
  ): boolean {
    if (!article.isConnected) return false;
    const rows = currentRows(article);
    if (!rows || rows.length !== expectedLength) return false;
    if (
      !originalRows.every((element, index) => rows[index]?.element === element)
    ) {
      return false;
    }
    return Array.from(selectedOriginalRows).every(([element, protectedRow]) => {
      const row = rows.find((candidate) => candidate.element === element);
      return (
        row !== undefined &&
        selectionMatches(row, protectedRow.kind) &&
        rowValueSignature(row) === protectedRow.valueSignature
      );
    });
  }

  async function selectKind(
    document: Document,
    article: HTMLElement,
    row: EducationRow,
    expected: EducationKind,
    originalRows: readonly HTMLElement[],
    selectedOriginalRows: ReadonlyMap<HTMLElement, ProtectedOriginalRow>,
    expectedLength: number,
    signal: AbortSignal | undefined,
  ): Promise<boolean> {
    if (
      signalAborted(signal) ||
      !isStable(article, originalRows, selectedOriginalRows, expectedLength) ||
      !isVisibleControl(row.trigger) ||
      !isEmptyRow(row) ||
      !optionsAreComplete(row)
    ) {
      return false;
    }
    for (const step of contract.behavior.rowPreparation.selectSteps) {
      if (
        signalAborted(signal) ||
        !row.trigger.isConnected ||
        !optionsAreComplete(row)
      )
        return false;
      if (step === "OPEN_TRIGGER") row.trigger.click();
      else if (step === "CLICK_EXACT_OPTION") {
        const choices = Array.from(
          row.selectWrap.querySelectorAll<HTMLButtonElement>(
            contract.targets.rowKindOptions,
          ),
        ).filter((choice) => optionIsExact(choice, expected));
        if (choices.length !== 1 || !isVisibleEnabledOption(choices[0]!))
          return false;
        choices[0]!.click();
      } else if (step === "WAIT_REVEALED") {
        if (
          !(await waitFor(
            document,
            () =>
              !signalAborted(signal) &&
              isStable(
                article,
                originalRows,
                selectedOriginalRows,
                expectedLength,
              ) &&
              selectionMatches(row, expected) &&
              hasRevealedEducationFields(row),
            signal,
          ))
        )
          return false;
      }
    }
    return (
      !signalAborted(signal) &&
      isStable(article, originalRows, selectedOriginalRows, expectedLength) &&
      selectionMatches(row, expected) &&
      hasRevealedEducationFields(row)
    );
  }

  async function resetOwnedClone(
    document: Document,
    article: HTMLElement,
    row: EducationRow,
    originalRows: readonly HTMLElement[],
    selectedOriginalRows: ReadonlyMap<HTMLElement, ProtectedOriginalRow>,
    expectedLength: number,
    signal: AbortSignal | undefined,
  ): Promise<boolean> {
    if (isEmptyRow(row)) return true;
    const resetActions = Array.from(
      row.selectWrap.querySelectorAll<HTMLButtonElement>(
        contract.targets.rowResetOption,
      ),
    );
    if (
      signalAborted(signal) ||
      !isVisibleControl(row.trigger) ||
      resetActions.length !== 1
    ) {
      return false;
    }
    for (const step of contract.behavior.rowPreparation.resetSteps) {
      if (signalAborted(signal) || !isVisibleControl(row.trigger)) return false;
      if (step === "OPEN_TRIGGER") row.trigger.click();
      else if (step === "CLICK_RESET") {
        if (!isVisibleEnabledOption(resetActions[0]!)) return false;
        resetActions[0]!.click();
      } else if (step === "WAIT_EMPTY") {
        if (
          !(await waitFor(
            document,
            () =>
              !signalAborted(signal) &&
              isStable(
                article,
                originalRows,
                selectedOriginalRows,
                expectedLength,
              ) &&
              isEmptyRow(row),
            signal,
          ))
        )
          return false;
      }
    }
    return (
      !signalAborted(signal) &&
      isStable(article, originalRows, selectedOriginalRows, expectedLength) &&
      isEmptyRow(row)
    );
  }

  async function prepareEducation(
    document: Document,
    profile: Profile,
    signal?: AbortSignal,
  ): Promise<boolean> {
    if (
      document.location.host !== contract.host ||
      document.location.pathname !== contract.path
    ) {
      return false;
    }
    const expectedKinds = profileKinds(profile);
    if (!expectedKinds || signalAborted(signal)) return false;
    if (expectedKinds.length === 0) return true;

    const articles = Array.from(
      document.querySelectorAll<HTMLElement>(contract.targets.repeatRoot),
    );
    if (articles.length !== 1) return false;
    const article = articles[0]!;
    let rows = currentRows(article);
    if (!rows) return false;
    const actualKinds = rows.map((row) =>
      EDUCATION_OPTIONS.find((kind) => selectionMatches(row, kind)),
    );
    if (rows.some((row, index) => !actualKinds[index] && !isEmptyRow(row)))
      return false;
    const alignment = alignRows(
      actualKinds.map((kind) => kind?.code ?? null),
      expectedKinds.map((kind) => kind.code),
      contract.behavior.rowPreparation.alignment,
    );
    if (!alignment) return false;
    const desiredByRow = new Map(
      rows.map((row, index) => [
        row.element,
        EDUCATION_OPTIONS.find((kind) => kind.code === alignment.keys[index])!,
      ]),
    );
    const pending = alignment.pending.map((code) =>
      EDUCATION_OPTIONS.find((kind) => kind.code === code)!,
    );
    const finalLength = rows.length + pending.length;

    const originalRows = rows.map((row) => row.element);
    const selectedOriginalRows = new Map<HTMLElement, ProtectedOriginalRow>();
    for (const row of rows) {
      const expected = desiredByRow.get(row.element);
      if (!expected) return false;
      if (!optionsAreComplete(row)) return false;
      if (row.hidden.value.trim()) {
        if (!selectionMatches(row, expected)) return false;
        selectedOriginalRows.set(row.element, {
          kind: expected,
          valueSignature: rowValueSignature(row),
        });
      } else if (!isEmptyRow(row)) {
        return false;
      }
    }

    const addCount = pending.length;
    if (addCount > 0) {
      for (let count = 0; count < addCount; count += 1) {
        if (
          signalAborted(signal) ||
          !isStable(article, originalRows, selectedOriginalRows, rows.length)
        ) {
          return false;
        }
        if (
          contract.behavior.rowPreparation.selectionOrder === "BEFORE_NEXT_ROW"
        ) {
          for (const row of rows) {
            const expected = desiredByRow.get(row.element);
            if (!expected) return false;
            if (!selectionMatches(row, expected)) {
              const selected = await selectKind(
                document,
                article,
                row,
                expected,
                originalRows,
                selectedOriginalRows,
                rows.length,
                signal,
              );
              if (!selected) return false;
            }
            selectedOriginalRows.set(row.element, {
              kind: expected,
              valueSignature: rowValueSignature(row),
            });
          }
        }
        const addRule = contract.behavior.rowPreparation.add;
        const lastRow =
          addRule.sourcePosition === "LAST" ? rows.at(-1) : rows[0];
        const actions = Array.from(
          lastRow?.element.querySelectorAll<HTMLButtonElement>(
            addRule.selector,
          ) ?? [],
        );
        if (actions.length !== 1) return false;
        if (!isVisibleEnabledOption(actions[0]!)) return false;
        if (
          !runDomPlan(
            addRule.plan,
            { control: actions[0] },
            {},
            () =>
              !signalAborted(signal) &&
              article.isConnected &&
              originalRows.every((row) => row.isConnected),
          )
        )
          return false;
        const expectedLength = rows.length + 1;
        const added = await waitFor(
          document,
          () =>
            !signalAborted(signal) &&
            directRows(article).length === expectedLength,
          signal,
        );
        if (
          !added ||
          !isStable(article, originalRows, selectedOriginalRows, expectedLength)
        ) {
          return false;
        }
        rows = currentRows(article);
        if (!rows) return false;
        const cloneReset =
          !addRule.reset ||
          (await resetOwnedClone(
            document,
            article,
            (addRule.resultPosition === "LAST" ? rows.at(-1) : rows[0])!,
            originalRows,
            selectedOriginalRows,
            expectedLength,
            signal,
          ));
        if (!cloneReset) return false;
        const addedRow = (
          addRule.resultPosition === "LAST" ? rows.at(-1) : rows[0]
        )!;
        if (desiredByRow.has(addedRow.element)) return false;
        desiredByRow.set(addedRow.element, pending[count]!);
      }
    }

    if (!isStable(article, originalRows, selectedOriginalRows, finalLength)) {
      return false;
    }
    rows = currentRows(article);
    if (!rows) return false;
    for (const row of rows) {
      const expected = desiredByRow.get(row.element);
      if (!expected) return false;
      if (selectionMatches(row, expected)) continue;
      const selected = await selectKind(
        document,
        article,
        row,
        expected,
        originalRows,
        selectedOriginalRows,
        finalLength,
        signal,
      );
      if (!selected) return false;
    }
    return (
      !signalAborted(signal) &&
      isStable(article, originalRows, selectedOriginalRows, finalLength) &&
      (currentRows(article)?.every((row) => {
        const expected = desiredByRow.get(row.element);
        return !!expected && selectionMatches(row, expected);
      }) ??
        false)
    );
  }

  return { prepareEducation };
}
