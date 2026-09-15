/**
 * Academic domain: course, TSP, round, batch, and curriculum records.
 *
 * Mock mode (default, VITE_USE_MOCK_API=true or runtime toggle in Settings):
 * behaves exactly as before — a persistent localStorage-backed demo store.
 *
 * Real mode (mock toggled off, Laravel API base URL configured): every read
 * goes through the Laravel CatalogController endpoints and every write is
 * sent to the API. The functions below keep the exact same names/shape the
 * rest of the app already imports (`getAcademicRecords`, `saveAcademicRecord`,
 * `submitAcademicRecord`, `academicUpdateEvent`) so no page needs new plumbing
 * — only `management-pages.jsx` / `subject-assignment-form.jsx` submit
 * handlers were made to `await` the save, since a real save is a network call.
 */
import {
  batches,
  competencyUnits,
  courses,
  elements,
  modules,
  rounds,
  students,
  subjects,
  tsps,
} from "@/lib/mock-data";
import { apiClient, isMockMode } from "@/services/api-client";

const storageKey = "isdb_academic_demo_records_v1";
const academicUpdateEvent = "isdb-academic-demo-update";
const clone = value => JSON.parse(JSON.stringify(value));
const seed = {
  courses,
  tsps,
  rounds,
  batches,
  students,
  subjects,
  modules,
  competencyUnits,
  elements,
};
const recordPrefix = {
  courses: "course",
  tsps: "tsp",
  rounds: "round",
  batches: "batch",
  students: "student",
  subjects: "subject",
  modules: "module",
  competencyUnits: "cu",
  elements: "element",
};

/* ------------------------------------------------------------------ */
/* Mock-mode persistence (unchanged behaviour)                         */
/* ------------------------------------------------------------------ */
const read = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    return saved && Object.keys(seed).every(kind => Array.isArray(saved[kind]))
      ? clone(saved)
      : clone(seed);
  } catch {
    return clone(seed);
  }
};
const write = records => {
  localStorage.setItem(storageKey, JSON.stringify(records));
  window.dispatchEvent(new CustomEvent(academicUpdateEvent));
  return clone(records);
};
const saveAcademicRecordMock = (kind, data) => {
  if (!Object.hasOwn(seed, kind))
    throw new Error("This academic record type is not supported.");
  const records = read();
  const record = {
    id: data.id ?? `${recordPrefix[kind]}-${crypto.randomUUID()}`,
    ...data,
  };
  const items = records[kind];
  const duplicate = items.some(
    item =>
      item.id !== record.id &&
      ((record.code && item.code === record.code) ||
        (record.identifier && item.identifier === record.identifier) ||
        (kind === "subjects" &&
          item.name?.trim().toLowerCase() ===
            record.name?.trim().toLowerCase()))
  );
  if (duplicate)
    throw new Error("A record with the same identifying value already exists.");
  const next = {
    ...records,
    [kind]: items.some(item => item.id === record.id)
      ? items.map(item => (item.id === record.id ? record : item))
      : [...items, record],
  };
  return write(next)[kind].find(item => item.id === record.id);
};

/* ------------------------------------------------------------------ */
/* Real-mode: Laravel CatalogController wiring                         */
/* ------------------------------------------------------------------ */
const endpointFor = {
  courses: "courses",
  tsps: "tsps",
  rounds: "rounds",
  batches: "batches",
  students: "students",
  subjects: "subjects",
  modules: "modules",
  competencyUnits: "competency-units",
  elements: "elements",
};
// Real routes live under /api/v1/admin/... and require an admin Sanctum token
// (see routes/api.php: Route::prefix('v1')->group(... Route::middleware(['auth:sanctum','admin'])->prefix('admin')->group(...)))
const API_PREFIX = "/v1/admin";
const toTitleStatus = value => {
  const raw = String(value ?? "ACTIVE").toUpperCase();
  if (raw === "ACTIVE") return "Active";
  if (raw === "INACTIVE") return "Inactive";
  if (raw === "COMPLETED") return "Completed";
  return raw.charAt(0) + raw.slice(1).toLowerCase();
};
const toApiStatus = value =>
  String(value ?? "Active")
    .trim()
    .toUpperCase();
const id = value =>
  value === null || value === undefined ? "" : String(value);
/**
 * Laravel's `date` cast serializes to a full ISO datetime string (e.g.
 * "2003-04-12T00:00:00.000000Z"), not the plain "YYYY-MM-DD" that an
 * HTML `<input type="date">` requires as its value/defaultValue. When the
 * two didn't match, the browser silently rendered the field blank on the
 * edit form — so re-submitting without touching the date field sent an
 * empty string, which then failed the backend's `date` validation rule
 * and the whole update was rejected (nothing was saved). Trim any
 * date-ish string down to its first 10 characters so it always matches
 * the input's expected format.
 */
const toDateInputValue = value => {
  if (!value) return "";
  const str = String(value);
  return str.length >= 10 ? str.slice(0, 10) : str;
};

/** Fetch every page of a paginated Laravel resource. */
async function fetchAllPages(endpoint, params = {}) {
  const collected = [];
  let page = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const response = await apiClient.get(`${API_PREFIX}/${endpoint}`, {
      // Matches the backend's isdb.pagination_max (500, see
      // CatalogController) instead of the old hardcoded 100 — any table
      // under 500 rows now loads in a single round trip instead of
      // looping page-by-page, which is what made every admin page's
      // first load (it fetches all nine catalog types up front) slow.
      params: { ...params, per_page: 500, page },
    });
    const paginator = response.data?.data ?? {};
    const pageItems = Array.isArray(paginator.data)
      ? paginator.data
      : Array.isArray(paginator)
        ? paginator
        : [];
    collected.push(...pageItems);
    const lastPage = paginator.last_page ?? 1;
    if (page >= lastPage || pageItems.length === 0) break;
    page += 1;
  }
  return collected;
}
const unwrapOne = response => response.data?.data ?? response.data;

/**
 * Lightweight count-only fetch (per_page=1, reads the paginator's `total`)
 * — used by the dashboard's summary cards, which only need two numbers and
 * previously had to wait on a full fetch-every-page-of-every-catalog-type
 * hydration (see `getAcademicRecords` below) just to render.
 */
async function fetchCount(endpoint, params = {}) {
  const response = await apiClient.get(`${API_PREFIX}/${endpoint}`, {
    params: { ...params, per_page: 1, page: 1 },
  });
  const paginator = response.data?.data ?? {};
  return (
    paginator.total ??
    (Array.isArray(paginator.data) ? paginator.data.length : 0)
  );
}

// Module-level (not component state) so it survives DashboardPage being
// unmounted when the user navigates away and remounted when they come
// back. Without this, every return to /admin/dashboard reset the page's
// local stats state to null and showed the "…" loading placeholder again
// even though we'd already fetched the numbers moments earlier.
let dashboardStatsCache = null;

/**
 * Dashboard-only stats: active course count + active batch count. Fetches
 * just these two lightweight totals instead of routing through the shared
 * academic-records cache, so the dashboard no longer blocks on students,
 * subjects, modules, competency units, and elements finishing their full
 * paginated loads first.
 */
async function fetchDashboardStats() {
  if (isMockMode) {
    const records = read();
    const result = {
      activeCourses: records.courses.filter(
        item => item.status === "Active" || item.status === "ACTIVE"
      ).length,
      activeBatches: records.batches.filter(
        item => item.status === "Active" || item.status === "ACTIVE"
      ).length,
    };
    dashboardStatsCache = result;
    return result;
  }
  const [activeCourses, activeBatches] = await Promise.all([
    fetchCount(endpointFor.courses, { status: "ACTIVE" }),
    fetchCount(endpointFor.batches, { status: "ACTIVE" }),
  ]);
  const result = { activeCourses, activeBatches };
  dashboardStatsCache = result;
  return result;
}

/** Last successfully fetched dashboard stats, or null if none yet this session. */
function getCachedDashboardStats() {
  return dashboardStatsCache;
}

/* Raw Laravel row -> frontend record shape (matches mock-data.js). */
const normalizeCourse = r => ({
  id: id(r.id),
  code: r.code,
  name: r.name,
  duration:
    r.duration_label ??
    (r.duration_months ? `${r.duration_months} months` : ""),
  status: toTitleStatus(r.status),
  batches: r.active_batches_count ?? 0,
});
const normalizeTsp = r => ({
  id: id(r.id),
  code: r.code,
  name: r.name,
  location: r.location ?? "",
  centerManagerMobile: r.center_manager_mobile ?? "",
  status: toTitleStatus(r.status),
  batches: r.batches_count ?? 0,
});
const normalizeRound = r => ({
  id: id(r.id),
  code: r.code,
  name: r.name,
  status: toTitleStatus(r.status),
});
const normalizeBatch = r => {
  // Keep the frontend fallback in sync with the backend's canonical
  // Batch::displayCode() format (course/tsp-shiftLetter/round/batchNumber,
  // e.g. "PWAD/CCSL-M/71/01") so the identifier looks the same everywhere
  // even if `display_code` is ever missing from an API response. The old
  // fallback here just joined every field with "/" in a different order
  // and without the shift-letter suffix (e.g. "PWAD/CCSL/71/Morning/1"),
  // so it didn't match the format shown anywhere else in the app.
  const shiftLetter = String(r.shift ?? "")
    .charAt(0)
    .toUpperCase();
  const tspShift = [r.tsp_code, shiftLetter].filter(Boolean).join("-");
  const paddedNumber = String(r.batch_number ?? "").padStart(2, "0");
  return {
    id: id(r.id),
    identifier:
      r.display_code ??
      [r.course_code, tspShift || null, r.round_code, paddedNumber || null]
        .filter(Boolean)
        .join("/"),
    course: r.course_code ?? "",
    courseId: id(r.course_id),
    tsp: r.tsp_code ?? "",
    tspId: id(r.tsp_id),
    shift: r.shift,
    round: r.round_code ?? "",
    roundId: id(r.round_id),
    batchNumber: paddedNumber,
    startDate: toDateInputValue(r.start_date),
    endDate: toDateInputValue(r.end_date),
    students: r.active_students_count ?? 0,
    capacity: r.capacity ?? 15,
    status: toTitleStatus(r.status),
  };
};
const normalizeStudent = r => ({
  id: id(r.id),
  studentId: r.student_id,
  name: r.name,
  dob: toDateInputValue(r.date_of_birth),
  email: r.email ?? "",
  batch: r.batch_name ?? "",
  batchId: id(r.batch_id),
  batchAssignmentId: id(r.batch_assignment_id),
  status: toTitleStatus(r.status),
  isLocked: Boolean(r.is_locked),
});
const normalizeModule = r => ({
  id: id(r.id),
  name: r.name,
  moduleNumber: r.module_number ?? "",
  course: r.course_code ?? "",
  subject: r.subject_name ?? "",
  subjectId: id(r.subject_id),
  courseId: id(r.course_id),
  status: toTitleStatus(r.status),
});
const normalizeCompetencyUnit = r => ({
  id: id(r.id),
  name: r.name,
  module: r.module_name ?? "",
  moduleId: id(r.module_id),
  subject: r.subject_name ?? "",
  course: r.course_code ?? r.course_name ?? "",
  courseId: id(r.course_id),
  status: toTitleStatus(r.status),
});
const normalizeElement = r => ({
  id: id(r.id),
  name: r.name,
  competencyUnit: r.competency_unit_name ?? "",
  competencyUnitId: id(r.competency_unit_id),
  module: r.module_name ?? "",
  subject: r.subject_name ?? "",
  course: r.course_code ?? r.course_name ?? "",
  status: toTitleStatus(r.status),
});

/**
 * Subjects are stored as one row per course in Laravel (subjects.course_id),
 * but the admin UI treats "subject" as one shared entity assigned to several
 * courses at once. Group raw rows by name so the UI keeps working unchanged,
 * and remember which backend row belongs to which course so saves can be
 * translated back into per-course create/delete calls.
 */
let subjectRowIndex = {};
function normalizeSubjectsGrouped(rawRows) {
  const byName = new Map();
  for (const r of rawRows) {
    const key = String(r.name ?? "")
      .trim()
      .toLowerCase();
    if (!byName.has(key)) byName.set(key, { name: r.name, rows: [] });
    byName.get(key).rows.push(r);
  }
  const grouped = [];
  const index = {};
  for (const { name, rows } of byName.values()) {
    const groupId = `subject-${rows[0].id}`;
    index[groupId] = {
      name,
      rows: rows.map(row => ({
        id: row.id,
        courseId: row.course_id,
        courseCode: row.course_code,
        status: row.status,
      })),
    };
    grouped.push({
      id: groupId,
      name,
      courses: rows.map(row => row.course_code).filter(Boolean),
      courseIds: rows.map(row => id(row.course_id)),
      // Parallel to `courses`/`courseIds` — the per-course backend subject row
      // id, e.g. so a module create form can resolve `subject_id` once a
      // course is chosen: courseRowIds[courses.indexOf(courseCode)].
      courseRowIds: rows.map(row => id(row.id)),
      status: toTitleStatus(
        rows.find(row => row.status === "ACTIVE")?.status ?? rows[0].status
      ),
    });
  }
  subjectRowIndex = index;
  return grouped;
}

/**
 * One cache slice's endpoint + how to turn raw rows into the frontend shape.
 * Every backend row already carries its own denormalized display fields
 * (names, codes, counts) via CatalogController::withRelations/transform, so
 * fetching one slice never requires re-fetching its parents just to render it.
 */
const sliceLoaders = {
  courses: async () =>
    (await fetchAllPages(endpointFor.courses)).map(normalizeCourse),
  tsps: async () => (await fetchAllPages(endpointFor.tsps)).map(normalizeTsp),
  rounds: async () =>
    (await fetchAllPages(endpointFor.rounds)).map(normalizeRound),
  batches: async () =>
    (await fetchAllPages(endpointFor.batches)).map(normalizeBatch),
  students: async () =>
    (await fetchAllPages(endpointFor.students)).map(normalizeStudent),
  subjects: async () =>
    normalizeSubjectsGrouped(await fetchAllPages(endpointFor.subjects)),
  modules: async () =>
    (await fetchAllPages(endpointFor.modules)).map(normalizeModule),
  competencyUnits: async () =>
    (await fetchAllPages(endpointFor.competencyUnits)).map(
      normalizeCompetencyUnit
    ),
  elements: async () =>
    (await fetchAllPages(endpointFor.elements)).map(normalizeElement),
};
const allSliceKeys = Object.keys(sliceLoaders);

/**
 * Which cache slices must be refetched after saving a given record kind.
 *
 * A single save used to trigger a full re-fetch of *every* catalog type
 * (courses, tsps, rounds, batches, students, subjects, modules,
 * competency-units, elements — 9 paginated endpoints, each looped page by
 * page) before the UI would unblock. That is why adding one curriculum
 * record (a subject, a module, ...) felt slow: it was paying for a full
 * reload of the entire academic dataset every time. Since the backend
 * already returns denormalized names/counts per row, saving a record only
 * needs to refresh its own slice, plus the parent slice(s) whose displayed
 * aggregate counts depend on it (e.g. a course's active_batches_count).
 */
const dependentSlicesFor = {
  courses: ["courses"],
  tsps: ["tsps"],
  rounds: ["rounds"],
  batches: ["batches", "courses", "tsps", "rounds"],
  students: ["students", "batches"],
  subjects: ["subjects", "courses"],
  modules: ["modules"],
  competencyUnits: ["competencyUnits"],
  elements: ["elements"],
};

// Real progress through the initial sequential load — genuine "N of total
// slices fetched" counts, not a simulated/animated percentage. Only tracks
// the very first (full, all-slice) load: that's the one slow enough on a
// busy shared host for a progress readout to matter; small dependent-slice
// refetches after a single save stay silent as before. Exposed via
// getAcademicLoadProgress() for loading UIs (see useExamWorkflowLoading()
// in exam-workflow-pages.jsx).
let initialLoadProgress = { done: 0, total: 0 };
const getAcademicLoadProgress = () => ({ ...initialLoadProgress });

async function fetchSlices(keys, { trackInitialProgress = false } = {}) {
  // Was Promise.all — firing every slice's request at the same instant.
  // On a resource-constrained shared host, that burst can exceed the
  // account's concurrent PHP process limit (cPanel "Entry Processes"),
  // so several requests — sometimes even their own CORS preflight —
  // just sit queued waiting for a free worker instead of actually being
  // slow to compute. Fetching one slice at a time uses at most one PHP
  // worker from this call at once, so it never contends with itself (it
  // can still queue behind *other* concurrent activity on the account,
  // but no longer manufactures its own pile-up).
  if (trackInitialProgress)
    initialLoadProgress = { done: 0, total: keys.length };
  const entries = [];
  for (const key of keys) {
    entries.push([key, await sliceLoaders[key]()]);
    if (trackInitialProgress) {
      initialLoadProgress = { ...initialLoadProgress, done: entries.length };
      window.dispatchEvent(new CustomEvent(academicUpdateEvent));
    }
  }
  return Object.fromEntries(entries);
}

async function refreshFromApi() {
  return fetchSlices(allSliceKeys, { trackInitialProgress: true });
}

let apiCache = null;
let inFlight = null;
/** Passive/background refresh — safe to reuse an already-running fetch. */
function refreshInBackground() {
  if (inFlight) return inFlight;
  const p = refreshFromApi()
    .then(next => {
      apiCache = next;
      window.dispatchEvent(new CustomEvent(academicUpdateEvent));
      return next;
    })
    .catch(error => {
      console.error(
        "Failed to load academic records from the Laravel API.",
        error
      );
      throw error;
    })
    .finally(() => {
      // Only clear inFlight if nothing newer replaced it while we were running.
      if (inFlight === p) inFlight = null;
    });
  inFlight = p;
  return p;
}

/* ------------------------------------------------------------------ */
/* Public API (same names/shape used everywhere in the app)            */
/* ------------------------------------------------------------------ */
// `apiCache` stays null until the very first successful fetch resolves,
// so its presence doubles as a "has real data arrived yet" flag — used by
// useAcademicRecordsLoading() in management-pages.jsx (and elsewhere) so
// list pages can show a genuine "Loading…" state instead of an empty
// table while the first (sequential, so noticeably slower on a busy
// shared host — see fetchSlices()) load is still in flight.
const isAcademicRecordsLoaded = () => isMockMode || apiCache !== null;
const getAcademicRecords = () => {
  if (isMockMode) {
    const records = read();
    localStorage.setItem(storageKey, JSON.stringify(records));
    return records;
  }
  if (apiCache) return apiCache;
  refreshInBackground().catch(() => undefined);
  return apiCache
    ? clone(apiCache)
    : {
        courses: [],
        tsps: [],
        rounds: [],
        batches: [],
        students: [],
        subjects: [],
        modules: [],
        competencyUnits: [],
        elements: [],
      };
};

/**
 * Forces a guaranteed-fresh re-fetch from the Laravel API and notifies
 * listeners. Mock mode is a no-op.
 *
 * BUG FIX: this used to just call refreshInBackground(), which returns an
 * *already-running* fetch if one was in flight (e.g. a passive load kicked
 * off when the create/edit page mounted, before the save). That old fetch
 * started before the new record existed on the server, so after a save the
 * list would keep showing stale data (record present in the database, but
 * missing from the UI) until some unrelated later refresh happened. Now we
 * always wait for whatever is currently running to settle, then perform one
 * more fetch that is guaranteed to start after the save completed.
 *
 * PERFORMANCE: pass the `kind` that was just saved (e.g. "subjects",
 * "modules") to refetch only that slice (+ any dependent aggregate, see
 * dependentSlicesFor) instead of all nine catalog endpoints. Omit `kind`
 * (or call before any data has ever loaded) to force a full reload.
 */
const refreshAcademicRecords = kind => {
  if (isMockMode) return Promise.resolve(getAcademicRecords());
  const keysToRefresh =
    kind && apiCache && dependentSlicesFor[kind]
      ? dependentSlicesFor[kind]
      : allSliceKeys;
  const waitForCurrent = inFlight
    ? inFlight.catch(() => undefined)
    : Promise.resolve();
  const fresh = waitForCurrent.then(() => fetchSlices(keysToRefresh));
  inFlight = fresh
    .then(partial => {
      apiCache = apiCache ? { ...apiCache, ...partial } : partial;
      window.dispatchEvent(new CustomEvent(academicUpdateEvent));
      return apiCache;
    })
    .catch(error => {
      console.error(
        "Failed to load academic records from the Laravel API.",
        error
      );
      throw error;
    })
    .finally(() => {
      if (inFlight === fresh) inFlight = null;
    });
  return inFlight;
};

/** Kept for the existing mock-mode call sites; unchanged, synchronous, throws on duplicates. */
const saveAcademicRecord = (kind, data) => {
  if (isMockMode) return saveAcademicRecordMock(kind, data);
  return submitAcademicRecord(kind, data);
};

/**
 * Async, Laravel-backed save. Mock mode falls back to the synchronous demo
 * store wrapped in a resolved/rejected promise so callers can always `await`
 * this function regardless of mode.
 */
async function submitAcademicRecord(kind, data) {
  if (isMockMode) {
    try {
      return saveAcademicRecordMock(kind, data);
    } catch (error) {
      throw error;
    }
  }
  const hasRealId =
    data.id !== undefined &&
    data.id !== null &&
    data.id !== "" &&
    /^\d+$/.test(String(data.id));
  try {
    const result = await submitToApi(kind, data, hasRealId);
    await refreshAcademicRecords(kind);
    return result;
  } catch (error) {
    const validationErrors = error?.response?.data?.data?.errors;
    const message = validationErrors
      ? Object.values(validationErrors).flat().join(" ")
      : (error?.response?.data?.message ??
        error?.message ??
        "Could not save this record.");
    throw new Error(
      typeof message === "string" ? message : "Could not save this record."
    );
  }
}

async function submitToApi(kind, data, hasRealId) {
  switch (kind) {
    case "courses": {
      const payload = {
        code: data.code,
        name: data.name,
        duration_months:
          Number.parseInt(String(data.duration).replace(/\D+/g, ""), 10) || 1,
        status: toApiStatus(data.status),
      };
      return hasRealId
        ? unwrapOne(
            await apiClient.put(`${API_PREFIX}/courses/${data.id}`, payload)
          )
        : unwrapOne(await apiClient.post(`${API_PREFIX}/courses`, payload));
    }
    case "tsps": {
      const payload = {
        code: data.code,
        name: data.name,
        location: data.location || null,
        center_manager_mobile: data.centerManagerMobile || null,
        status: toApiStatus(data.status),
      };
      return hasRealId
        ? unwrapOne(
            await apiClient.put(`${API_PREFIX}/tsps/${data.id}`, payload)
          )
        : unwrapOne(await apiClient.post(`${API_PREFIX}/tsps`, payload));
    }
    case "rounds": {
      const payload = {
        code: data.code,
        name: data.name,
        status: toApiStatus(data.status),
      };
      return hasRealId
        ? unwrapOne(
            await apiClient.put(`${API_PREFIX}/rounds/${data.id}`, payload)
          )
        : unwrapOne(await apiClient.post(`${API_PREFIX}/rounds`, payload));
    }
    case "batches": {
      const payload = {
        course_id: Number(data.courseId),
        tsp_id: Number(data.tspId),
        round_id: Number(data.roundId),
        shift: data.shift,
        batch_number: Number.parseInt(data.batchNumber, 10) || 1,
        start_date: data.startDate,
        end_date: data.endDate || null,
        status: toApiStatus(data.status),
      };
      return hasRealId
        ? unwrapOne(
            await apiClient.put(`${API_PREFIX}/batches/${data.id}`, payload)
          )
        : unwrapOne(await apiClient.post(`${API_PREFIX}/batches`, payload));
    }
    case "students":
      return submitStudent(data, hasRealId);
    case "subjects":
      return submitSubjectGroup(data);
    case "modules": {
      const payload = {
        subject_id: Number(data.subjectId),
        name: data.name,
        status: toApiStatus(data.status ?? "Active"),
      };
      return hasRealId
        ? unwrapOne(
            await apiClient.put(`${API_PREFIX}/modules/${data.id}`, payload)
          )
        : unwrapOne(await apiClient.post(`${API_PREFIX}/modules`, payload));
    }
    case "competencyUnits": {
      const payload = {
        module_id: Number(data.moduleId),
        name: data.name,
        status: toApiStatus(data.status ?? "Active"),
      };
      return hasRealId
        ? unwrapOne(
            await apiClient.put(
              `${API_PREFIX}/competency-units/${data.id}`,
              payload
            )
          )
        : unwrapOne(
            await apiClient.post(`${API_PREFIX}/competency-units`, payload)
          );
    }
    case "elements": {
      const payload = {
        competency_unit_id: Number(data.competencyUnitId),
        name: data.name,
        status: toApiStatus(data.status),
      };
      return hasRealId
        ? unwrapOne(
            await apiClient.put(`${API_PREFIX}/elements/${data.id}`, payload)
          )
        : unwrapOne(await apiClient.post(`${API_PREFIX}/elements`, payload));
    }
    default:
      throw new Error("This academic record type is not supported.");
  }
}

/**
 * Students are created via CatalogController, then attached to a batch
 * through the existing capacity-checked BatchStudentController endpoint. If
 * the batch changed on edit, the previous assignment is marked TRANSFERRED
 * before the new one is created.
 */
async function submitStudent(data, hasRealId) {
  const payload = {
    student_id: data.studentId,
    name: data.name,
    date_of_birth: data.dob,
    email: data.email || null,
    status: toApiStatus(data.status),
  };
  const saved = hasRealId
    ? unwrapOne(
        await apiClient.put(`${API_PREFIX}/students/${data.id}`, payload)
      )
    : unwrapOne(await apiClient.post(`${API_PREFIX}/students`, payload));
  const studentId = saved.id;
  const batchChanged =
    !hasRealId || String(data.batchId) !== id(data.previousBatchId);
  if (data.batchId && batchChanged) {
    if (hasRealId && data.batchAssignmentId) {
      try {
        await apiClient.patch(
          `${API_PREFIX}/batch-students/${data.batchAssignmentId}`,
          { status: "TRANSFERRED" }
        );
      } catch (error) {
        console.warn("Could not close the previous batch assignment.", error);
      }
    }
    await apiClient.post(`${API_PREFIX}/batches/${data.batchId}/students`, {
      student_id: studentId,
      status: "ACTIVE",
    });
  }
  return saved;
}

/**
 * A shared "subject" is one row per course in Laravel. Reconcile the
 * checkbox list of course codes against the previously indexed rows: create
 * missing rows, delete rows for courses that were unchecked, and rename
 * remaining rows if the subject name changed.
 */
async function submitSubjectGroup(data) {
  const existingGroup = data.id ? subjectRowIndex[data.id] : null;
  const existingByCourse = new Map(
    (existingGroup?.rows ?? []).map(row => [String(row.courseId), row])
  );
  const wantedCourseIds = data.courseIds ?? [];
  const status = toApiStatus(data.status ?? "Active");
  const results = [];
  for (const courseId of wantedCourseIds) {
    const existingRow = existingByCourse.get(String(courseId));
    if (existingRow) {
      results.push(
        unwrapOne(
          await apiClient.put(`${API_PREFIX}/subjects/${existingRow.id}`, {
            name: data.name,
            status,
          })
        )
      );
      existingByCourse.delete(String(courseId));
    } else {
      results.push(
        unwrapOne(
          await apiClient.post(`${API_PREFIX}/subjects`, {
            course_id: Number(courseId),
            name: data.name,
            status,
          })
        )
      );
    }
  }
  // Any course rows left in existingByCourse were unchecked — remove them.
  for (const row of existingByCourse.values()) {
    await apiClient.delete(`${API_PREFIX}/subjects/${row.id}`);
  }
  return results[0] ?? null;
}

/**
 * Remove a single catalog row. Used for kinds with no status column to
 * toggle instead (currently just `elements`) — everything else is
 * deactivated via `saveAcademicRecord` with status: "Inactive" so the
 * record's history/relations are kept instead of hard-deleted.
 *
 * `kind` here is the URL-facing key exactly as CatalogController's routes
 * use it (dash-case, e.g. "competency-units"), same as the `kind` prop
 * management-pages.jsx already passes around — NOT the camelCase
 * storeKey used for the local records object.
 */
async function deleteAcademicRecord(kind, recordId, storeKey = kind) {
  if (isMockMode) {
    const records = read();
    const next = {
      ...records,
      [storeKey]: records[storeKey].filter(item => item.id !== recordId),
    };
    write(next);
    return;
  }
  await apiClient.delete(`${API_PREFIX}/${kind}/${recordId}`);
  await refreshAcademicRecords(storeKey);
}

/** Clear a student's failed-login lockout so they can sign in again. Mock mode just flips the flag locally. */
async function unlockStudent(studentId) {
  if (isMockMode) {
    const records = read();
    const next = {
      ...records,
      students: records.students.map(student =>
        student.id === studentId ? { ...student, isLocked: false } : student
      ),
    };
    return write(next).students.find(student => student.id === studentId);
  }
  const response = await apiClient.post(
    `${API_PREFIX}/students/${studentId}/unlock`
  );
  await refreshAcademicRecords("students");
  return normalizeStudent(unwrapOne(response));
}

export {
  academicUpdateEvent,
  deleteAcademicRecord,
  fetchDashboardStats,
  getAcademicLoadProgress,
  getAcademicRecords,
  getCachedDashboardStats,
  isAcademicRecordsLoaded,
  refreshAcademicRecords,
  saveAcademicRecord,
  submitAcademicRecord,
  unlockStudent,
};
