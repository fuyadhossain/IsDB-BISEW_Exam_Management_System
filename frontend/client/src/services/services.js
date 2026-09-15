import * as records from "@/lib/mock-data";
import {
  availabilityForStudent,
  getOnlineAttempt,
} from "@/lib/exam-demo-store";
import { apiClient, isMockMode, mockRequest } from "./api-client";

const listService = items => ({
  list: () => mockRequest(items),
  get: id => mockRequest(items.find(item => item.id === id)),
});
const academicService = {
  courses: listService(records.courses),
  tsps: listService(records.tsps),
  rounds: listService(records.rounds),
  batches: listService(records.batches),
  students: listService(records.students),
};
const curriculumService = {
  subjects: listService(records.subjects),
  modules: listService(records.modules),
  competencyUnits: listService(records.competencyUnits),
  elements: listService(records.elements),
};
const questionService = {
  list: () => mockRequest(records.questions),
  get: id =>
    mockRequest(records.questions.find(question => question.id === id)),
  importPreview: () => mockRequest(records.questionImportResult),
};
const examService = {
  examSets: listService(records.examSets),
  exams: listService(records.exams),
  getExam: id => mockRequest(records.exams.find(exam => exam.id === id)),
};
const filterResults = (items, filters = {}) =>
  items.filter(
    result =>
      (!filters.course || result.course === filters.course) &&
      (!filters.batch || result.batch === filters.batch) &&
      (!filters.round || result.round === filters.round) &&
      (!filters.examNumber ||
        String(result.examNumber) === String(filters.examNumber)) &&
      // Mirrors the live-mode fix: a batch's exam set can hold a MID and
      // a MONTHLY exam sharing the same exam_number, so exam_number alone
      // isn't enough to pick a single exam in mock data either.
      (!filters.examType ||
        String(result.examType) === String(filters.examType)) &&
      (!filters.outcome ||
        filters.outcome === "all" ||
        result.status === filters.outcome)
  );
const normalizeResultCollection = payload =>
  Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.results)
        ? payload.results
        : [];
const resultService = {
  list: (filters = {}) =>
    isMockMode
      ? mockRequest(filterResults(records.results, filters))
      : apiClient
          .get("/admin/results", {
            params: {
              course: filters.course,
              batch: filters.batch,
              round: filters.round,
              exam_number: filters.examNumber,
              // Same reasoning as reportService.exportCsv above — a batch's
              // exam set can hold a MID and a MONTHLY exam sharing the same
              // exam_number, so exam_type has to travel with it or the
              // backend can't tell the two apart.
              exam_type: filters.examType,
              outcome:
                filters.outcome && filters.outcome !== "all"
                  ? filters.outcome
                  : undefined,
            },
          })
          .then(response => normalizeResultCollection(response.data)),
  get: id =>
    isMockMode
      ? mockRequest(records.results.find(item => item.id === id))
      : apiClient
          .get(`/v1/admin/results/${id}`)
          .then(response => response.data?.data ?? response.data),
  // Monthly exams are offline and never get an auto-graded ExamResult row
  // (their marks live entirely on exam_evidences), so there is no result
  // `id` for get() above to use. This looks a student+exam pair up
  // directly instead, and is what the Details page falls back to whenever
  // a roster row has no ExamResult id.
  getDetail: ({ examId, studentId }) =>
    isMockMode
      ? mockRequest(records.results.find(item => item.examId === examId && item.studentDbId === studentId) ?? null)
      : apiClient
          .get("/v1/admin/results/detail", { params: { exam_id: examId, student_id: studentId } })
          .then(response => response.data?.data ?? response.data),
  // The combined Mid(20%)+Monthly(80%) weighted pass/fail — only
  // meaningful for a MID exam's result; returns null server-side when the
  // sibling Monthly exam or its evidence marks aren't available yet.
  getCombined: id =>
    isMockMode
      ? mockRequest(null)
      : apiClient
          .get(`/v1/admin/results/${id}/combined`)
          .then(response => response.data?.data ?? response.data),
  filterOptions: () =>
    isMockMode
      ? mockRequest(records.results)
      : apiClient
          // Populates the Round/Batch/Exam-number filter dropdowns from
          // every result, not just the newest 20 (the endpoint's default
          // page size) — otherwise older rounds/batches quietly vanished
          // from the filters once more than 20 results existed.
          .get("/admin/results", { params: { per_page: 100 } })
          .then(response => normalizeResultCollection(response.data)),
  // Only includes `marks`/`mcq_marks` in the request body when the caller
  // actually passed that field (an explicit `undefined` means "leave this
  // column alone") — the MCQ tab and the Evidence tab each save their own
  // field now, and a key that's entirely absent from the body leaves that
  // column untouched server-side instead of overwriting it with null.
  // Deliberately has no `attended` parameter at all — saving marks (MCQ
  // or Evidence, Mid or Monthly) must never change attendance; only
  // markAttendance() below does that, via its own explicit button.
  saveEvidence: ({ studentDbId, examId, marks, mcqMarks }) =>
    isMockMode
      ? mockRequest({
          studentDbId,
          examId,
          evidenceMarks: marks,
          evidenceMcqMarks: mcqMarks,
        })
      : apiClient
          .post("/admin/results/evidence", {
            student_id: studentDbId,
            exam_id: examId,
            ...(marks !== undefined ? { marks } : {}),
            ...(mcqMarks !== undefined ? { mcq_marks: mcqMarks } : {}),
          })
          .then(response => response.data?.data ?? response.data),
  markAttendance: ({ studentDbId, examId, attended = true }) =>
    isMockMode
      ? mockRequest({
          studentDbId,
          examId,
          attended,
          attendedAt: new Date().toISOString(),
        })
      : apiClient
          .post("/admin/results/attendance", {
            student_id: studentDbId,
            exam_id: examId,
            attended,
          })
          .then(response => response.data?.data ?? response.data),
};
const csvCell = value => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const resultsToCsv = rows => {
  const header = [
    "Student ID",
    "Student Name",
    "Course",
    "Round",
    "Batch",
    "Exam",
    "Exam No.",
    "Exam Type",
    "Total Questions",
    "Correct",
    "Wrong",
    "Unanswered",
    "Marks",
    "Percentage",
    "Status",
  ];
  const lines = rows.map(r =>
    [
      r.studentId,
      r.student,
      r.course,
      r.round,
      r.batch,
      r.exam,
      r.examNumber,
      r.examType,
      r.totalQuestions,
      r.correct,
      r.wrong,
      r.unanswered,
      r.obtainedMarks,
      r.percentage,
      r.status,
    ]
      .map(csvCell)
      .join(",")
  );
  return [header.join(","), ...lines].join("\n");
};
const downloadTextFile = (
  content,
  filename,
  mime = "text/csv;charset=utf-8;"
) => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
const mockPassFilter = item => String(item.status).toUpperCase() === "PASS";
const groupBatchSummary = rows => {
  const groups = new Map();
  rows.forEach(item => {
    const key = item.batch;
    if (!groups.has(key))
      groups.set(key, {
        batch_id: key,
        batch: item.batch,
        course: item.course,
        round: item.round,
        students_assigned: 0,
        results_recorded: 0,
        pass: 0,
        fail: 0,
        marksTotal: 0,
        pctTotal: 0,
      });
    const g = groups.get(key);
    g.results_recorded += 1;
    g.marksTotal += Number(item.obtainedMarks) || 0;
    g.pctTotal += parseFloat(item.percentage) || 0;
    if (mockPassFilter(item)) g.pass += 1;
    else g.fail += 1;
  });
  return Array.from(groups.values()).map(g => ({
    ...g,
    students_assigned:
      records.batches.find(b => b.identifier === g.batch)?.students ??
      g.results_recorded,
    pass_rate: g.results_recorded
      ? Math.round((g.pass / g.results_recorded) * 10000) / 100
      : 0,
    average_marks: g.results_recorded
      ? Math.round((g.marksTotal / g.results_recorded) * 100) / 100
      : 0,
    average_percentage: g.results_recorded
      ? Math.round((g.pctTotal / g.results_recorded) * 100) / 100
      : 0,
  }));
};
const groupExamSummary = rows => {
  const groups = new Map();
  rows.forEach(item => {
    const key = `${item.exam}__${item.examNumber}__${item.batch}`;
    if (!groups.has(key))
      groups.set(key, {
        exam_id: key,
        exam: item.exam,
        exam_number: item.examNumber,
        exam_type: item.examType,
        course: item.course,
        batch: item.batch,
        round: item.round,
        attempts: 0,
        pass: 0,
        fail: 0,
        marksTotal: 0,
        marksList: [],
      });
    const g = groups.get(key);
    g.attempts += 1;
    const marks = Number(item.obtainedMarks) || 0;
    g.marksTotal += marks;
    g.marksList.push(marks);
    if (mockPassFilter(item)) g.pass += 1;
    else g.fail += 1;
  });
  return Array.from(groups.values()).map(g => ({
    ...g,
    pass_rate: g.attempts ? Math.round((g.pass / g.attempts) * 10000) / 100 : 0,
    average_marks: g.attempts
      ? Math.round((g.marksTotal / g.attempts) * 100) / 100
      : 0,
    highest_marks: g.marksList.length ? Math.max(...g.marksList) : 0,
    lowest_marks: g.marksList.length ? Math.min(...g.marksList) : 0,
  }));
};
const filterByRound = (rows, round) =>
  !round || round === "all"
    ? rows
    : rows.filter(item => String(item.round) === String(round));
const reportService = {
  batchSummary: (filters = {}) =>
    isMockMode
      ? mockRequest(
          groupBatchSummary(filterByRound(records.results, filters.round))
        )
      : apiClient
          .get("/v1/admin/reports/batches", {
            params: { round: filters.round || undefined },
          })
          .then(response => response.data?.data ?? []),
  examSummary: (filters = {}) =>
    isMockMode
      ? mockRequest(
          groupExamSummary(filterByRound(records.results, filters.round))
        )
      : apiClient
          .get("/v1/admin/reports/exams", {
            params: { round: filters.round || undefined },
          })
          .then(response => response.data?.data ?? []),
  exportCsv: (filters = {}) => {
    if (isMockMode) {
      return mockRequest(true, 300).then(() => {
        downloadTextFile(
          resultsToCsv(filterResults(records.results, filters)),
          `isdb-bisew-results-${filters.round || "all-rounds"}.csv`
        );
        return true;
      });
    }
    return apiClient
      .get("/v1/admin/reports/export", {
        params: {
          round: filters.round || undefined,
          course: filters.course || undefined,
          batch: filters.batch || undefined,
          exam_number: filters.examNumber || undefined,
          // A batch's exam set can hold a MID and a MONTHLY exam sharing
          // the same exam_number, so exam_type must travel alongside it
          // or the export can silently mix both exams' rows together.
          exam_type: filters.examType || undefined,
          outcome: filters.outcome || undefined,
        },
        responseType: "blob",
      })
      .then(response => {
        const disposition = response.headers?.["content-disposition"] || "";
        const match = /filename="?([^"]+)"?/.exec(disposition);
        downloadTextFile(
          response.data,
          match ? match[1] : `isdb-bisew-results-${Date.now()}.csv`,
          "text/csv"
        );
        return true;
      });
  },
};
const dashboardService = {
  overview: () =>
    isMockMode
      ? mockRequest({
          upcoming_exams: [],
          recent_exams: [],
          next_by_batch: [],
          performance: { students_assigned: 0, pass: 0, fail: 0, absent: 0, pass_rate: 0 },
          courses: [],
          rounds: [],
        })
      : apiClient.get("/v1/admin/dashboard/overview").then((response) => response.data?.data ?? response.data),
};
const settingsService = {
  get: () =>
    isMockMode
      ? mockRequest({
          grading: { mid_pass_mark: 32, mid_weight_percent: 20, monthly_weight_percent: 80, component_pass_threshold: 28 },
          branding: { institution_name: "IsDB-BISEW", institution_subtitle: "Examination Management System", logo_url: null },
          security: { student_max_failed_logins: 5, student_lock_minutes: 15, student_token_expiration_minutes: 180, violation_duplicate_window_seconds: 10, batch_active_capacity: 15 },
          data: { audit_log_retention_days: null },
          notifications: { alert_email: null, delivery_configured: false },
        })
      : apiClient.get("/v1/admin/settings").then((response) => response.data?.data ?? response.data),
  update: (payload) =>
    isMockMode
      ? mockRequest(payload)
      : apiClient.put("/v1/admin/settings", payload).then((response) => response.data?.data ?? response.data),
  uploadLogo: (file) => {
    if (isMockMode) return mockRequest({ logo_url: null });
    const form = new FormData();
    form.append("logo", file);
    return apiClient
      .post("/v1/admin/settings/logo", form, { headers: { "Content-Type": "multipart/form-data" } })
      .then((response) => response.data?.data ?? response.data);
  },
  purgeAuditLogs: () =>
    isMockMode
      ? mockRequest({ deleted: 0 })
      : apiClient.post("/v1/admin/settings/purge-audit-logs").then((response) => response.data?.data ?? response.data),
  downloadBackup: () =>
    isMockMode
      ? Promise.reject(new Error("Backups aren't available in demo mode."))
      : apiClient.get("/v1/admin/settings/backup", { responseType: "blob" }).then((response) => response.data),
};
// Administrative users, roles, permissions, audit logs, and violations are
// fetched live from the Laravel API by the pages that render them (see
// course-scoped-user-pages.jsx, admin-user-store.js, and the
// useLiveCollection hook in governance-pages.jsx) — there is no
// mock-data-backed service for them here on purpose, so nothing in this
// file can ever silently serve stale static records for those screens.
const importableCsvTypes = [
  "students",
  "questions",
  "subjects",
  "modules",
  "competency-units",
  "elements",
  "curriculum",
];
const questionImportService = {
  list: (page = 1) =>
    isMockMode
      ? mockRequest({ data: [], current_page: 1, last_page: 1, total: 0 })
      : apiClient
          .get("/v1/admin/question-imports", { params: { page, per_page: 20 } })
          .then(response => response.data?.data ?? response.data),
  get: id =>
    isMockMode
      ? mockRequest(null)
      : apiClient
          .get(`/v1/admin/question-imports/${id}`)
          .then(response => response.data?.data ?? response.data),
};
const bulkImportService = {
  importCsv: (dataType, file, rows) => {
    if (!importableCsvTypes.includes(dataType))
      return Promise.reject(
        new Error(
          `CSV import is available only for: ${importableCsvTypes.join(", ")}.`
        )
      );
    if (!Array.isArray(rows) || rows.length === 0)
      return Promise.reject(
        new Error(
          "No verified CSV rows were supplied. The import was not started."
        )
      );
    if (isMockMode)
      return mockRequest(
        {
          dataType,
          filename: file.name,
          imported: rows.length,
          status: "validated",
        },
        420
      );
    // `rows` holds the client-validated data, including any values the
    // validator normalized in place (e.g. a date_of_birth re-saved by
    // Excel as "3/6/2003" gets corrected to "2003-03-06" so the on-screen
    // preview shows the fix). Sending the original, unedited `file` here
    // would silently discard that correction and re-send the raw
    // Excel-formatted date, which the backend then rejects with a 422 --
    // even though the screen showed the file as fully validated. Rebuild
    // the CSV from the normalized rows so what's uploaded matches what
    // was actually verified on screen.
    const headers = Object.keys(rows[0]);
    const escapeCsvValue = value => {
      const text = String(value ?? "");
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const csvContent =
      [
        headers.join(","),
        ...rows.map(row =>
          headers.map(header => escapeCsvValue(row[header])).join(",")
        ),
      ].join("\n") + "\n";
    const normalizedFile = new File([csvContent], file.name, {
      type: "text/csv;charset=utf-8",
    });
    const payload = new FormData();
    payload.append("file", normalizedFile);
    payload.append("data_type", dataType);
    return apiClient
      .post(`/admin/imports/${dataType}`, payload, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then(response => response.data);
  },
};
const mapExamsToAvailability = exams => {
  const exam = Array.isArray(exams) ? exams[0] : null;
  if (!exam) return { ok: false, availability: "NO_ACTIVE_EXAM" };
  const start = exam.start_at;
  const end = exam.end_at;
  const isOpen = String(exam.status).toUpperCase() === "STARTED";
  return {
    ok: isOpen,
    availability: isOpen ? "AVAILABLE" : "NOT_YET_AVAILABLE",
    exam: exam
      ? {
          id: exam.id,
          title: exam.exam_title,
          examNumber: exam.exam_number,
          number: exam.exam_number,
          endDate: end,
        }
      : null,
    expiresAt: end,
    attemptSeconds: Number(exam.duration) * 60,
    lateEntry: false,
    schedule: { opensAt: start, closesAt: end },
  };
};
const studentExamService = {
  availability: () =>
    apiClient.get("/v1/student/exams").then(response => {
      const exams = response.data?.data ?? response.data ?? [];
      return mapExamsToAvailability(exams);
    }),
  login: (studentId, dob) => {
    if (isMockMode) {
      const student = records.students.find(
        item => item.studentId === String(studentId).trim() && item.dob === dob
      );
      return mockRequest(
        student
          ? availabilityForStudent(student.studentId)
          : { ok: false, availability: "INELIGIBLE" }
      );
    }
    return apiClient
      .post("/v1/student/login", {
        student_id: studentId,
        date_of_birth: dob,
      })
      .then(response => {
        const data = response.data?.data ?? response.data;
        if (data.token) localStorage.setItem("isdb_student_token", data.token);
        // The login response carries the verified student's real name/DOB;
        // keep it so the caller can show actual student details on the
        // instructions page instead of just echoing back the typed ID.
        const profile = {
          name: data.name,
          studentId: data.student_id,
          dateOfBirth: data.date_of_birth,
          status: data.status,
        };
        if (!data.portal_access) {
          return { ok: false, availability: "NO_ACTIVE_EXAM", profile };
        }
        // The login endpoint only confirms identity/token; it does not return
        // exam schedule info, so fetch that separately and merge it in.
        return apiClient
          .get("/v1/student/exams")
          .then(examResponse => {
            const exams = examResponse.data?.data ?? examResponse.data ?? [];
            return { ...mapExamsToAvailability(exams), profile };
          })
          .catch(error => {
            // Login itself already succeeded at this point — a failure here
            // is just the availability lookup, not a credentials problem.
            // Keep the verified profile so the caller still lets the student
            // through to the instructions page (which retries availability
            // on its own) instead of showing "invalid credentials" for an
            // unrelated network/server hiccup.
            console.error(
              "Failed to fetch exam availability after student login.",
              error?.response?.status,
              error?.response?.data ?? error
            );
            return { ok: false, availability: "NO_ACTIVE_EXAM", profile };
          });
      })
      .catch(error => {
        // This only runs for a genuine login failure (invalid credentials,
        // locked account, validation error) — no profile is available, so
        // the caller correctly keeps the student on the login screen.
        console.error(
          "Student login failed.",
          error?.response?.status,
          error?.response?.data ?? error
        );
        return {
          ok: false,
          availability: "INELIGIBLE",
          message: error.response?.data?.message,
        };
      });
  },
  getAttempt: (examId, studentId) =>
    isMockMode
      ? mockRequest(getOnlineAttempt(examId, studentId))
      : apiClient
          .post(`/v1/student/exams/${Number(examId)}/start`, {})
          .then(response => response.data?.data ?? response.data),
  saveAnswer: (attemptId, answer) =>
    isMockMode
      ? mockRequest({ saved: true, attemptId, answer })
      : apiClient
          .post(`/v1/student/attempts/${attemptId}/answers`, {
            exam_attempt_question_id: answer.exam_attempt_question_id,
            selected_options: (Array.isArray(answer.option_id)
              ? answer.option_id
              : [answer.option_id]
            )
              .filter(Boolean)
              .map(String),
          })
          .then(response => response.data),
  submit: payload =>
    isMockMode
      ? mockRequest({ submitted: true, attemptId: payload.attempt_id })
      : apiClient
          .post(`/v1/student/attempts/${payload.attempt_id}/submit`, payload)
          .then(response => response.data),
  reportViolation: payload =>
    isMockMode
      ? mockRequest({ action: "END_SESSION", type: payload.type })
      : apiClient
          .post(`/v1/student/attempts/${payload.attempt_id}/violations`, {
            ...payload,
            type:
              {
                "Loss of examination focus": "FOCUS_LOSS",
                "Restricted copy action": "PAGE_EXIT",
                "Restricted paste action": "PAGE_EXIT",
                "Restricted right-click action": "PAGE_EXIT",
                "Restricted keyboard shortcut": "PAGE_EXIT",
                "Fullscreen exit": "FULLSCREEN_EXIT",
                "Pointer entered the examination security boundary":
                  "PAGE_EXIT",
                "Pointer left the examination workspace": "PAGE_EXIT",
                "Screenshot key detected": "SCREENSHOT_ATTEMPT",
              }[payload.type] ?? payload.type,
          })
          .then(response => response.data),
};

export {
  academicService,
  bulkImportService,
  curriculumService,
  dashboardService,
  examService,
  questionImportService,
  questionService,
  reportService,
  resultService,
  settingsService,
  studentExamService,
};
