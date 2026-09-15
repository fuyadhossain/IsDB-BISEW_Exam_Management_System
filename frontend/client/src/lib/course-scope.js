/** Course-scope policy: Super Admins see all academic records; every other administrator sees only records that resolve to an assigned course. */
const getCourseCodeFromBatch = batch =>
  String(batch ?? "")
    .split("/")[0]
    .trim();

const isCourseScopedSession = session =>
  session?.mode === "admin" && !session.isSuperAdmin;

const hasCourseScope = (session, courseCode) =>
  Boolean(session?.isSuperAdmin || session?.courseCodes?.includes(courseCode));

const recordMatchesCourseScope = (kind, record, session) => {
  if (!isCourseScopedSession(session)) return true;
  // TSPs and Rounds are global entities with no single owning course (the
  // Laravel backend's CourseScopeService never restricts them by course
  // either — see CourseScopeService::catalog, 'tsps' => $query, 'rounds' =>
  // $query, i.e. unrestricted for every admin). Without this exception,
  // every TSP/Round record fell through to the generic
  // record.course/record.batch lookup below, found neither field, resolved
  // to an empty course code, and got filtered out entirely — so a
  // course-scoped admin's TSP and Round pages always rendered empty even
  // though the API returned data.
  if (kind === "tsps" || kind === "rounds") return true;
  const allowed = session.courseCodes ?? [];
  if (kind === "courses") return allowed.includes(record.code);
  if (Array.isArray(record.courses))
    return record.courses.some(course => allowed.includes(course));
  const courseCode =
    record.course ?? getCourseCodeFromBatch(record.batch ?? record.identifier);
  return allowed.includes(courseCode);
};

const scopeRecords = (kind, records, session) =>
  records.filter(record => recordMatchesCourseScope(kind, record, session));

const scopeCourseOptions = (courses, session) =>
  scopeRecords("courses", courses, session);

const courseScopeLabel = session =>
  session?.isSuperAdmin
    ? "All courses"
    : session?.courseCodes?.join(", ") || "No course assigned";

export {
  courseScopeLabel,
  getCourseCodeFromBatch,
  hasCourseScope,
  isCourseScopedSession,
  recordMatchesCourseScope,
  scopeCourseOptions,
  scopeRecords,
};
