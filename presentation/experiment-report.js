const freezeTask = (seconds, omissions = 0, mismatches = 0, extra = {}) =>
  Object.freeze({ seconds, omissions, mismatches, ...extra });

const freezeSession = (id, fieldCount, A, B, C, D) =>
  Object.freeze({ id, fieldCount, A, B, C, D });

const sessions = Object.freeze([
  freezeSession("S01", 7, freezeTask(52), freezeTask(21), freezeTask(31, 0, 0, { profileTabSeconds: 7 }), freezeTask(20)),
  freezeSession("S02", 7, freezeTask(25), freezeTask(1, 7), freezeTask(4, 7, 0, { profileTabSeconds: 2 }), freezeTask(4, 2)),
  freezeSession("S03", 16, freezeTask(115), freezeTask(57), freezeTask(80, 0, 0, { profileTabSeconds: 30 }), freezeTask(37)),
  freezeSession("S04", 11, freezeTask(106), freezeTask(49), freezeTask(67, 0, 0, { profileTabSeconds: 14 }), freezeTask(32)),
  freezeSession("S05", 12, freezeTask(238), freezeTask(65), freezeTask(123, 0, 0, { profileTabSeconds: 25 }), freezeTask(25)),
  freezeSession("S06", 11, freezeTask(193), freezeTask(45), freezeTask(82, 0, 0, { profileTabSeconds: 35 }), freezeTask(13)),
  freezeSession("S07", 12, freezeTask(144), freezeTask(67), freezeTask(92, 0, 1, { profileTabSeconds: 23 }), freezeTask(16)),
  freezeSession("S08", 11, freezeTask(215), freezeTask(61), freezeTask(81, 0, 0, { profileTabSeconds: 16 }), freezeTask(15)),
  freezeSession("S09", 11, freezeTask(113), freezeTask(40), freezeTask(80, 0, 0, { profileTabSeconds: 27 }), freezeTask(17)),
  freezeSession("S10", 10, freezeTask(151), freezeTask(68), freezeTask(62, 0, 0, { profileTabSeconds: 9 }), freezeTask(22)),
]);

const taskNames = Object.freeze(["A", "B", "C", "D"]);
const measuredTaskNames = Object.freeze(["B", "C", "D"]);

function roundOne(value) {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[middle - 1] + ordered[middle]) / 2
    : ordered[middle];
}

function validateTask(task, fieldCount) {
  const values = [task.seconds, task.omissions, task.mismatches];
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("측정값은 음수일 수 없습니다");
  }
  if (task.omissions + task.mismatches > fieldCount) {
    throw new Error("오류 필드 수는 전체 필드 수를 넘을 수 없습니다");
  }
}

function validateSessions(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("세션이 필요합니다");
  }
  const ids = rows.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("세션 ID가 중복됐습니다");
  }
  for (const row of rows) {
    if (!Number.isInteger(row.fieldCount) || row.fieldCount <= 0) {
      throw new Error("필드 수는 양수여야 합니다");
    }
    for (const taskName of taskNames) {
      validateTask(row[taskName], row.fieldCount);
    }
    if (!Number.isFinite(row.C.profileTabSeconds) || row.C.profileTabSeconds < 0) {
      throw new Error("측정값은 음수일 수 없습니다");
    }
  }
}

function summarizeExperiment(rows) {
  validateSessions(rows);
  const fieldCount = rows.reduce((sum, row) => sum + row.fieldCount, 0);
  const averageSeconds = Object.fromEntries(taskNames.map((taskName) => [
    taskName,
    roundOne(average(rows.map((row) => row[taskName].seconds))),
  ]));
  const medianSeconds = Object.fromEntries(taskNames.map((taskName) => [
    taskName,
    roundOne(median(rows.map((row) => row[taskName].seconds))),
  ]));
  const reductionFromA = Object.fromEntries(measuredTaskNames.map((taskName) => [
    taskName,
    roundOne((1 - averageSeconds[taskName] / averageSeconds.A) * 100),
  ]));
  const accurateFields = Object.fromEntries(measuredTaskNames.map((taskName) => [
    taskName,
    rows.reduce(
      (sum, row) => sum + row.fieldCount - row[taskName].omissions - row[taskName].mismatches,
      0,
    ),
  ]));
  const accuracyPercent = Object.fromEntries(measuredTaskNames.map((taskName) => [
    taskName,
    roundOne((accurateFields[taskName] / fieldCount) * 100),
  ]));

  return Object.freeze({
    sessionCount: rows.length,
    fieldCount,
    averageSeconds: Object.freeze(averageSeconds),
    medianSeconds: Object.freeze(medianSeconds),
    reductionFromA: Object.freeze(reductionFromA),
    accurateFields: Object.freeze(accurateFields),
    accuracyPercent: Object.freeze(accuracyPercent),
    averageProfileTabSeconds: roundOne(
      average(rows.map(({ C }) => C.profileTabSeconds)),
    ),
  });
}

const experimentSummary = summarizeExperiment(sessions);

if (typeof globalThis !== "undefined") {
  globalThis.experimentSummary = experimentSummary;
}

if (typeof module !== "undefined") {
  module.exports = { experimentSummary, sessions, summarizeExperiment };
}
