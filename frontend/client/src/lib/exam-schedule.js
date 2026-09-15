/** Institutional exam scheduling: availability windows are explicit, late entry never extends closure, and administrative stop is immediate. */
const scheduleStoragePrefix = "isdb_exam_schedule_";
const scheduleChangeEvent = "isdb-exam-schedule-change";

const toIso = (date) => new Date(date).toISOString();
const asDate = (value) => new Date(value);

const createDemoSchedule = (examId) => {
  const opensAt = new Date(Date.now() - 5 * 60 * 1000);
  const closesAt = new Date(opensAt.getTime() + 60 * 60 * 1000);
  return { examId, opensAt: toIso(opensAt), closesAt: toIso(closesAt), durationMinutes: 30, stoppedAt: null };
};

const isValidSchedule = (schedule) => {
  const opensAt = asDate(schedule?.opensAt);
  const closesAt = asDate(schedule?.closesAt);
  const durationMinutes = Number(schedule?.durationMinutes);
  return Number.isFinite(opensAt.getTime()) && Number.isFinite(closesAt.getTime()) && Number.isFinite(durationMinutes) && durationMinutes > 0 && closesAt.getTime() >= opensAt.getTime() + durationMinutes * 60 * 1000;
};

const getStorageKey = (examId) => `${scheduleStoragePrefix}${examId}`;

const dispatchScheduleChange = (examId) => {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(scheduleChangeEvent, { detail: { examId } }));
};

const getExamSchedule = (examId = "exam-1") => {
  if (typeof window === "undefined") return createDemoSchedule(examId);
  try {
    const stored = JSON.parse(window.localStorage.getItem(getStorageKey(examId)) ?? "null");
    if (isValidSchedule(stored)) return { ...stored, examId };
  } catch {
    // Fall through to the locally seeded demonstration schedule.
  }
  const seed = createDemoSchedule(examId);
  window.localStorage.setItem(getStorageKey(examId), JSON.stringify(seed));
  return seed;
};

const saveExamSchedule = (schedule) => {
  const normalized = { ...schedule, durationMinutes: Number(schedule.durationMinutes), stoppedAt: null };
  if (!isValidSchedule(normalized)) throw new Error("The availability window must be at least as long as the examination duration.");
  if (typeof window !== "undefined") window.localStorage.setItem(getStorageKey(normalized.examId), JSON.stringify(normalized));
  dispatchScheduleChange(normalized.examId);
  return normalized;
};

const stopExamSchedule = (examId = "exam-1") => {
  const stopped = { ...getExamSchedule(examId), stoppedAt: toIso(new Date()) };
  if (typeof window !== "undefined") window.localStorage.setItem(getStorageKey(examId), JSON.stringify(stopped));
  dispatchScheduleChange(examId);
  return stopped;
};

const getEarliestCloseAt = (opensAt, durationMinutes) => new Date(asDate(opensAt).getTime() + Number(durationMinutes) * 60 * 1000);

const toDateTimeLocal = (value) => {
  const date = asDate(value);
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const getExamAvailability = (examId = "exam-1", now = new Date()) => {
  const schedule = getExamSchedule(examId);
  const currentTime = asDate(now).getTime();
  const opensAt = asDate(schedule.opensAt).getTime();
  const closesAt = asDate(schedule.closesAt).getTime();
  if (schedule.stoppedAt) return { ok: false, availability: "ADMIN_STOPPED", schedule };
  if (currentTime < opensAt) return { ok: false, availability: "NOT_YET_AVAILABLE", schedule, secondsUntilOpen: Math.ceil((opensAt - currentTime) / 1000) };
  if (currentTime >= closesAt) return { ok: false, availability: "EXAM_ENDED", schedule };
  const secondsUntilClose = Math.floor((closesAt - currentTime) / 1000);
  const attemptSeconds = Math.min(schedule.durationMinutes * 60, secondsUntilClose);
  if (attemptSeconds <= 0) return { ok: false, availability: "EXAM_ENDED", schedule };
  return { ok: true, availability: "AVAILABLE", schedule, attemptSeconds, expiresAt: toIso(new Date(currentTime + attemptSeconds * 1000)), lateEntry: attemptSeconds < schedule.durationMinutes * 60 };
};

const formatClock = (totalSeconds) => {
  const safeSeconds = Math.max(0, Math.ceil(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return hours > 0 ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}` : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const formatScheduleDateTime = (value) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(asDate(value));

export {
  formatClock,
  formatScheduleDateTime,
  getEarliestCloseAt,
  getExamAvailability,
  getExamSchedule,
  isValidSchedule,
  saveExamSchedule,
  scheduleChangeEvent,
  stopExamSchedule,
  toDateTimeLocal,
};
