/** Question Bank store with local demo fallback and Laravel-backed persistence. */
import { questions as seedQuestions } from "@/lib/mock-data";
import { apiClient, isMockMode } from "@/services/api-client";

const storageKey = "isdb_question_demo_records_v1";
const questionUpdateEvent = "isdb-question-demo-update";
const clone = value => JSON.parse(JSON.stringify(value));
let apiCache = null;
let inFlight = null;

const normalize = row => {
  const options = Array.isArray(row.options)
    ? row.options.map(
        option => option.option_text ?? option.text ?? String(option)
      )
    : [];
  const correct = Array.isArray(row.options)
    ? row.options.reduce(
        (acc, option, index) =>
          option.is_correct || option.isCorrect ? [...acc, String(index)] : acc,
        []
      )
    : [];
  return {
    id: String(row.id),
    code: row.question_code ?? row.code ?? `Q-${row.id}`,
    text: row.question_text ?? row.text ?? "",
    preview: row.question_text ?? row.text ?? "",
    course: row.course?.code ?? row.course_code ?? row.course ?? "",
    courseId: row.course_id ? String(row.course_id) : "",
    subject: row.subject?.name ?? row.subject_name ?? row.subject ?? "",
    module: row.module?.name ?? row.module_name ?? row.module ?? "",
    competencyUnit:
      row.competency_unit?.name ??
      row.competencyUnit?.name ??
      row.competency_unit_name ??
      "",
    element: row.element?.name ?? row.element_name ?? row.element ?? "",
    type:
      row.question_type === "DESCRIPTIVE"
        ? "Descriptive"
        : row.question_type === "MULTIPLE_CORRECT"
          ? "Multiple Correct"
          : row.question_type === "SINGLE_CORRECT"
            ? "Single Correct"
            : (row.type ?? "MCQ"),
    difficulty: row.difficulty ?? "Medium",
    marks: Number(row.marks ?? 2),
    status:
      String(row.status ?? "ACTIVE").toUpperCase() === "ACTIVE"
        ? "Active"
        : "Inactive",
    options,
    correctOptionIds: row.correctOptionIds ?? correct,
  };
};
const readMock = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    const base = Array.isArray(saved) ? saved : seedQuestions;
    return clone([
      ...base,
      ...seedQuestions.filter(q => !base.some(x => x.id === q.id)),
    ]);
  } catch {
    return clone(seedQuestions);
  }
};
const notify = () => window.dispatchEvent(new CustomEvent(questionUpdateEvent));
// `apiCache` stays null until the first successful fetch resolves, so its
// presence doubles as a "has real data arrived yet" flag — same approach as
// isExamRecordsLoaded()/isAcademicRecordsLoaded() in the sibling stores.
// Used by QuestionListPage (examination-pages.jsx) so it can show a
// genuine "Loading…" state instead of an empty table on first mount.
const isQuestionRecordsLoaded = () => isMockMode || apiCache !== null;
// Real "page N of M fetched" progress through fetchAll()'s own page loop
// below — not a simulated animation. Total is only known once the first
// page's last_page comes back, so it starts at { done: 0, total: 0 } (no
// bar shown) until then.
let loadProgress = { done: 0, total: 0 };
const getQuestionLoadProgress = () => ({ ...loadProgress });
/**
 * Question Bank listings are paginated server-side (max 100 per page, see
 * QuestionController). A single request therefore only ever returns the
 * first page — any records beyond page 1 were silently invisible in the
 * UI even though they existed in the database. Loop through every page
 * so the Question Bank always reflects the true total.
 */
const fetchAll = async () => {
  const rows = [];
  let page = 1;
  loadProgress = { done: 0, total: 0 };
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const response = await apiClient.get("/v1/admin/questions", {
      // Matches the backend's raised pagination_max (config/isdb.php) —
      // this question bank alone can easily hold 200+ rows, which used
      // to mean 2-3+ sequential page-by-page round trips every time the
      // Question Bank page loaded; one page at 500 covers it.
      params: { per_page: 500, page },
    });
    const payload = response.data?.data;
    const pageItems = Array.isArray(payload) ? payload : (payload?.data ?? []);
    rows.push(...pageItems);
    const lastPage = Array.isArray(payload) ? 1 : (payload?.last_page ?? 1);
    loadProgress = { done: page, total: lastPage };
    notify();
    if (page >= lastPage || pageItems.length === 0) break;
    page += 1;
  }
  return rows.map(normalize);
};
/**
 * Fetch fresh Question Bank data. Passive callers (getQuestionRecords, when
 * there's no cache yet) may safely reuse an already-running fetch. But a
 * caller that just saved a record needs a fetch that is guaranteed to start
 * AFTER the save — reusing an older in-flight fetch (started before the
 * save) would resolve with data missing the just-created/updated record,
 * which is exactly the "saved to DB but not showing in the list" bug.
 */
const refreshQuestions = (options = {}) => {
  if (isMockMode) return Promise.resolve(readMock());
  const { force = false } = options;
  if (inFlight && !force) return inFlight;
  const waitForCurrent =
    force && inFlight ? inFlight.catch(() => undefined) : Promise.resolve();
  const p = waitForCurrent
    .then(() => fetchAll())
    .then(rows => {
      apiCache = rows;
      notify();
      return rows;
    })
    .finally(() => {
      if (inFlight === p) inFlight = null;
    });
  inFlight = p;
  return p;
};
const getQuestionRecords = () => {
  if (isMockMode) {
    const rows = readMock();
    localStorage.setItem(storageKey, JSON.stringify(rows));
    return rows;
  }
  if (!apiCache)
    refreshQuestions().catch(error =>
      console.error("Failed to load Question Bank.", error)
    );
  return clone(apiCache ?? []);
};
const saveMock = data => {
  const records = readMock();
  const record = { id: data.id ?? `question-${crypto.randomUUID()}`, ...data };
  if (
    records.some(
      q =>
        q.id !== record.id &&
        q.text.trim().toLowerCase() === record.text.trim().toLowerCase() &&
        q.course === record.course
    )
  )
    throw new Error("An identical question already exists for this course.");
  const next = records.some(q => q.id === record.id)
    ? records.map(q => (q.id === record.id ? record : q))
    : [...records, record];
  localStorage.setItem(storageKey, JSON.stringify(next));
  notify();
  return record;
};
const payloadFor = data => ({
  question_code: data.code || undefined,
  question_text: data.text,
  question_type:
    data.type === "Descriptive"
      ? "DESCRIPTIVE"
      : data.type === "Multiple Correct"
        ? "MULTIPLE_CORRECT"
        : "SINGLE_CORRECT",
  course_id: Number(data.courseId || data.course),
  subject_id: Number(data.subjectId),
  module_id: Number(data.moduleId),
  competency_unit_id: Number(data.competencyUnitId),
  element_id: Number(data.elementId),
  difficulty: data.difficulty || "MEDIUM",
  marks: Number(data.marks || 2),
  status: String(data.status || "Active").toUpperCase(),
  options: (data.options || []).map((text, index) => ({
    option_key: String.fromCharCode(65 + index),
    option_text: text,
    option_order: index + 1,
    is_correct: (data.correctOptionIds || []).includes(String(index)),
  })),
});
const saveQuestionRecord = async data => {
  if (isMockMode) return saveMock(data);
  const payload = payloadFor(data);
  try {
    const response = data.id
      ? await apiClient.put(`/v1/admin/questions/${data.id}`, payload)
      : await apiClient.post("/v1/admin/questions", payload);
    // normalize() only needs this response's own row, so the "Save
    // question" button doesn't need to wait on a full question-bank
    // reload (which, with a 200+ row bank, is the single most expensive
    // refresh in this store) — return immediately and let the bank
    // refresh in the background; the question list updates via
    // questionUpdateEvent the moment that finishes.
    refreshQuestions({ force: true }).catch(() => undefined);
    return normalize(response.data?.data ?? response.data);
  } catch (error) {
    const errors = error?.response?.data?.data?.errors;
    const message = errors
      ? Object.values(errors).flat().join(" ")
      : (error?.response?.data?.message ??
        error?.message ??
        "Could not save this question.");
    throw new Error(message);
  }
};
export {
  getQuestionLoadProgress,
  getQuestionRecords,
  isQuestionRecordsLoaded,
  questionUpdateEvent,
  refreshQuestions,
  saveQuestionRecord,
};
