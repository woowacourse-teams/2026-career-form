import { createRoot } from "react-dom/client";

import pageSource from "../../../harness/fixtures/generic-autofill/pages/large-generic-form.html?raw";
import profileExport from "../profile-export.example.json";
import { createAnalysisMessageHandler } from "../../src/autofill/api/background-handler";
import { RuntimeAnalysisApiClient } from "../../src/autofill/api/runtime-client";
import type { PreparationAnalyzeResponse } from "../../src/autofill/api/types";
import { collectPreparationSnapshot } from "../../src/autofill/dom/collect";
import { AutofillWorkflow } from "../../src/autofill/workflow/AutofillWorkflow";
import { localItemCount } from "../../src/autofill/workflow/workflow-model";
import { parseProfileImport } from "../../src/profile/profile-transfer";

interface AnalysisEvent {
  type: string;
  startedAt: number;
  endedAt?: number;
  ok?: boolean;
  code?: string;
  request: unknown;
  response?: unknown;
}

interface PlanDiagnosis {
  actionCandidateId: string;
  actionDisplayName?: string;
  actionDomName?: string;
  sectionDisplayName?: string;
  localItemCount?: number;
  currentGroupCount?: number;
  requiredAdditions?: number;
  recognizedRows?: string[][];
}

declare global {
  interface Window {
    __cfBaseline: {
      events: AnalysisEvent[];
      diagnoses: PlanDiagnosis[];
      pageErrors: string[];
    };
  }
}

if (location.hostname !== "127.0.0.1") {
  throw new Error("The generic baseline driver runs only on 127.0.0.1");
}

// Load the harness page exactly as committed. Inline scripts are recreated so
// that they execute; the page has no external resources.
const parsed = new DOMParser().parseFromString(pageSource, "text/html");
document.title = parsed.title;
for (const style of parsed.head.querySelectorAll("style")) {
  document.head.append(document.importNode(style, true));
}
const pageScripts = Array.from(parsed.body.querySelectorAll("script"));
for (const script of pageScripts) script.remove();
document.body.prepend(
  ...Array.from(parsed.body.childNodes, (node) =>
    document.importNode(node, true),
  ),
);
for (const script of pageScripts) {
  const executable = document.createElement("script");
  executable.textContent = script.textContent;
  document.body.append(executable);
}

const diagnose = new URLSearchParams(location.search).has("diagnose");
const profile = parseProfileImport(JSON.stringify(profileExport));
const repository = { load: async () => profile };
const state: Window["__cfBaseline"] = {
  events: [],
  diagnoses: [],
  pageErrors: [],
};
window.__cfBaseline = state;
window.addEventListener("error", (event) => {
  state.pageErrors.push(String(event.message));
});

function diagnosePreparation(response: PreparationAnalyzeResponse): void {
  const snapshot = collectPreparationSnapshot(document);
  const actions = snapshot.request.sections.flatMap((section) =>
    section.actionCandidates.map((action) => ({ section, action })),
  );
  for (const plan of response.preparationPlans) {
    if (plan.command !== "ADD_REPEATABLE_GROUP") continue;
    const owner = actions.find(
      ({ action }) => action.candidateId === plan.actionCandidateId,
    );
    const local = localItemCount(plan, snapshot, profile);
    const current = snapshot.countRepeatableGroups(plan.actionCandidateId);
    state.diagnoses.push({
      actionCandidateId: plan.actionCandidateId,
      actionDisplayName: owner?.action.displayName,
      actionDomName: owner?.action.domName,
      sectionDisplayName: owner?.section.displayName,
      localItemCount: local,
      currentGroupCount: current,
      ...(local !== undefined && current !== undefined
        ? { requiredAdditions: Math.max(0, local - current) }
        : {}),
      recognizedRows: snapshot
        .repeatableGroupState(plan.actionCandidateId)
        ?.map((row) =>
          (JSON.parse(row) as string[][]).map((control) => control[1]),
        ),
    });
  }
}

// The production background handler talks to the backend through the Vite
// /api proxy. This page never reads or forwards provider keys.
const backgroundHandler = createAnalysisMessageHandler({
  baseUrl: location.origin,
});

async function sendMessage(message: unknown): Promise<unknown> {
  const typed = message as { type?: string; payload?: unknown };
  if (typed.type === "AUTOFILL_LOAD_EXECUTION_POLICY") {
    const response = await fetch("/api/v1/execution-policy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        host: location.host,
        pathPattern: location.pathname,
      }),
    });
    return response.ok
      ? { ok: true, data: await response.json() }
      : { ok: false, code: "SERVER_ERROR" };
  }
  const event: AnalysisEvent = {
    type: typed.type ?? "UNKNOWN",
    startedAt: performance.now(),
    request: typed.payload,
  };
  state.events.push(event);
  const envelope = (await backgroundHandler(message)) as
    | { ok: true; data: unknown }
    | { ok: false; code: string }
    | undefined;
  event.endedAt = performance.now();
  event.ok = envelope?.ok;
  if (envelope?.ok) {
    event.response = envelope.data;
    if (diagnose && event.type === "AUTOFILL_ANALYZE_PREPARATION") {
      diagnosePreparation(envelope.data as PreparationAnalyzeResponse);
    }
  } else if (envelope) {
    event.code = envelope.code;
  }
  return envelope;
}

const apiClient = new RuntimeAnalysisApiClient(sendMessage);
const host = document.createElement("career-form-profile-panel");
host.dataset.baselineWorkflow = "";
document.body.append(host);
const container = document.createElement("div");
host.attachShadow({ mode: "open" }).append(container);

createRoot(container).render(
  <AutofillWorkflow
    apiClient={apiClient}
    repository={repository}
    pageDocument={document}
    onExit={() => undefined}
  />,
);
