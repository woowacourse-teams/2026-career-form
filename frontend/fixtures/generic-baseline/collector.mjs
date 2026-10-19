export function isFieldAnalysisEvent(event) {
  return (
    event.type === "AUTOFILL_ANALYZE_FIELDS" ||
    event.type === "AUTOFILL_GENERIC_ANALYZE_FIELDS"
  );
}

export function fieldResponse(event) {
  const fields = event.response?.fields ?? [];
  return {
    ok: event.ok ?? false,
    error_code: event.code ?? null,
    analysis_status:
      event.response?.analysisStatus ?? event.response?.status ?? null,
    warning_codes: [
      ...new Set([
        ...(event.response?.warningCodes ?? []),
        ...fields.flatMap((field) =>
          field.reason === "LLM_UNAVAILABLE" ? [field.reason] : [],
        ),
      ]),
    ],
    fields: fields.length,
    matches: fields.filter(
      (field) =>
        field.matchType === "MATCH" ||
        (event.type === "AUTOFILL_GENERIC_ANALYZE_FIELDS" &&
          field.reason === undefined &&
          (field.profileFieldKey != null || field.binding != null)),
    ).length,
  };
}

// Observe the existing local quality seam, after client-side binding/structure
// merging. These records are not API events and must not count as requests.
export function installClientAnalysisCollector(quality, records) {
  const snapshot = quality.snapshot.bind(quality);
  const review = quality.review.bind(quality);
  quality.snapshot = (snapshotId, registry, candidates) => {
    records.push({
      snapshotId,
      domIds: Object.fromEntries(
        candidates.flatMap((candidateId) => {
          const domId =
            registry.debugField(candidateId)?.handle.candidate.domId;
          return domId ? [[candidateId, domId]] : [];
        }),
      ),
    });
    return snapshot(snapshotId, registry, candidates);
  };
  quality.review = (snapshotId, items) => {
    const record = records.findLast((item) => item.snapshotId === snapshotId);
    if (record)
      record.fields = structuredClone(
        items.map(
          (item) =>
            item.analysis ?? {
              candidateId: item.candidateId,
              matchType: "NO_MATCH",
            },
        ),
      );
    return review(snapshotId, items);
  };
}

export function fieldAnalysis(events, clientAnalyses = []) {
  const domIds = new Map();
  const analyses = new Map();
  for (const event of events) {
    if (event.type !== "AUTOFILL_ANALYZE_FIELDS") continue;
    const identities = new Map();
    for (const section of event.request?.sections ?? []) {
      const fields = [
        ...section.fields,
        ...(section.items ?? []).flatMap((item) => item.fields),
      ];
      for (const field of fields) {
        identities.set(field.candidateId, field.domId);
        domIds.set(field.domId, field.domId);
      }
    }
    for (const field of event.response?.fields ?? []) {
      const domId = identities.get(field.candidateId);
      if (domId) analyses.set(domId, field);
    }
  }
  // Candidate IDs belong to a snapshot, not a DOM control. Aggregate only by
  // fixture identity; a later final review supersedes an earlier raw binding.
  for (const record of clientAnalyses) {
    for (const domId of Object.values(record.domIds)) domIds.set(domId, domId);
    for (const field of record.fields ?? []) {
      const domId = record.domIds[field.candidateId];
      if (domId) analyses.set(domId, field);
    }
  }
  return { domIds, analyses };
}
