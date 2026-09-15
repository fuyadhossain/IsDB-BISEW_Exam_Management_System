import { ALL_PERMISSIONS } from "./domain";
const courses = [
  { id: "course-pwad", code: "PWAD", name: "Professional Web Application Development", duration: "6 months", status: "Active", batches: 8 },
  { id: "course-jee", code: "JEE", name: "Java Enterprise Engineering", duration: "6 months", status: "Active", batches: 3 },
  { id: "course-nwt", code: "NWT", name: "Networking Technology", duration: "9 months", status: "Active", batches: 2 },
  { id: "course-gd", code: "GD", name: "Graphic Design", duration: "6 months", status: "Active", batches: 4 },
];
const tsps = [
  { id: "tsp-ccsl", code: "CCSL", name: "Computer Creative Skills Limited", location: "Dhaka", centerManagerMobile: "01711000001", status: "Active", batches: 7 },
  { id: "tsp-bds", code: "BDS", name: "Bangladesh Development Services", location: "Dhaka", centerManagerMobile: "01711000002", status: "Active", batches: 5 },
  { id: "tsp-dcc", code: "DCC", name: "Digital Career Centre", location: "Chattogram", centerManagerMobile: "01711000003", status: "Inactive", batches: 2 }
];
const rounds = [
  { id: "round-71", code: "71", name: "Round 71", status: "Active" },
  { id: "round-70", code: "70", name: "Round 70", status: "Active" },
  { id: "round-69", code: "69", name: "Round 69", status: "Inactive" }
];
const batches = [
  { id: "batch-1", identifier: "PWAD/CCSL-M/71/01", course: "PWAD", courseId: "course-pwad", tsp: "CCSL", tspId: "tsp-ccsl", shift: "Morning", round: "71", roundId: "round-71", batchNumber: "01", startDate: "2026-01-05", endDate: "2026-06-30", students: 12, capacity: 15, status: "Active" },
  { id: "batch-2", identifier: "PWAD/BDS-D/71/02", course: "PWAD", courseId: "course-pwad", tsp: "BDS", tspId: "tsp-bds", shift: "Day", round: "71", roundId: "round-71", batchNumber: "02", startDate: "2026-01-08", endDate: "2026-07-02", students: 15, capacity: 15, status: "Active" },
  { id: "batch-3", identifier: "GD/CCSL-E/70/01", course: "GD", courseId: "course-gd", tsp: "CCSL", tspId: "tsp-ccsl", shift: "Evening", round: "70", roundId: "round-70", batchNumber: "01", startDate: "2025-07-02", endDate: "2025-12-20", students: 14, capacity: 15, status: "Completed" }
];
const students = [
  { id: "student-1", studentId: "STU-1001", name: "Amina Rahman", dob: "2003-04-12", email: "amina.rahman@example.org", batch: "PWAD/CCSL-M/71/01", batchId: "batch-1", status: "Active" },
  { id: "student-2", studentId: "STU-1002", name: "Md. Tanvir Hasan", dob: "2002-11-26", email: "tanvir.hasan@example.org", batch: "PWAD/CCSL-M/71/01", batchId: "batch-1", status: "Active" },
  { id: "student-3", studentId: "STU-1024", name: "Jannatul Ferdous", dob: "2004-07-03", email: "jannatul.ferdous@example.org", batch: "PWAD/BDS-D/71/02", batchId: "batch-2", status: "Inactive" }
];
const subjects = [
  { id: "subject-html", name: "HTML", courses: ["PWAD", "JEE", "NWT"], courseIds: ["course-pwad", "course-jee", "course-nwt"], status: "Active" },
  { id: "subject-javascript", name: "JavaScript", courses: ["PWAD"], courseIds: ["course-pwad"], status: "Active" },
  { id: "subject-php", name: "PHP", courses: ["PWAD"], courseIds: ["course-pwad"], status: "Active" },
  { id: "subject-layout", name: "Layout & Typography", courses: ["GD"], courseIds: ["course-gd"], status: "Active" }
];
const modules = [
  { id: "module-html", name: "Module 02 \xB7 HTML Foundations", moduleNumber: "02", course: "PWAD", subject: "HTML", courseId: "course-pwad", status: "Active" },
  { id: "module-js", name: "Module 03 \xB7 JavaScript Essentials", moduleNumber: "03", course: "PWAD", subject: "JavaScript", courseId: "course-pwad", status: "Active" },
  { id: "module-laravel", name: "Module 05 \xB7 Laravel Development", moduleNumber: "05", course: "PWAD", subject: "PHP", courseId: "course-pwad", status: "Active" },
  { id: "module-design", name: "Module 01 \xB7 Design Principles", moduleNumber: "01", course: "GD", subject: "Layout & Typography", courseId: "course-gd", status: "Active" }
];
const competencyUnits = [
  { id: "cu-html", name: "CU-HTML-01 \xB7 Build semantic page structures", module: "Module 02 \xB7 HTML Foundations", moduleId: "module-html", course: "PWAD", courseId: "course-pwad", status: "Active" },
  { id: "cu-js", name: "CU-JS-02 \xB7 Apply JavaScript control flow", module: "Module 03 \xB7 JavaScript Essentials", moduleId: "module-js", course: "PWAD", courseId: "course-pwad", status: "Active" },
  { id: "cu-laravel", name: "STCWPSI 501 \xB7 Set up Laravel environment", module: "Module 05 \xB7 Laravel Development", moduleId: "module-laravel", course: "PWAD", courseId: "course-pwad", status: "Active" }
];
const elements = [
  { id: "element-1", name: "Use semantic HTML tags for document structure", competencyUnit: "CU-HTML-01 \xB7 Build semantic page structures", competencyUnitId: "cu-html", module: "Module 02 \xB7 HTML Foundations", course: "PWAD" },
  { id: "element-2", name: "Use conditional statements to control program flow", competencyUnit: "CU-JS-02 \xB7 Apply JavaScript control flow", competencyUnitId: "cu-js", module: "Module 03 \xB7 JavaScript Essentials", course: "PWAD" },
  { id: "element-3", name: "Laravel & setting up a Laravel development environment", competencyUnit: "STCWPSI 501 \xB7 Set up Laravel environment", competencyUnitId: "cu-laravel", module: "Module 05 \xB7 Laravel Development", course: "PWAD" }
];
const baseQuestions = [
  { id: "question-1", preview: "Which HTML element represents the most important heading?", text: "Which HTML element represents the most important heading in a document?", course: "PWAD", subject: "HTML", module: "Module 02", competencyUnit: "CU-HTML-01", element: "Use semantic HTML tags", marks: 1, type: "Single Correct", status: "Active", options: ["<h1>", "<heading>", "<head>", "<title>"], correctOptionIds: ["0"] },
  { id: "question-2", preview: "Select the JavaScript values that evaluate to a boolean.", text: "Select the JavaScript values that evaluate to a boolean expression.", course: "PWAD", subject: "JavaScript", module: "Module 03", competencyUnit: "CU-JS-02", element: "Use conditional statements", marks: 2, type: "Multiple Correct", status: "Active", options: ["true", "false", "if", "return"], correctOptionIds: ["0", "1"] },
  { id: "question-3", preview: "What command creates a Laravel application using Composer?", text: "What command creates a Laravel application using Composer?", course: "PWAD", subject: "PHP", module: "Module 05", competencyUnit: "STCWPSI 501", element: "Set up Laravel environment", marks: 1, type: "Single Correct", status: "Inactive", options: ["composer create-project", "php artisan make", "npm create", "laravel init"], correctOptionIds: ["0"] }
];
const monthlyPaperQuestionBank = [
  ["question-paper-01", "Which declaration creates a semantic page header?", "<header>", "<div header>", "<head>", "<section head>"],
  ["question-paper-02", "Which HTML element is used for primary navigation?", "<nav>", "<menuitem>", "<navigate>", "<aside>"],
  ["question-paper-03", "Which attribute links a label to a form input?", "for", "name", "idref", "target"],
  ["question-paper-04", "Which tag correctly embeds an image?", "<img>", "<image>", "<picturefile>", "<media>"],
  ["question-paper-05", "Which CSS property changes text color?", "color", "font-style", "background", "text-size"],
  ["question-paper-06", "Which CSS layout is designed for a single row or column?", "Flexbox", "Tables", "Float", "Inline blocks"],
  ["question-paper-07", "Which JavaScript keyword creates a reassigned block variable?", "let", "const", "static", "define"],
  ["question-paper-08", "What does Array.isArray([]) return?", "true", "false", "null", "undefined"],
  ["question-paper-09", "Which method converts JSON text to an object?", "JSON.parse", "JSON.stringify", "Object.parse", "toJSON"],
  ["question-paper-10", "Which comparison checks both value and type in JavaScript?", "===", "=", "==", "!="],
  ["question-paper-11", "Which HTTP method is normally used to retrieve a resource?", "GET", "POST", "PATCH", "DELETE"],
  ["question-paper-12", "Which status code means resource not found?", "404", "200", "401", "500"],
  ["question-paper-13", "Which Composer command creates a Laravel project?", "composer create-project", "php artisan init", "npm create laravel", "laravel start"],
  ["question-paper-14", "Which command starts the Laravel development server?", "php artisan serve", "php serve", "composer run", "laravel boot"],
  ["question-paper-15", "Which file normally stores Laravel environment values?", ".env", "config.json", "settings.php", "package.env"],
  ["question-paper-16", "Which Blade syntax prints an escaped variable?", "{{ $name }}", "<? $name ?>", "[[ $name ]]", "<% $name %>"],
  ["question-paper-17", "Which Eloquent method finds a record by primary key?", "find", "fetch", "locate", "lookup"],
  ["question-paper-18", "Which relationship method represents a one-to-many relation?", "hasMany", "belongsOne", "joinMany", "linksTo"],
  ["question-paper-19", "Which command creates a Laravel controller?", "php artisan make:controller", "php artisan create:controller", "composer controller", "laravel controller"],
  ["question-paper-20", "Which middleware protection is applied to browser forms by default?", "CSRF", "CORS", "Cache", "Queue"],
  ["question-paper-21", "Which database migration command applies pending migrations?", "php artisan migrate", "php artisan database:run", "composer migrate", "php migrate"],
  ["question-paper-22", "Which Laravel command creates a model class?", "php artisan make:model", "php artisan model:create", "composer make:model", "laravel model"],
  ["question-paper-23", "Which JavaScript method adds an item to the end of an array?", "push", "pop", "shift", "unshift"],
].map(([id, text, correct, optionB, optionC, optionD], index) => ({ id, preview: text, text, course: "PWAD", subject: index < 6 ? "HTML" : index < 12 ? "JavaScript" : "PHP", module: index < 6 ? "Module 02" : index < 12 ? "Module 03" : "Module 05", competencyUnit: index < 6 ? "CU-HTML-01" : index < 12 ? "CU-JS-02" : "STCWPSI 501", element: index < 6 ? "Use semantic HTML tags" : index < 12 ? "Use conditional statements" : "Set up Laravel environment", marks: 1, type: "Single Correct", status: "Active", options: [correct, optionB, optionC, optionD], correctOptionIds: ["0"] }));
const descriptiveMonthlyQuestions = [
  { id: "question-paper-desc-01", preview: "Design a semantic page", text: "Describe how you would structure a semantic HTML page for an institutional examination portal and explain the purpose of the main elements.", course: "PWAD", subject: "HTML", module: "Module 02", competencyUnit: "CU-HTML-01", element: "Use semantic HTML tags", marks: 3, type: "Descriptive", status: "Active", options: [] },
  { id: "question-paper-desc-02", preview: "Secure Laravel workflow", text: "Explain the steps required to validate a Laravel examination submission and preserve an audit trail for the student attempt.", course: "PWAD", subject: "PHP", module: "Module 05", competencyUnit: "STCWPSI 501", element: "Set up Laravel environment", marks: 3, type: "Descriptive", status: "Active", options: [] },
];
const questions = [...baseQuestions, ...monthlyPaperQuestionBank, ...descriptiveMonthlyQuestions];
const examSets = [
  { id: "set-1", name: "Monthly", batch: "PWAD/CCSL-M/71/01", batchId: "batch-1", course: "PWAD", setType: "MONTHLY", deliveryMode: "OFFLINE", status: "Available", exams: 2 },
  { id: "set-2", name: "Mid Monthly", batch: "PWAD/BDS-D/71/02", batchId: "batch-2", course: "PWAD", setType: "MID_MONTHLY", deliveryMode: "ONLINE", status: "Available", exams: 1 }
];
const exams = [
  { id: "exam-1", number: "02", title: "Monthly Examination 02", type: "Monthly Exam", batch: "PWAD/CCSL-M/71/01", batchId: "batch-1", examSet: "Monthly Examinations", schedule: "24 Aug 2026 \xB7 10:00\u201310:45", startDate: "2026-08-24T10:00", endDate: "2026-08-24T10:45", duration: 45, questions: 25, totalMarks: 30, passMarks: 18, status: "Ready", distribution: ["HTML / Module 02 / CU-HTML-01 \xB7 10", "JavaScript / Module 03 / CU-JS-02 \xB7 15"] },
  { id: "exam-2", number: "01", title: "Monthly Examination 01", type: "Monthly Exam", batch: "PWAD/CCSL-M/71/01", batchId: "batch-1", examSet: "Monthly Examinations", schedule: "24 Jul 2026 \xB7 10:00\u201310:45", startDate: "2026-07-24T10:00", endDate: "2026-07-24T10:45", duration: 45, questions: 25, totalMarks: 30, passMarks: 18, status: "Completed", distribution: ["HTML / Module 02 / CU-HTML-01 \xB7 10", "JavaScript / Module 03 / CU-JS-02 \xB7 15"] },
  { id: "exam-3", number: "01", title: "Mid Examination 01", type: "Mid Exam", batch: "PWAD/BDS-D/71/02", batchId: "batch-2", examSet: "Batch Examination Set", schedule: "29 Aug 2026 \xB7 14:00\u201315:00", startDate: "2026-08-29T14:00", endDate: "2026-08-29T15:00", duration: 60, questions: 25, totalMarks: 25, passMarks: 15, status: "Scheduled", distribution: ["HTML / Module 02 / CU-HTML-01 \xB7 12", "JavaScript / Module 03 / CU-JS-02 \xB7 13"] }
];
const results = [
  // Demo/offline dataset for mock mode only (isMockMode) — the real,
  // backend-connected roster comes from resultService.list() hitting
  // Laravel instead. Extended with examId/studentDbId/examType/
  // evidence/finalResult fields so the External/Evidence Pass-Fail
  // columns and the Final Result tab in LiveResultListPage have
  // something to render in mock mode too, instead of showing blank
  // dashes for everything the live roster now provides.
  { id: "result-1", examId: 101, studentDbId: 1001, studentId: "STU-1001", student: "Amina Rahman", course: "PWAD", tsp: "CCSL", shift: "Morning", round: "71", batch: "PWAD/CCSL-M/71/01", exam: "Monthly Examination 01", examNumber: "01", examType: "MONTHLY", totalQuestions: 25, correct: 22, wrong: 2, unanswered: 1, obtainedMarks: 26, totalMarks: 30, percentage: "86.7%", status: "Pass", examinationDate: "24 Jul 2026", violations: 0, violationStatus: "Clear", evidenceMarks: 42, evidenceMcqMarks: 20, attended: true, finalResult: { complete: true, midMonthly: { external: 22, externalStatus: "PASS", evidence: 38, evidenceStatus: "PASS" }, monthly: { external: 20, evidence: 42 }, finalExternal: 8.4, finalEvidence: 64, totalMarks: 72.4, passThreshold: 28, status: "PASS" } },
  { id: "result-2", examId: 101, studentDbId: 1002, studentId: "STU-1002", student: "Md. Tanvir Hasan", course: "PWAD", tsp: "CCSL", shift: "Morning", round: "71", batch: "PWAD/CCSL-M/71/01", exam: "Monthly Examination 01", examNumber: "01", examType: "MONTHLY", totalQuestions: 25, correct: 15, wrong: 7, unanswered: 3, obtainedMarks: 17, totalMarks: 30, percentage: "56.7%", status: "Fail", examinationDate: "24 Jul 2026", violations: 1, violationStatus: "Reviewed", evidenceMarks: 20, evidenceMcqMarks: 10, attended: true, finalResult: { complete: true, midMonthly: { external: 18, externalStatus: "FAIL", evidence: 30, evidenceStatus: "FAIL" }, monthly: { external: 10, evidence: 20 }, finalExternal: 2, finalEvidence: 16, totalMarks: 18, passThreshold: 28, status: "FAIL" } },
  { id: "result-3", examId: 201, studentDbId: 1024, studentId: "STU-1024", student: "Jannatul Ferdous", course: "PWAD", tsp: "BDS", shift: "Day", round: "71", batch: "PWAD/BDS-D/71/02", exam: "Mid Monthly Examination 01", examNumber: "01", examType: "MID_MONTHLY", totalQuestions: 25, correct: 20, wrong: 4, unanswered: 1, obtainedMarks: 24, totalMarks: 30, percentage: "80.0%", status: "Pass", examinationDate: "24 Jul 2026", violations: 0, violationStatus: "Clear", evidenceMarks: 35, externalStatus: "PASS", evidenceStatus: "PASS" }
];
const permissions = [
  ["manage_users", "Manage Users", "Users & Roles", "Create, edit, and activate administrative users."],
  ["manage_roles", "Manage Roles", "Users & Roles", "Create roles and assign administrative permissions."],
  ["manage_courses", "Manage Courses", "Academic Management", "Maintain courses, TSP records, rounds, and batches."],
  ["manage_batches", "Manage Batches", "Academic Management", "Create and manage batch contexts and membership."],
  ["manage_students", "Manage Students", "Academic Management", "Maintain student records and batch assignments."],
  ["manage_curriculum", "Manage Curriculum", "Academic Management", "Maintain subjects, modules, competency units, and elements."],
  ["manage_questions", "Manage Questions", "Examination", "Create and maintain examination questions."],
  ["import_questions", "Import Questions", "Examination", "Import question records through approved CSV files."],
  ["manage_exam_sets", "Manage Exam Sets", "Examination", "Maintain batch-specific exam sets."],
  ["manage_exams", "Manage Exams", "Examination", "Configure, schedule, and maintain examinations."],
  ["view_results", "View Results", "Results", "View authorized examination outcome records."],
  ["manage_results", "Manage Results", "Results", "Access result management and reporting preparation."],
  ["view_audit_logs", "View Audit Logs", "Audit", "Read administrative activity records."]
].map(([name, label, group, description]) => ({ id: name, name, label, group, description, status: "Active" }));
const roles = [
  { id: "role-super", name: "Super Admin", description: "Full operational access to administration and examination governance.", status: "Active", permissionIds: [...ALL_PERMISSIONS], userCount: 3 },
  { id: "role-exam", name: "Consultant", description: "Operational access to academic, question, examination, and result modules.", status: "Active", permissionIds: ["manage_courses", "manage_batches", "manage_students", "manage_curriculum", "manage_questions", "import_questions", "manage_exam_sets", "manage_exams", "view_results", "manage_results"], userCount: 2 }
];
const adminUsers = [
  { id: "user-1", name: "Farhana Sultana", email: "admin@isdb-bisew.org", roleId: "role-super", role: "Super Admin", courseCodes: [], status: "Active", lastActive: "Today, 09:18" },
  { id: "user-super-2", name: "Reserved Super Admin 02", email: "super.admin02@isdb-bisew.org", roleId: "role-super", role: "Super Admin", courseCodes: [], status: "Active", lastActive: "Hidden account", hiddenFromList: true },
  { id: "user-super-3", name: "Reserved Super Admin 03", email: "super.admin03@isdb-bisew.org", roleId: "role-super", role: "Super Admin", courseCodes: [], status: "Active", lastActive: "Hidden account", hiddenFromList: true },
  { id: "user-2", name: "Mahmud Karim", email: "exam.manager@isdb-bisew.org", roleId: "role-exam", role: "Consultant", courseCodes: ["PWAD"], status: "Active", lastActive: "Yesterday, 16:40" },
  { id: "user-3", name: "Nusrat Jahan", email: "operations@isdb-bisew.org", roleId: "role-exam", role: "Consultant", courseCodes: ["GD"], status: "Active", lastActive: "11 Aug 2026" }
];
const auditLogs = [
  { id: "log-1", occurredAt: "24 Aug 2026 \xB7 09:18", user: "Farhana Sultana", action: "Updated", module: "Exams", description: "Updated the schedule for Monthly Examination 02.", ip: "103.124.251.18", record: "exam-1" },
  { id: "log-2", occurredAt: "23 Aug 2026 \xB7 16:40", user: "Mahmud Karim", action: "Imported", module: "Questions", description: "Imported 120 question records; 4 rows require review.", ip: "103.124.250.64", record: "import-0823" },
  { id: "log-3", occurredAt: "22 Aug 2026 \xB7 14:12", user: "Farhana Sultana", action: "Updated", module: "Roles", description: "Updated permission assignment for Consultant.", ip: "103.124.251.18", record: "role-exam" },
  { id: "log-4", occurredAt: "21 Aug 2026 \xB7 11:08", user: "Mahmud Karim", action: "Created", module: "Students", description: "Created student account STU-1024 and assigned a batch.", ip: "103.124.250.64", record: "student-3" }
];
const questionImportResult = {
  fileName: "pwad_monthly_questions.csv",
  totalRows: 1e3,
  successful: 930,
  duplicates: 40,
  invalid: 30,
  issues: [
    { row: 91, question: "Which HTTP method is idempotent?", status: "Duplicate", reason: "A matching active question exists in the selected curriculum context." },
    { row: 118, question: "Identify the correct semantic element.", status: "Invalid", reason: "Correct answer reference is missing from the option set." },
    { row: 146, question: "Laravel environment configuration question", status: "Invalid", reason: "Competency unit does not belong to the selected module." }
  ]
};
const violations = [
  {
    id: "violation-1",
    occurred_at: "24 Jul 2026, 10:12 AM",
    type: "Fullscreen exit",
    attempt_id: "attempt-2001",
    attempt: {
      student: { name: "Md. Tanvir Hasan", student_id: "STU-1002" },
    },
  },
  {
    id: "violation-2",
    occurred_at: "24 Jul 2026, 10:34 AM",
    type: "Focus loss",
    attempt_id: "attempt-2002",
    attempt: {
      student: { name: "Jannatul Ferdous", student_id: "STU-1024" },
    },
  },
  {
    id: "violation-3",
    occurred_at: "24 Jul 2026, 11:02 AM",
    type: "Screenshot attempt",
    attempt_id: "attempt-2003",
    attempt: {
      student: { name: "Md. Tanvir Hasan", student_id: "STU-1002" },
    },
  },
];
const studentAttempt = {
  id: "attempt-1001",
  title: "Monthly Examination 02",
  examType: "Monthly Exam",
  examNumber: "02",
  totalQuestions: 5,
  durationMinutes: 45,
  questions: [
    { id: "attempt-question-4", order: 1, text: "Which attribute provides alternative text for an image in HTML?", options: [{ id: "a", text: "alt" }, { id: "b", text: "href" }, { id: "c", text: "srcset" }, { id: "d", text: "title" }] },
    { id: "attempt-question-5", order: 2, text: "Which JavaScript keyword declares a block-scoped variable that can be reassigned?", options: [{ id: "a", text: "const" }, { id: "b", text: "var" }, { id: "c", text: "let" }, { id: "d", text: "static" }] },
    { id: "attempt-question-6", order: 3, text: "Which CSS layout model is most appropriate for arranging items in one dimension?", options: [{ id: "a", text: "Flexbox" }, { id: "b", text: "Grid" }, { id: "c", text: "Float" }, { id: "d", text: "Position" }] },
    { id: "attempt-question-7", order: 4, text: "Which command runs a Laravel application development server?", options: [{ id: "a", text: "php artisan serve" }, { id: "b", text: "npm dev" }, { id: "c", text: "composer start" }, { id: "d", text: "laravel start" }] },
    { id: "attempt-question-8", order: 5, text: "What does the HTTP status code 404 indicate?", options: [{ id: "a", text: "Unauthorized" }, { id: "b", text: "Resource not found" }, { id: "c", text: "Server error" }, { id: "d", text: "Request accepted" }] }
  ]
};
export {
  adminUsers,
  auditLogs,
  batches,
  competencyUnits,
  courses,
  elements,
  examSets,
  exams,
  modules,
  permissions,
  questionImportResult,
  questions,
  results,
  roles,
  rounds,
  studentAttempt,
  students,
  subjects,
  tsps,
  violations
};