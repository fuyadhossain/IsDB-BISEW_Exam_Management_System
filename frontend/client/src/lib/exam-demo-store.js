/** Demonstration exam domain: browser persistence mirrors the Laravel models for lifecycle, dynamic attempts, and fixed monthly papers. */
import {
  examSets as seedExamSets,
  exams as seedExams,
  students,
} from "@/lib/mock-data";
import { getQuestionRecords } from "@/lib/question-demo-store";
import { apiClient, isMockMode } from "@/services/api-client";

const storageKey = "isdb_exam_demo_records_v3";
const updateEvent = "isdb-exam-demo-update";
const attemptPrefix = "isdb_exam_online_attempt_";
const copy = value => JSON.parse(JSON.stringify(value));
const nowIso = () => new Date().toISOString();
const deliveryFor = setType => (setType === "MONTHLY" ? "OFFLINE" : "ONLINE");
const normaliseDeliveryMode = (value, setType) => {
  const token = String(value ?? "").toUpperCase();
  return token.includes("ONLINE")
    ? "ONLINE"
    : token.includes("OFFLINE")
      ? "OFFLINE"
      : deliveryFor(setType);
};
const normaliseStatus = (value, fallback = "Ready") => {
  const token = String(value ?? "").toLowerCase();
  // Every catalogued backend status must be listed here, even ones that
  // don't yet have a distinct display treatment. Previously "draft" (and
  // any other unmapped value) silently fell through to the `fallback`
  // argument, which defaults to "Ready" — so a freshly created exam that
  // was actually still DRAFT on the server showed up in the admin UI as
  // "Ready" (with a working-looking "Start" button), even though nothing
  // had actually made it visible to students yet.
  return (
    {
      draft: "Draft",
      available: "Ready",
      ready: "Ready",
      scheduled: "Scheduled",
      running: "Running",
      started: "Running",
      // PROCESSING is a real backend status: ResultService::process()
      // flips an exam from ENDED to PROCESSING the moment the FIRST
      // attempt (of possibly several, including ones auto-submitted by
      // ExamLifecycleService::submitAbandonedAttempts() right after a
      // manual Stop) gets its result computed. Before this was listed
      // here, that value fell through to the "Ready" fallback below —
      // so stopping a Running exam could flash straight back to "Ready"
      // with a working Start button the moment any student's result
      // finished processing, instead of showing as completed.
      processing: "Completed",
      completed: "Completed",
      ended: "Completed",
    }[token] ?? fallback
  );
};
const courseFromBatch = batch => String(batch ?? "").split("/")[0] || "";
const normaliseSet = record => {
  const setType =
    record.setType ??
    (record.id === "set-2" || record.name?.toLowerCase().includes("mid")
      ? "MID_MONTHLY"
      : "MONTHLY");
  return {
    ...record,
    allBatches: Boolean(record.allBatches),
    course: record.course ?? courseFromBatch(record.batch),
    setType,
    deliveryMode: normaliseDeliveryMode(record.deliveryMode, setType),
    status: normaliseStatus(record.status, "Available"),
  };
};
const normaliseExam = (record, examSets = seedExamSets) => {
  const inferredType =
    record.setType ??
    (record.type?.toLowerCase().includes("mid") ? "MID_MONTHLY" : "MONTHLY");
  // Match strictly by id first, then by name, then by setType — as
  // separate passes, not one `||`-chained `.find()`. A single chained
  // find() stops at the FIRST array item satisfying ANY of the three
  // conditions, so when two exam sets share the same setType (e.g. two
  // "Mid Monthly" sets, one per batch), a set earlier in the array could
  // satisfy the `setType` clause and get returned even though this
  // record's real id/name match is a different set later in the array —
  // silently attaching the wrong batch to the exam.
  const set =
    examSets.find(item => item.id === record.examSetId) ??
    examSets.find(item => item.name === record.examSet) ??
    examSets.find(item => item.setType === inferredType);
  const setType = inferredType;
  const deliveryMode = normaliseDeliveryMode(record.deliveryMode, setType);
  return {
    ...record,
    examSetId: record.examSetId ?? set?.id ?? null,
    setType,
    deliveryMode,
    course: record.course ?? set?.course ?? courseFromBatch(record.batch),
    batch: record.batch ?? set?.batch,
    batchId: record.batchId ?? set?.batchId ?? null,
    allBatches: Boolean(record.allBatches ?? set?.allBatches),
    questions:
      setType === "MID_MONTHLY" && deliveryMode === "ONLINE"
        ? 25
        : (record.questions ?? 25),
    totalMarks: 50,
    passMarks: record.passMarks ?? 25,
    status: normaliseStatus(record.status),
    questionPlan: record.questionPlan ?? [],
    questionShuffleEnabled:
      record.questionShuffleEnabled ?? setType === "MID_MONTHLY",
  };
};
const createOnlineDemoExam = () => {
  const start = new Date(Date.now() - 5 * 60 * 1000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return normaliseExam({
    id: "exam-online-demo",
    examSetId: "set-2",
    examSet: "Mid Monthly",
    number: "01",
    title: "Mid Monthly Examination 01",
    setType: "MID_MONTHLY",
    deliveryMode: "ONLINE",
    batch: "PWAD/CCSL-M/71/01",
    batchId: "batch-1",
    course: "PWAD",
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    duration: 30,
    questions: 25,
    totalMarks: 50,
    passMarks: 25,
    status: "Ready",
    distribution: ["Online dynamic question distribution"],
    questionPlan: [],
  });
};
const seed = {
  examSets: seedExamSets.map(normaliseSet),
  exams: [
    ...seedExams.map(exam => normaliseExam(exam)),
    createOnlineDemoExam(),
  ],
};
let apiCache = null;
let apiInFlight = null;
const unwrapCollection = response => {
  const payload = response.data?.data;
  return Array.isArray(payload) ? payload : (payload?.data ?? []);
};
const batchDisplayCode = batch => {
  if (!batch || typeof batch !== "object") return batch;
  if (batch.display_code) return batch.display_code;
  // Fallback kept in sync with Batch::displayCode() on the backend
  // (course/tsp-shiftLetter/round/batchNumber, e.g. "PWAD/CCSL-M/71/01") so
  // exam-set/exam labels never fall back to a bare batch number like "01"
  // when `display_code` isn't present on the payload.
  const shiftLetter = String(batch.shift ?? "")
    .charAt(0)
    .toUpperCase();
  const tspShift = [batch.tsp?.code, shiftLetter].filter(Boolean).join("-");
  const paddedNumber =
    batch.batch_number !== undefined && batch.batch_number !== null
      ? String(batch.batch_number).padStart(2, "0")
      : null;
  return (
    [batch.course?.code, tspShift || null, batch.round?.code, paddedNumber]
      .filter(Boolean)
      .join("/") || batch.batch_number
  );
};
const normalizeApiSet = row =>
  normaliseSet({
    id: String(row.id),
    name: row.name,
    course: row.batch?.course?.code ?? row.course?.code ?? row.course,
    batch: batchDisplayCode(row.batch) ?? row.batch,
    batchId: row.batch_id ? String(row.batch_id) : null,
    allBatches: Boolean(row.all_batches),
    setType: row.name?.toLowerCase().includes("mid")
      ? "MID_MONTHLY"
      : "MONTHLY",
    deliveryMode: row.name?.toLowerCase().includes("mid")
      ? "ONLINE"
      : "OFFLINE",
    status: row.status,
  });
const normalizeApiExam = (row, examSets) =>
  normaliseExam(
    {
      id: String(row.id),
      examSetId: String(row.exam_set_id),
      number: row.exam_number,
      title: row.exam_title,
      setType: row.exam_type?.toLowerCase().includes("mid")
        ? "MID_MONTHLY"
        : "MONTHLY",
      deliveryMode: row.mode === "ONLINE" ? "ONLINE" : "OFFLINE",
      startDate: row.start_at,
      endDate: row.end_at,
      duration: row.duration,
      status: row.status,
      batch: row.examSet?.batch?.display_code,
      course: row.examSet?.batch?.course?.code,
      // Only present when the caller (fetchExamForEdit) rebuilt it from
      // the single-exam endpoint's modules/competencyUnits relations —
      // the plain list endpoint never provides this, so it defaults to
      // [] via normaliseExam and the edit form shows nothing, same as
      // before, for exams fetched only through the list.
      questionPlan: row.questionPlan ?? [],
    },
    // Without this, normaliseExam's default param silently matched every
    // real API exam against the small hardcoded MOCK seed exam sets
    // instead of the actual exam sets just fetched from Laravel — so a
    // real exam's displayed batch always ended up as whichever mock set
    // happened to share its setType (e.g. the seed's "Mid Monthly" /
    // BDS-batch set), no matter which real exam set the exam actually
    // belonged to.
    examSets
  );
/**
 * force: true guarantees a fetch that starts after this call — used right
 * after creating/updating an exam set or exam, so the refreshed list is
 * never resolved from a fetch that began before the save (which would
 * resolve without the new/changed row — see the same fix applied in
 * academic-demo-store.js, question-demo-store.js, admin-user-store.js).
 */
// Real progress through this store's own sequential load (exam-sets, then
// exams) — a genuine "N of total requests done" count, not a simulated
// percentage. Exposed via getExamLoadProgress(); combined with academic
// store's own progress in useExamWorkflowLoading() (exam-workflow-pages.jsx)
// since exam/exam-set pages depend on both.
let examLoadProgress = { done: 0, total: 0 };
const getExamLoadProgress = () => ({ ...examLoadProgress });
const refreshFromApi = (options = {}) => {
  if (isMockMode) return Promise.resolve(read());
  const { force = false } = options;
  if (apiInFlight && !force) return apiInFlight;
  const waitForCurrent =
    force && apiInFlight
      ? apiInFlight.catch(() => undefined)
      : Promise.resolve();
  const p = waitForCurrent
    .then(async () => {
      // Two calls (not the 5-9 in academic-demo-store.js), so less prone
      // to saturating the shared host's PHP worker limit on its own, but
      // sequenced anyway for the same reason and for consistency with the
      // fix there — no request depends on the other, but nothing here is
      // latency-critical enough to justify risking a worker-queue pile-up
      // on every Publish/Start/Stop refresh.
      examLoadProgress = { done: 0, total: 2 };
      const sets = await apiClient.get("/v1/admin/exam-sets", {
        params: { per_page: 100 },
      });
      examLoadProgress = { done: 1, total: 2 };
      window.dispatchEvent(new CustomEvent(updateEvent));
      const exams = await apiClient.get("/v1/admin/exams", {
        params: { per_page: 100 },
      });
      examLoadProgress = { done: 2, total: 2 };
      return [sets, exams];
    })
    .then(([sets, exams]) => {
      const normalizedSets = unwrapCollection(sets).map(normalizeApiSet);
      apiCache = {
        examSets: normalizedSets,
        exams: unwrapCollection(exams).map(row =>
          normalizeApiExam(row, normalizedSets)
        ),
      };
      window.dispatchEvent(new CustomEvent(updateEvent));
      return apiCache;
    })
    .finally(() => {
      if (apiInFlight === p) apiInFlight = null;
    });
  apiInFlight = p;
  return p;
};

const reconcile = records => {
  const time = Date.now();
  return {
    ...records,
    exams: records.exams.map(exam => {
      const start = new Date(exam.startDate).getTime();
      const end = new Date(exam.endDate).getTime();
      if (
        (exam.status === "Available" ||
          exam.status === "Ready" ||
          exam.status === "Scheduled") &&
        Number.isFinite(start) &&
        time >= start &&
        (!Number.isFinite(end) || time < end)
      )
        return {
          ...exam,
          status: "Running",
          startedAt: exam.startedAt ?? nowIso(),
          startedBy: "Automatic schedule",
        };
      if (
        (exam.status === "Ready" ||
          exam.status === "Scheduled" ||
          exam.status === "Running") &&
        Number.isFinite(end) &&
        time >= end
      )
        return {
          ...exam,
          status: "Completed",
          completedAt: exam.completedAt ?? nowIso(),
          completedBy: exam.completedBy ?? "Automatic schedule",
        };
      return exam;
    }),
  };
};
const read = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    const base = saved?.examSets && saved?.exams ? saved : seed;
    const missingSeedExams = seed.exams.filter(
      exam => !base.exams.some(stored => stored.id === exam.id)
    );
    const missingSeedSets = seed.examSets.filter(
      set => !base.examSets.some(stored => stored.id === set.id)
    );
    const uniqueExamEntries = Array.from(
      new Map(
        [...base.exams, ...missingSeedExams].map((exam, index) => [
          String(exam.id ?? `legacy-${index}`),
          exam,
        ])
      ).values()
    );
    const examSets = [...base.examSets, ...missingSeedSets]
      .map(normaliseSet)
      .map(set =>
        set.id === "set-2" && set.batchId === "batch-2" && !set.updatedAt
          ? {
              ...set,
              batch: "PWAD/CCSL-M/71/01",
              batchId: "batch-1",
              course: "PWAD",
            }
          : set
      );
    return reconcile(
      copy({
        ...base,
        examSets,
        exams: uniqueExamEntries.map(exam => normaliseExam(exam, examSets)),
      })
    );
  } catch {
    return copy(seed);
  }
};
const write = records => {
  const next = reconcile(records);
  localStorage.setItem(storageKey, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(updateEvent));
  return next;
};
let lastFetchAt = 0;
const apiPollIntervalMs = 3000; // admin exam list polls every ~1s; re-fetch from Laravel a few times a minute so schedule-based start/stop show up without a manual action
// `apiCache` stays null until the very first successful fetch resolves, so
// its presence doubles as a "has real data arrived yet" flag — same
// approach as isAcademicRecordsLoaded() in academic-demo-store.js. Used by
// useExamRecordsLoading() in exam-workflow-pages.jsx so exam/exam-set list
// pages can show a genuine "Loading…" state instead of an empty table
// while the first fetch is still in flight.
const isExamRecordsLoaded = () => isMockMode || apiCache !== null;
const getExamRecords = () => {
  if (!isMockMode) {
    const now = Date.now();
    if (!apiCache || now - lastFetchAt > apiPollIntervalMs) {
      lastFetchAt = now;
      refreshFromApi().catch(error =>
        console.error("Failed to load exams from Laravel.", error)
      );
    }
    return copy(apiCache ?? { examSets: [], exams: [] });
  }
  const records = read();
  localStorage.setItem(storageKey, JSON.stringify(records));
  return records;
};
const getExamSet = id => getExamRecords().examSets.find(item => item.id === id);
const getExam = id => getExamRecords().exams.find(item => item.id === id);
/**
 * The exam list (/v1/admin/exams, used by getExam/getExamRecords) never
 * loads the modules/competencyUnits relations, and normalizeApiExam never
 * maps them even when present — so an exam's questionPlan is always []
 * from the cached list, no matter what was actually configured via
 * PUT /exams/{id}/configuration. That made the edit form always render
 * "no competency unit added", even right after successfully saving one.
 * This fetches the single exam (which DOES eager-load those relations,
 * see ExamController::showExam) and rebuilds questionPlan from the
 * saved subjects/modules/competencyUnits so the edit form can restore
 * the admin's actual selection.
 */
const fetchExamForEdit = id => {
  if (isMockMode) return Promise.resolve(getExam(id));
  return apiClient.get(`/v1/admin/exams/${id}`).then(response => {
    const row = response.data?.data ?? response.data;
    const modulesById = new Map((row.modules ?? []).map(m => [m.id, m]));
    const groups = new Map();
    (row.competency_units ?? []).forEach(cu => {
      const moduleName = modulesById.get(cu.module_id)?.name ?? "";
      const group = groups.get(moduleName) ?? {
        module: moduleName,
        competencyUnits: [],
        questionNumber: 0,
      };
      group.competencyUnits.push(cu.name);
      group.questionNumber += Number(cu.pivot?.question_count ?? 0);
      groups.set(moduleName, group);
    });
    const questionPlan = Array.from(groups.values());
    // On a cold navigation straight to an exam's edit URL (page refresh,
    // direct link, no prior visit to the exam list), this single-exam
    // fetch can resolve before refreshFromApi()'s own Promise.all does —
    // apiCache is still null at that point, so `apiCache.examSets` threw
    // straight into ExamFormPage's render ("Cannot read properties of
    // null"). Guard it the same way every other reader of apiCache does.
    return normalizeApiExam({ ...row, questionPlan }, apiCache?.examSets ?? []);
  });
};
const createExamSet = data => {
  if (!isMockMode)
    return apiClient
      .post("/v1/admin/exam-sets", {
        batch_id: Number(data.batchId),
        name: data.name,
        code: data.code ?? null,
        status: String(data.status ?? "READY").toUpperCase(),
      })
      .then(response =>
        refreshFromApi({ force: true }).then(() =>
          normalizeApiSet(response.data?.data ?? response.data)
        )
      );
  const course = String(data.course ?? "").trim();
  if (!course) throw new Error("Select the course covered by this exam set.");
  if (!data.allBatches && !data.batchId)
    throw new Error("Select a batch or choose All batches.");
  const records = read();
  const item = normaliseSet({
    id: crypto.randomUUID(),
    exams: 0,
    createdAt: nowIso(),
    ...data,
    course,
  });
  return write({
    ...records,
    examSets: [...records.examSets, item],
  }).examSets.find(entry => entry.id === item.id);
};
const updateExamSet = (id, data) => {
  if (!isMockMode)
    return apiClient
      .put(`/v1/admin/exam-sets/${id}`, {
        batch_id: Number(data.batchId),
        name: data.name,
        code: data.code ?? null,
        status: String(data.status ?? "READY").toUpperCase(),
      })
      .then(response =>
        refreshFromApi({ force: true }).then(() =>
          normalizeApiSet(response.data?.data ?? response.data)
        )
      );
  const records = read();
  const existing = records.examSets.find(item => item.id === id);
  if (!existing) throw new Error("Exam set record was not found.");
  const course = String(data.course ?? existing.course ?? "").trim();
  if (!course) throw new Error("Select the course covered by this exam set.");
  if (!data.allBatches && !data.batchId)
    throw new Error("Select a batch or choose All batches.");
  const item = normaliseSet({
    ...existing,
    ...data,
    id,
    course,
    updatedAt: nowIso(),
  });
  return write({
    ...records,
    examSets: records.examSets.map(entry => (entry.id === id ? item : entry)),
  }).examSets.find(entry => entry.id === id);
};
const assertWindow = data => {
  const start = new Date(data.startDate).getTime();
  const end = new Date(data.endDate).getTime();
  const durationMs = Number(data.duration) * 60 * 1000;
  if (!Number.isFinite(start) || !Number.isFinite(end))
    throw new Error("Provide valid opening and closing times.");
  if (Number(data.duration) < 1)
    throw new Error("Exam duration must be at least one minute.");
  if (end < start + durationMs)
    throw new Error(
      "Closing time cannot be earlier than the start time plus the exam duration."
    );
};
const eligibleQuestionBank = (exam, includeDescriptive) => {
  const active = getQuestionRecords().filter(
    question => question.status === "Active" && question.course === exam.course
  );
  const matchesPlan = exam.questionPlan?.length
    ? active.filter(question =>
        exam.questionPlan.some(
          plan =>
            (!plan.subject || question.subject === plan.subject) &&
            (!plan.module || question.module.startsWith(plan.module)) &&
            (!plan.competencyUnit ||
              question.competencyUnit.startsWith(plan.competencyUnit)) &&
            (!plan.element || question.element.startsWith(plan.element))
        )
      )
    : active;
  const pool = matchesPlan.length ? matchesPlan : active;
  return pool.filter(question =>
    includeDescriptive
      ? question.type === "Descriptive"
      : question.type !== "Descriptive" && question.options?.length >= 2
  );
};
const buildOfflinePaper = exam => {
  if (
    exam.offlinePaper?.mcq?.length === 23 &&
    exam.offlinePaper?.descriptive?.length === 2
  )
    return copy(exam.offlinePaper);
  const mcq = eligibleQuestionBank(exam, false)
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, 23);
  const descriptive = eligibleQuestionBank(exam, true)
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, 2);
  if (mcq.length < 23 || descriptive.length < 2)
    return {
      available: false,
      missingMcq: Math.max(0, 23 - mcq.length),
      missingDescriptive: Math.max(0, 2 - descriptive.length),
      mcq,
      descriptive,
    };
  return {
    available: true,
    title: `${exam.title} · Printable paper`,
    instructions:
      "Answer all 25 questions. The paper is identical for every student and no question shuffle is applied.",
    mcq: mcq.map((question, index) => ({
      no: index + 1,
      id: question.id,
      text: question.text,
      options: question.options,
    })),
    descriptive: descriptive.map((question, index) => ({
      no: index + 24,
      id: question.id,
      text: question.text,
    })),
  };
};
const saveExam = data => {
  if (!isMockMode) {
    const payload = {
      exam_set_id: Number(data.examSetId),
      exam_number: String(data.number),
      exam_title: data.title,
      exam_type: data.setType,
      mode: data.deliveryMode,
      status: "DRAFT",
      duration: Number(data.duration),
      max_marks: 50,
      pass_marks: Number(data.passMarks ?? 25),
      start_at: data.startDate,
      end_at: data.endDate,
    };
    const request = data.id
      ? apiClient.put(`/v1/admin/exams/${data.id}`, payload)
      : apiClient.post("/v1/admin/exams", payload);
    return request.then(response => {
      const saved = response.data?.data ?? response.data;
      const examId = saved?.id ?? data.id;
      // The module/competency-unit distribution built in the Question
      // Distribution UI is a SEPARATE write from creating/updating the exam
      // itself — the backend only persists it via PUT
      // /exams/{exam}/configuration. Skipping this call means every
      // module/competency-unit the admin picked in the form was silently
      // discarded: the exam row was created, but with no distribution at
      // all, which is why it looked like nothing had been saved.
      const configureRequest =
        examId && (data.moduleIds?.length || data.competencyUnitIds?.length)
          ? apiClient.put(`/v1/admin/exams/${examId}/configuration`, {
              subject_ids: data.subjectIds ?? [],
              module_ids: data.moduleIds ?? [],
              competency_unit_ids: data.competencyUnitIds ?? [],
              // Per-competency-unit question counts derived from each
              // module's "Total questions for this module" field. Without
              // this the backend has no idea how many questions the admin
              // wanted from each unit and falls back to an even split of
              // the fixed exam_type total.
              distribution: data.distribution ?? [],
            })
          : Promise.resolve();
      return configureRequest
        .catch(error => {
          // Surface the backend's actual field-level validation reason
          // (e.g. "competency_unit_ids: must belong to a selected module")
          // instead of just the generic Axios message, so the real cause
          // is visible in the console instead of requiring a network trace.
          console.error(
            "Failed to save exam question distribution.",
            error?.response?.data ?? error
          );
          throw new Error(
            "Exam saved, but the module/competency-unit distribution failed to save. Please edit the exam and try again."
          );
        })
        .then(() =>
          refreshFromApi({ force: true }).then(() =>
            normalizeApiExam(saved, apiCache.examSets)
          )
        );
    });
  }
  assertWindow(data);
  const startDate = new Date(data.startDate).toISOString();
  const endDate = new Date(data.endDate).toISOString();
  const records = read();
  const set = records.examSets.find(item => item.id === data.examSetId);
  if (!set) throw new Error("The selected exam set is no longer available.");
  const taken = records.exams.some(
    item =>
      item.id !== data.id &&
      item.examSetId === data.examSetId &&
      String(item.number) === String(data.number)
  );
  if (taken)
    throw new Error(
      `Exam number ${data.number} is already taken for this exam set.`
    );
  const base = normaliseExam({
    id: data.id ?? crypto.randomUUID(),
    createdAt: nowIso(),
    ...data,
    startDate,
    endDate,
    batch: set.allBatches ? "All batches" : set.batch,
    batchId: set.allBatches ? null : set.batchId,
    course: set.course,
    allBatches: Boolean(set.allBatches),
    examSet: set.name,
    setType: set.setType,
    deliveryMode: set.deliveryMode,
    totalMarks: 50,
    status: data.status === "Available" ? "Ready" : (data.status ?? "Ready"),
  });
  const item =
    base.deliveryMode === "OFFLINE"
      ? { ...base, offlinePaper: buildOfflinePaper(base) }
      : base;
  if (item.deliveryMode === "OFFLINE" && !item.offlinePaper.available)
    throw new Error(
      `Monthly paper needs ${item.offlinePaper.missingMcq} more MCQ and ${item.offlinePaper.missingDescriptive} more descriptive Question Bank records for ${item.course}.`
    );
  const nextExams = data.id
    ? records.exams.map(entry => (entry.id === data.id ? item : entry))
    : [...records.exams, item];
  const nextSets = records.examSets.map(entry =>
    entry.id === item.examSetId
      ? {
          ...entry,
          exams: nextExams.filter(exam => exam.examSetId === entry.id).length,
        }
      : entry
  );
  return write({ examSets: nextSets, exams: nextExams }).exams.find(
    entry => entry.id === item.id
  );
};
/**
 * Move a freshly created exam out of DRAFT so it can actually be started
 * and shown to students. The backend only allows one hop at a time
 * (DRAFT -> SCHEDULED -> READY, see ExamService::transition), and no
 * screen previously called this endpoint at all — a new exam had no way
 * to leave DRAFT except direct database access. This chains both hops.
 */
const publishExam = id => {
  if (!isMockMode) {
    const step = status =>
      apiClient.post(`/v1/admin/exams/${id}/transition`, { status });
    // Only hop through SCHEDULED when the exam is still DRAFT — an exam
    // that's already SCHEDULED (e.g. a previous publish attempt got this
    // far before failing at the READY step) must go straight to READY.
    // Unconditionally calling step("SCHEDULED") first used to send a
    // SCHEDULED -> SCHEDULED transition for those exams, which the
    // backend's allowed-transitions map rejects with a 422 ("Invalid
    // exam transition from SCHEDULED to SCHEDULED") before ever
    // attempting the READY step — so Publish silently failed for any
    // exam past DRAFT.
    return apiClient
      .get(`/v1/admin/exams/${id}`)
      .then(response => {
        const current = (response.data?.data ?? response.data)?.status;
        return current === "DRAFT" ? step("SCHEDULED") : Promise.resolve();
      })
      .then(() => step("READY"))
      .then(response =>
        refreshFromApi({ force: true }).then(() =>
          normalizeApiExam(
            response.data?.data ?? response.data,
            apiCache.examSets
          )
        )
      );
  }
  const records = read();
  const exam = records.exams.find(entry => entry.id === id);
  if (!exam) throw new Error("Exam record was not found.");
  if (exam.status !== "Draft" && exam.status !== "Scheduled")
    throw new Error("Only a Draft or Scheduled exam can be published.");
  return write({
    ...records,
    exams: records.exams.map(entry =>
      entry.id === id ? { ...entry, status: "Ready" } : entry
    ),
  }).exams.find(entry => entry.id === id);
};
const changeExamStatus = (id, action) => {
  if (!isMockMode)
    return apiClient
      .post(`/v1/admin/exams/${id}/${action === "START" ? "start" : "stop"}`)
      .then(response =>
        refreshFromApi({ force: true }).then(() =>
          normalizeApiExam(
            response.data?.data ?? response.data,
            apiCache.examSets
          )
        )
      );
  const records = read();
  const exam = records.exams.find(entry => entry.id === id);
  if (!exam) throw new Error("Exam record was not found.");
  if (action === "START" && exam.status !== "Ready")
    throw new Error("Only a Ready exam can be started manually.");
  if (action === "STOP" && exam.status !== "Running")
    throw new Error("Only a Running exam can be stopped manually.");
  const update =
    action === "START"
      ? { status: "Running", startedAt: nowIso(), startedBy: "Administrator" }
      : {
          status: "Completed",
          completedAt: nowIso(),
          completedBy: "Administrator",
        };
  return write({
    ...records,
    exams: records.exams.map(entry =>
      entry.id === id ? { ...entry, ...update } : entry
    ),
  }).exams.find(entry => entry.id === id);
};
const availableNumbers = setId => {
  const taken = new Set(
    getExamRecords()
      .exams.filter(exam => exam.examSetId === setId)
      .map(exam => String(exam.number))
  );
  return Array.from({ length: 12 }, (_, index) =>
    String(index + 1).padStart(2, "0")
  ).map(number => ({ number, taken: taken.has(number) }));
};
const matchesStudentAssignment = (exam, student) => {
  const set = getExamSet(exam.examSetId);
  const studentCourse = String(student.batch ?? "").split("/")[0];
  const examBatchId = exam.batchId ?? set?.batchId;
  const examCourse = exam.course ?? set?.course ?? courseFromBatch(exam.batch);
  const allBatches = Boolean(exam.allBatches ?? set?.allBatches);
  return allBatches
    ? examCourse === studentCourse
    : examBatchId === student.batchId || exam.batch === student.batch;
};
const matchesStudent = (exam, student) =>
  exam.deliveryMode === "ONLINE" && matchesStudentAssignment(exam, student);
const availabilityForStudent = studentId => {
  const student = students.find(item => item.studentId === studentId);
  if (!student) return { ok: false, availability: "INELIGIBLE" };
  // Mirror the real backend's login response shape: identity is verified
  // (the student exists) independently of whether an exam happens to be
  // available right now, so every branch below — available, not yet open,
  // wrong batch, no active exam, etc. — should still carry the verified
  // profile. Without this, mock mode couldn't show the student's own name
  // on the instructions page, and (before the login-page fix) unavailable
  // exams looked identical to a genuinely failed login.
  const profile = {
    name: student.name,
    studentId: student.studentId,
    dateOfBirth: student.dob,
    status: student.status,
  };
  return { ...computeAvailabilityForStudent(student), profile };
};
const computeAvailabilityForStudent = student => {
  const records = getExamRecords();
  const assigned = records.exams.filter(exam =>
    matchesStudentAssignment(exam, student)
  );
  const candidates = assigned.filter(exam => exam.deliveryMode === "ONLINE");
  const now = Date.now();
  const running = candidates.find(exam => exam.status === "Running");
  const runningOffline = assigned.find(
    exam => exam.deliveryMode === "OFFLINE" && exam.status === "Running"
  );
  if (!running && runningOffline)
    return {
      ok: false,
      availability: "OFFLINE_ONLY",
      exam: runningOffline,
      schedule: {
        opensAt: runningOffline.startDate,
        closesAt: runningOffline.endDate,
      },
    };
  const studentCourse = String(student.batch ?? "").split("/")[0];
  const runningInCourse = records.exams.find(
    exam =>
      exam.deliveryMode === "ONLINE" &&
      exam.status === "Running" &&
      (exam.course ?? courseFromBatch(exam.batch)) === studentCourse
  );
  if (
    !running &&
    runningInCourse &&
    !candidates.some(exam => exam.id === runningInCourse.id)
  )
    return {
      ok: false,
      availability: "WRONG_BATCH",
      exam: runningInCourse,
      schedule: {
        opensAt: runningInCourse.startDate,
        closesAt: runningInCourse.endDate,
      },
    };
  if (running) {
    const endAt = new Date(running.endDate).getTime();
    const attemptSeconds = Math.max(
      0,
      Math.min(Number(running.duration) * 60, Math.ceil((endAt - now) / 1000))
    );
    return {
      ok: attemptSeconds > 0,
      availability: attemptSeconds > 0 ? "AVAILABLE" : "EXAM_ENDED",
      exam: running,
      attemptSeconds,
      expiresAt: new Date(now + attemptSeconds * 1000).toISOString(),
      lateEntry: now > new Date(running.startDate).getTime(),
      schedule: { opensAt: running.startDate, closesAt: running.endDate },
    };
  }
  const upcoming = candidates
    .filter(
      exam =>
        ["Ready", "Scheduled"].includes(exam.status) &&
        new Date(exam.startDate).getTime() > now
    )
    .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))[0];
  if (upcoming)
    return {
      ok: false,
      availability: "NOT_YET_AVAILABLE",
      exam: upcoming,
      secondsUntilOpen: Math.ceil(
        (new Date(upcoming.startDate).getTime() - now) / 1000
      ),
      schedule: { opensAt: upcoming.startDate, closesAt: upcoming.endDate },
    };
  if (candidates.some(exam => exam.status === "Completed"))
    return { ok: false, availability: "EXAM_ENDED" };
  return { ok: false, availability: "NO_ACTIVE_EXAM" };
};
const shuffle = items => [...items].sort(() => Math.random() - 0.5);
const getOnlineAttempt = (examId, studentId) => {
  const storageId = `${attemptPrefix}${examId}_${studentId}`;
  try {
    const existing = JSON.parse(sessionStorage.getItem(storageId) ?? "null");
    if (existing?.examId === examId && existing?.studentId === studentId)
      return existing;
  } catch {
    /* build a fresh demonstration attempt */
  }
  const exam = getExam(examId);
  if (!exam || exam.deliveryMode !== "ONLINE") return null;
  const eligibleQuestions = eligibleQuestionBank(exam, false);
  const questionCount =
    exam.setType === "MID_MONTHLY" && exam.deliveryMode === "ONLINE"
      ? 25
      : Number(exam.questions) || 25;
  if (eligibleQuestions.length < questionCount)
    throw new Error(
      `${exam.title} requires ${questionCount} eligible active Question Bank questions, but only ${eligibleQuestions.length} are available.`
    );
  const selected = shuffle(eligibleQuestions).slice(0, questionCount);
  const attempt = {
    id: `attempt-${exam.id}-${studentId}`,
    examId: exam.id,
    studentId,
    title: exam.title,
    examType: "Mid Monthly · Online",
    examNumber: exam.number,
    totalQuestions: selected.length,
    durationMinutes: exam.duration,
    questions: selected.map((question, index) => ({
      id: `${exam.id}-${question.id}`,
      sourceQuestionId: question.id,
      order: index + 1,
      text: question.text,
      options: shuffle(question.options).map((text, optionIndex) => ({
        id: `${question.id}-option-${optionIndex}`,
        text,
      })),
    })),
  };
  sessionStorage.setItem(storageId, JSON.stringify(attempt));
  return attempt;
};

export {
  availabilityForStudent,
  availableNumbers,
  buildOfflinePaper,
  changeExamStatus,
  publishExam,
  createExamSet,
  fetchExamForEdit,
  getExam,
  getExamRecords,
  getExamSet,
  getOnlineAttempt,
  getExamLoadProgress,
  isExamRecordsLoaded,
  saveExam,
  updateEvent,
  updateExamSet,
};
