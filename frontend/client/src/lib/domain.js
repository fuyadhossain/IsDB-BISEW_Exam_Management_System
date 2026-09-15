const ALL_PERMISSIONS = [
  "manage_users",
  "manage_roles",
  "manage_courses",
  "manage_batches",
  "manage_students",
  "manage_curriculum",
  "manage_questions",
  "import_questions",
  "manage_exam_sets",
  "manage_exams",
  "view_results",
  "manage_results",
  "view_audit_logs"
];
const pageTitleFromPath = (path) => {
  const match = [
    ["dashboard", "Dashboard"],
    ["courses", "Courses"],
    ["tsps", "TSP"],
    ["rounds", "Rounds"],
    ["batches", "Batches"],
    ["students", "Students"],
    ["subjects", "Subjects"],
    ["modules", "Modules"],
    ["competency-units", "Competency Units"],
    ["elements", "Elements"],
    ["questions/import", "CSV Import Question"],
    ["questions", "Question Bank"],
    ["exam-sets", "Exam Sets"],
    ["exams", "Exams"],
    ["results", "Results"],
    ["users", "Users"],
    ["roles", "Roles"],
    ["permissions", "Permissions"],
    ["audit-logs", "Audit Logs"],
    ["reports", "Reports"],
    ["settings", "Settings"]
  ].find(([fragment]) => path.includes(fragment));
  return match?.[1] ?? "Administration";
};
export {
  ALL_PERMISSIONS,
  pageTitleFromPath
};
