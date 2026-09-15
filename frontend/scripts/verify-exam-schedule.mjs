const storage = new Map();
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };
globalThis.window = {
  localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  dispatchEvent: () => true,
};

const { getExamAvailability, saveExamSchedule, stopExamSchedule } = await import("../client/src/lib/exam-schedule.js");
const examId = "timing-check";
const schedule = {
  examId,
  opensAt: "2026-08-26T16:00:00.250Z",
  closesAt: "2026-08-26T17:00:00.250Z",
  durationMinutes: 30,
};

saveExamSchedule(schedule);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const beforeOpen = getExamAvailability(examId, new Date("2026-08-26T15:55:00.000Z"));
assert(beforeOpen.availability === "NOT_YET_AVAILABLE", "Expected the exam to be unavailable before 4:00 PM.");
const oneQuarterSecondBefore = getExamAvailability(examId, new Date("2026-08-26T16:00:00.249Z"));
assert(oneQuarterSecondBefore.availability === "NOT_YET_AVAILABLE" && oneQuarterSecondBefore.secondsUntilOpen === 1, "Expected the exact selected opening second to remain closed until the boundary.");

const onTime = getExamAvailability(examId, new Date("2026-08-26T16:00:00.250Z"));
assert(onTime.ok && onTime.attemptSeconds === 1800 && !onTime.lateEntry, "Expected an on-time entry to receive the full 30 minutes.");

const late = getExamAvailability(examId, new Date("2026-08-26T16:35:00.000Z"));
assert(late.ok && late.attemptSeconds === 1500 && late.lateEntry, "Expected a 4:35 PM entry to receive the 25 minutes remaining until 5:00 PM.");

const afterClose = getExamAvailability(examId, new Date("2026-08-26T17:00:00.250Z"));
assert(afterClose.availability === "EXAM_ENDED", "Expected the exam to reject access at the closing time.");

saveExamSchedule(schedule);
stopExamSchedule(examId);
const stopped = getExamAvailability(examId, new Date("2026-08-26T16:10:00.000Z"));
assert(stopped.availability === "ADMIN_STOPPED", "Expected an administrator stop to reject new access immediately.");

console.log("Exam schedule checks passed: pre-start, full-duration, late-entry, closed, and administrator-stop states.");
