/** Academic records style: course-scoped institutional controls with visible relationship trails and persistent demo records. */
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  Edit3,
  Eye,
  EyeOff,
  FolderTree,
  Save,
  UploadCloud,
  AlertTriangle,
  FileBarChart2,
} from "lucide-react";
import { toast } from "sonner";
import {
  DataTable,
  FilterBand,
  FilterField,
  PageHeader,
  PrimaryLink,
  RecordCard,
  StatusBadge,
} from "@/components/admin-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CsvBulkImportDialog, CsvTemplateDownloadButton } from "@/components/csv-bulk-import";
import { SubjectAssignmentForm } from "@/components/subject-assignment-form";
import { useAuth } from "@/contexts/AuthContext";
import { dashboardService } from "@/services/services";
import { hasCourseScope, scopeRecords } from "@/lib/course-scope";
import { autoFormatDmyInput, dmyToYmd, ymdToDmy, DMY_PATTERN } from "@/lib/dob-format";
import {
  academicUpdateEvent,
  deleteAcademicRecord,
  fetchDashboardStats,
  getAcademicLoadProgress,
  getAcademicRecords,
  getCachedDashboardStats,
  isAcademicRecordsLoaded,
  saveAcademicRecord,
  unlockStudent,
} from "@/lib/academic-demo-store";

const defs = {
  courses: {
    singular: "course",
    plural: "Courses",
    description:
      "Maintain the course records used throughout batches, curriculum, questions, and exams.",
    permission: "manage_courses",
    createPath: "/admin/courses/create",
    columns: [
      { key: "code", label: "Course code" },
      { key: "name", label: "Course" },
      { key: "duration", label: "Duration" },
      { key: "batches", label: "Batches" },
      { key: "status", label: "Status" },
    ],
    primaryField: "name",
  },
  tsps: {
    singular: "TSP",
    plural: "TSPs",
    description:
      "Manage approved training service provider records, names, and locations.",
    permission: "manage_courses",
    createPath: "/admin/tsps/create",
    columns: [
      { key: "code", label: "Code" },
      { key: "name", label: "TSP" },
      { key: "location", label: "Location" },
      { key: "centerManagerMobile", label: "Center Manager Mobile" },
      { key: "batches", label: "Batches" },
      { key: "status", label: "Status" },
    ],
    primaryField: "name",
  },
  rounds: {
    singular: "round",
    plural: "Rounds",
    description:
      "Maintain the round values selected while creating academic batches.",
    permission: "manage_courses",
    createPath: "/admin/rounds/create",
    columns: [
      { key: "code", label: "Round" },
      { key: "name", label: "Round name" },
      { key: "status", label: "Status" },
    ],
    primaryField: "name",
  },
  batches: {
    singular: "batch",
    plural: "Batches",
    description:
      "Review academic context, capacity, and student membership for every institution batch.",
    permission: "manage_batches",
    createPath: "/admin/batches/create",
    columns: [
      { key: "identifier", label: "Batch identifier" },
      { key: "course", label: "Course" },
      { key: "tsp", label: "TSP" },
      { key: "shift", label: "Shift" },
      { key: "round", label: "Round" },
      { key: "students", label: "Active students" },
      { key: "status", label: "Status" },
    ],
    primaryField: "identifier",
    filterKey: "course",
    showRoundFilter: true,
  },
  students: {
    singular: "student",
    plural: "Students",
    description:
      "Maintain student access records. Students use their ID and date of birth to enter the examination portal.",
    permission: "manage_students",
    createPath: "/admin/students/create",
    columns: [
      { key: "studentId", label: "Student ID" },
      { key: "name", label: "Student" },
      { key: "dob", label: "Date of birth" },
      { key: "batch", label: "Batch" },
      { key: "email", label: "Email" },
      { key: "status", label: "Status" },
      { key: "isLocked", label: "Login access" },
    ],
    primaryField: "name",
    filterKey: "batch",
    showRoundFilter: true,
  },
  subjects: {
    singular: "subject",
    plural: "Subjects",
    description:
      "Assign reusable subject records to one or more courses so shared curriculum content remains consistent.",
    permission: "manage_curriculum",
    createPath: "/admin/subjects/create",
    columns: [
      { key: "name", label: "Subject" },
      { key: "courses", label: "Assigned courses" },
      { key: "status", label: "Status" },
    ],
    primaryField: "name",
    filterKey: "courses",
  },
  modules: {
    singular: "module",
    plural: "Modules",
    description:
      "Manage course-level modules that provide the next stage of curriculum selection.",
    permission: "manage_curriculum",
    createPath: "/admin/modules/create",
    columns: [
      { key: "serial", label: "Number" },
      { key: "name", label: "Module" },
      { key: "subject", label: "Subject" },
      { key: "course", label: "Course" },
      { key: "status", label: "Status" },
    ],
    primaryField: "name",
    filterKey: "course",
  },
  "competency-units": {
    singular: "competency unit",
    plural: "Competency Units",
    description:
      "Associate competency units with their course and module context before elements or questions are added.",
    permission: "manage_curriculum",
    createPath: "/admin/competency-units/create",
    columns: [
      { key: "name", label: "Competency unit" },
      { key: "module", label: "Module" },
      { key: "subject", label: "Subject" },
      { key: "course", label: "Course" },
      { key: "status", label: "Status" },
    ],
    primaryField: "name",
    filterKey: "course",
    hasSearch: false,
    storeKey: "competencyUnits",
  },
  elements: {
    singular: "element",
    plural: "Elements",
    description:
      "Maintain the final curriculum level used for question categorization and examination evidence.",
    permission: "manage_curriculum",
    createPath: "/admin/elements/create",
    columns: [
      { key: "name", label: "Element" },
      { key: "competencyUnit", label: "Competency unit" },
      { key: "module", label: "Module" },
      { key: "subject", label: "Subject" },
      { key: "course", label: "Course" },
      { key: "status", label: "Status", render: record => <StatusBadge value={record.status} /> },
    ],
    primaryField: "name",
    filterKey: "course",
  },
};

const Field = ({ label, children, required }) => (
  <div className="space-y-1.5">
    <Label className="text-xs font-bold uppercase tracking-[0.12em] text-[#62746e]">
      {label}
      {required && <span className="ml-1 text-rose-700">*</span>}
    </Label>
    {children}
  </div>
);
const Select = ({ children, ...props }) => (
  <select
    {...props}
    className="h-10 w-full rounded-md border border-[#d6ded7] bg-white px-3 text-sm text-[#2f4d47] outline-none focus:ring-2 focus:ring-[#0e5a4f]/30"
  >
    {children}
  </select>
);
// sessionStorage-backed so returning to the dashboard (or a full reload in
// the same tab) shows the last known overview instantly instead of a
// blank "Loading…" every time -- same pattern as the Results roster cache
// in result-list-live.jsx. Refreshed silently in the background on every
// mount regardless, so it never goes stale for long.
const DASHBOARD_OVERVIEW_CACHE_KEY = "isdb-bisew:dashboard-overview-cache";
const loadCachedDashboardOverview = () => {
  try {
    const raw = window.sessionStorage.getItem(DASHBOARD_OVERVIEW_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const cacheDashboardOverview = (data) => {
  try {
    window.sessionStorage.setItem(DASHBOARD_OVERVIEW_CACHE_KEY, JSON.stringify(data));
  } catch {
    // Storage disabled/quota exceeded -- just won't survive a hard reload.
  }
};
const useAcademicRecords = () => {
  const [records, setRecords] = useState(() => getAcademicRecords());
  useEffect(() => {
    const refresh = () => setRecords(getAcademicRecords());
    window.addEventListener(academicUpdateEvent, refresh);
    return () => window.removeEventListener(academicUpdateEvent, refresh);
  }, []);
  return records;
};
// The first load of every catalog slice (courses/batches/students/...) is
// fetched one at a time on purpose (see fetchSlices in academic-demo-store,
// to avoid overwhelming a resource-constrained shared host), so it can
// visibly take a few seconds. Without this, list pages had no way to tell
// "still loading" apart from "genuinely empty", so they showed the empty
// table state at that useAcademicRecords() call itself.
const useAcademicRecordsLoading = () => {
  const [loading, setLoading] = useState(() => !isAcademicRecordsLoaded());
  const [percent, setPercent] = useState(() => {
    const progress = getAcademicLoadProgress();
    return progress.total ? Math.round((progress.done / progress.total) * 100) : null;
  });
  useEffect(() => {
    if (!loading) return undefined;
    const check = () => {
      setLoading(!isAcademicRecordsLoaded());
      const progress = getAcademicLoadProgress();
      setPercent(
        progress.total
          ? Math.min(100, Math.round((progress.done / progress.total) * 100))
          : null,
      );
    };
    window.addEventListener(academicUpdateEvent, check);
    return () => window.removeEventListener(academicUpdateEvent, check);
  }, [loading]);
  return { loading, percent };
};
// Real "N of total catalogs fetched" progress bar — not a simulated
// animation. See getAcademicLoadProgress() in academic-demo-store.js.
const LoadingProgressBar = ({ percent }) => (
  <div className="mx-auto mt-4 w-full max-w-xs">
    <div className="h-2 w-full overflow-hidden rounded-full bg-[#dfe8e1]">
      <div
        className="h-full rounded-full bg-[#0e5a4f] transition-[width] duration-300"
        style={{ width: `${percent ?? 0}%` }}
      />
    </div>
    <p className="mt-2 font-mono text-xs font-bold tabular-nums text-[#5c7169]">
      {percent === null ? "Starting…" : `${percent}%`}
    </p>
  </div>
);
const keyFor = kind => defs[kind]?.storeKey ?? kind;
// Matches the permission strings actually enforced by the route guards in
// App.jsx — curriculum kinds (subjects/modules/competency-units/elements)
// all share "curriculum.*", everything else is "<kind>.*".
const updatePermissionFor = kind =>
  ["subjects", "modules", "competency-units", "elements"].includes(kind)
    ? "curriculum.update"
    : `${kind}.update`;
const optionsFor = (definition, records, roundFilter = "all") => {
  const cascades = definition.showRoundFilter && roundFilter !== "all";
  const batchesInRound = cascades
    ? records.batches.filter(batch => batch.round === roundFilter)
    : records.batches;
  if (definition.filterKey === "courses")
    return records.courses.map(record => record.code);
  if (definition.filterKey === "course")
    return [...new Set(batchesInRound.map(batch => batch.course))];
  if (definition.filterKey === "batch")
    return batchesInRound.map(batch => batch.identifier);
  return [];
};

/** Resolve the round code that applies to a record, for kinds that don't carry a `round` field directly (e.g. a student's round comes from their assigned batch). */
const roundOf = (kind, record, records) => {
  if (kind === "batches") return record.round;
  if (kind === "students")
    return records.batches.find(batch => batch.id === record.batchId)?.round;
  return record.round;
};

function ManagementListPage({ kind }) {
  const definition = defs[kind];
  const { session, hasPermission } = useAuth();
  const records = useAcademicRecords();
  const { loading: recordsLoading, percent: recordsLoadingPercent } =
    useAcademicRecordsLoading();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [relation, setRelation] = useState("all");
  const [roundFilter, setRoundFilter] = useState("all");
  const source = records[keyFor(kind)] ?? [];
  const filtered = useMemo(
    () =>
      scopeRecords(kind, source, session).filter(record => {
        const haystack = Object.values(record).join(" ").toLowerCase();
        const related = record[definition.filterKey];
        const relationMatches =
          !definition.filterKey ||
          relation === "all" ||
          (Array.isArray(related)
            ? related.includes(relation)
            : related === relation);
        const roundMatches =
          !definition.showRoundFilter ||
          roundFilter === "all" ||
          roundOf(kind, record, records) === roundFilter;
        return (
          (definition.hasSearch === false ||
            haystack.includes(search.toLowerCase())) &&
          (definition.hasStatus === false ||
            status === "all" ||
            record.status === status) &&
          relationMatches &&
          roundMatches
        );
      }),
    [
      definition,
      kind,
      relation,
      roundFilter,
      records,
      search,
      session,
      source,
      status,
    ]
  );
  const [busyId, setBusyId] = useState(null);
  const handleToggleStatus = async record => {
    const nextStatus = record.status === "Inactive" ? "Active" : "Inactive";
    setBusyId(record.id);
    try {
      await saveAcademicRecord(keyFor(kind), { ...record, status: nextStatus });
      toast.success(
        `${definition.singular[0].toUpperCase()}${definition.singular.slice(1)} ${nextStatus === "Inactive" ? "deactivated" : "reactivated"}`
      );
    } catch (error) {
      toast.error(error.message ?? "Could not update this record.");
    } finally {
      setBusyId(null);
    }
  };
  const handleDelete = async record => {
    if (!window.confirm(`Delete this ${definition.singular} permanently? This can't be undone.`))
      return;
    setBusyId(record.id);
    try {
      await deleteAcademicRecord(kind, record.id, keyFor(kind));
      toast.success(`${definition.singular[0].toUpperCase()}${definition.singular.slice(1)} deleted`);
    } catch (error) {
      toast.error(
        error?.response?.data?.message ??
          error.message ??
          "Could not delete this record — it may still be in use elsewhere."
      );
    } finally {
      setBusyId(null);
    }
  };
  const [unlockingId, setUnlockingId] = useState(null);
  const [revealedDob, setRevealedDob] = useState(() => new Set());
  const toggleDobReveal = id =>
    setRevealedDob(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const handleUnlock = async studentId => {
    setUnlockingId(studentId);
    try {
      await unlockStudent(studentId);
      toast.success("Student unlocked", {
        description: "They can sign in again with their student ID and date of birth.",
      });
    } catch (error) {
      toast.error(error.message ?? "Could not unlock this student.");
    } finally {
      setUnlockingId(null);
    }
  };
  const filterOptions = optionsFor(definition, records, roundFilter);
  const relationLocked =
    definition.showRoundFilter && definition.filterKey && roundFilter === "all";
  const relationLabel =
    definition.filterKey === "courses" ? "Course" : definition.filterKey;
  return (
    <>
      <PageHeader
        eyebrow={
          session.isSuperAdmin
            ? "Academic record management"
            : `Course scope · ${(session.courseCodes ?? []).join(", ")}`
        }
        title={definition.plural}
        description={
          session.isSuperAdmin
            ? definition.description
            : `${definition.description} Only assigned-course records are visible.`
        }
        action={
          <div className="flex flex-wrap gap-2">
            {kind === "students" && <CsvBulkImportDialog dataType="students" />}
            {["subjects", "modules", "competency-units", "elements"].includes(kind) && (
              <CsvBulkImportDialog
                dataType={kind}
                allowedCourses={session.isSuperAdmin ? [] : session.courseCodes ?? []}
              />
            )}
            {(kind === "courses"
              ? session.isSuperAdmin
              : hasPermission(
                  // BUG FIX: subjects/modules/competency-units/elements are
                  // gated behind a single shared "curriculum.create"
                  // permission everywhere else in the app (see the route
                  // guards in App.jsx and the sidebar in app-shell.jsx).
                  // This used to check `${kind}.create` (e.g.
                  // "subjects.create", "modules.create") instead, which the
                  // backend never actually grants — so course-scoped admins
                  // (anyone who isn't Super Admin) never saw the "Add"
                  // button for these four record types.
                  ["subjects", "modules", "competency-units", "elements"].includes(kind)
                    ? "curriculum.create"
                    : `${kind}.create`
                )) && (
              <PrimaryLink href={definition.createPath}>
                Add {definition.singular}
              </PrimaryLink>
            )}
          </div>
        }
      />
      <FilterBand
        onClear={() => {
          setSearch("");
          setStatus("all");
          setRelation("all");
          setRoundFilter("all");
        }}
      >
        {definition.hasSearch !== false && (
          <FilterField label="Search">
            <Input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder={`Search ${definition.plural.toLowerCase()}`}
            />
          </FilterField>
        )}
        {definition.showRoundFilter && (
          <FilterField label="Round">
            <Select
              value={roundFilter}
              onChange={event => {
                setRoundFilter(event.target.value);
                setRelation("all");
              }}
            >
              <option value="all">All rounds</option>
              {records.rounds.map(item => (
                <option key={item.id} value={item.code}>
                  {item.code} · {item.name}
                </option>
              ))}
            </Select>
          </FilterField>
        )}
        {definition.filterKey && (
          <FilterField label={relationLabel}>
            <Select
              value={relation}
              onChange={event => setRelation(event.target.value)}
              disabled={relationLocked}
            >
              <option value="all">
                {relationLocked
                  ? "Select a round first"
                  : `All ${relationLabel === "Course" ? "courses" : `${relationLabel}es`}`}
              </option>
              {filterOptions.map(option => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </FilterField>
        )}
        {definition.hasStatus !== false && (
          <FilterField label="Record status">
            <Select
              value={status}
              onChange={event => setStatus(event.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Completed">Completed</option>
            </Select>
          </FilterField>
        )}
      </FilterBand>
      <DataTable
        records={filtered}
        rowLabel={definition.plural.toLowerCase()}
        empty={
          recordsLoading ? (
            <RecordCard className="border-dashed p-8 text-center">
              <p className="font-semibold text-[#295148]">
                Loading {definition.plural.toLowerCase()}…
              </p>
              <p className="mt-2 text-sm text-[#6c7d78]">
                The first load fetches each catalog one at a time, so this can take a few seconds on a busy connection.
              </p>
              <LoadingProgressBar percent={recordsLoadingPercent} />
            </RecordCard>
          ) : undefined
        }
        columns={[
          ...definition.columns.map(column => ({
            ...column,
            render: record =>
              column.key === "status" ? (
                <StatusBadge value={record.status} />
              ) : column.key === "students" ? (
                <span className="font-medium tabular-nums">
                  {record.students} / {record.capacity}
                </span>
              ) : column.key === "serial" ? (
                <span className="font-medium tabular-nums">
                  {filtered.indexOf(record) + 1}
                </span>
              ) : column.key === "batch" && !record.batch ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 ring-1 ring-inset ring-rose-600/10">
                  <AlertTriangle className="h-3 w-3" />
                  No batch — can't log in
                </span>
              ) : column.key === "dob" ? (
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs tabular-nums text-[#1f413c]">
                    {revealedDob.has(record.id)
                      ? (record.dob ? ymdToDmy(record.dob) : "—")
                      : record.dob
                        ? "••-••-••••"
                        : "—"}
                  </span>
                  {record.dob && (
                    <button
                      type="button"
                      onClick={() => toggleDobReveal(record.id)}
                      className="text-[#5f766e] hover:text-[#1f413c]"
                      title={
                        revealedDob.has(record.id)
                          ? "Hide date of birth"
                          : "Show date of birth (used as the student's portal login password)"
                      }
                    >
                      {revealedDob.has(record.id) ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                </div>
              ) : column.key === "isLocked" ? (
                record.isLocked ? (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 ring-1 ring-inset ring-rose-600/10">
                      <AlertTriangle className="h-3 w-3" />
                      Locked out
                    </span>
                    {hasPermission("students.update") && (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        disabled={unlockingId === record.id}
                        onClick={() => handleUnlock(record.id)}
                      >
                        {unlockingId === record.id ? "Unlocking…" : "Unlock"}
                      </Button>
                    )}
                  </div>
                ) : (
                  <span className="text-xs font-semibold text-[#5f766e]">
                    Open
                  </span>
                )
              ) : (
                <span
                  className={
                    column.key === definition.primaryField
                      ? "font-semibold text-[#1f413c]"
                      : ""
                  }
                >
                  {Array.isArray(record[column.key])
                    ? record[column.key].join(", ")
                    : String(record[column.key] ?? "—")}
                </span>
              ),
          })),
          {
            key: "actions",
            label: "Actions",
            render: record => (
              <div className="flex items-center gap-2">
                <Link
                  href={
                    kind === "batches"
                      ? `/admin/batches/${record.id}`
                      : `/admin/${kind}/${record.id}/edit`
                  }
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 ring-1 ring-inset ring-emerald-700/10 transition hover:bg-[#0e5a4f] hover:text-white hover:ring-[#0e5a4f]"
                >
                  {kind === "batches" ? (
                    <>
                      <Eye className="h-3.5 w-3.5" />
                      View
                    </>
                  ) : (
                    <>
                      <Edit3 className="h-3.5 w-3.5" />
                      Edit
                    </>
                  )}
                </Link>
                {definition.hasStatus !== false &&
                  hasPermission(updatePermissionFor(kind)) && (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      disabled={busyId === record.id}
                      onClick={() => handleToggleStatus(record)}
                    >
                      {busyId === record.id
                        ? "Saving…"
                        : record.status === "Inactive"
                          ? "Reactivate"
                          : "Deactivate"}
                    </Button>
                  )}
                {definition.hasStatus === false &&
                  kind !== "elements" &&
                  hasPermission(updatePermissionFor(kind)) && (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-7 px-2 text-xs text-rose-700 hover:bg-rose-50"
                      disabled={busyId === record.id}
                      onClick={() => handleDelete(record)}
                    >
                      {busyId === record.id ? "Deleting…" : "Delete"}
                    </Button>
                  )}
              </div>
            ),
          },
        ]}
      />
    </>
  );
}

function ManagementFormPage({ kind }) {
  const definition = defs[kind];
  const [busy, setBusy] = useState(false);
  const { session, hasPermission } = useAuth();
  const [, navigate] = useLocation();
  const [, params] = useRoute(`/admin/${kind}/:id/edit`);
  const isEditing = Boolean(params?.id);
  const records = useAcademicRecords();
  const source = records[keyFor(kind)] ?? [];
  const existing = source.find(record => record.id === params?.id);
  const allowedCourses = scopeRecords("courses", records.courses, session);
  const allowedBatches = scopeRecords("batches", records.batches, session);
  const [courseCode, setCourseCode] = useState(
    existing?.course ?? existing?.courses?.[0] ?? allowedCourses[0]?.code ?? ""
  );
  const [moduleId, setModuleId] = useState(existing?.moduleId ?? "");
  const [cuId, setCuId] = useState(existing?.competencyUnitId ?? "");
  const selectedSubjectsForCourse = records.subjects.filter(subject =>
    subject.courses.includes(courseCode)
  );
  // Existing module/competency-unit/element rows only carry the subject's
  // *name* (subject_name from the backend), not the grouped subject id used
  // as this dropdown's value — matching by name lets editing correctly
  // preselect the subject instead of always falling back to the first one.
  const [subjectId, setSubjectId] = useState(
    () =>
      selectedSubjectsForCourse.find(item => item.name === existing?.subject)
        ?.id ??
      existing?.subjectId ??
      ""
  );
  const selectedSubject =
    selectedSubjectsForCourse.find(item => item.id === subjectId) ??
    selectedSubjectsForCourse[0];
  const [tspId, setTspId] = useState(
    existing?.tspId ?? records.tsps[0]?.id ?? ""
  );
  const [roundId, setRoundId] = useState(
    existing?.roundId ?? records.rounds[0]?.id ?? ""
  );
  // Competency units and elements are created under a specific module, and a
  // course can have several subjects each with their own modules — so once a
  // subject is chosen, only that subject's modules should be selectable
  // (previously this only filtered by course, mixing every subject's modules
  // together and making the course/subject/module chain meaningless).
  const selectedModules = records.modules.filter(
    record =>
      record.course === courseCode &&
      (!selectedSubject || record.subject === selectedSubject.name)
  );
  const selectedModule =
    selectedModules.find(record => record.id === moduleId) ??
    selectedModules[0];
  const selectedUnits = records.competencyUnits.filter(
    record => record.moduleId === selectedModule?.id
  );
  const selectedUnit =
    selectedUnits.find(record => record.id === cuId) ?? selectedUnits[0];
  const goBack = () => navigate(`/admin/${kind}`);
  if (kind === "subjects")
    return (
      <SubjectAssignmentForm
        definition={definition}
        existing={existing}
        isEditing={isEditing}
        onBack={goBack}
        onSave={data => saveAcademicRecord("subjects", data)}
        allowedCourses={allowedCourses}
      />
    );
  const restrictedFromEditing =
    kind === "courses"
      ? isEditing
        ? !hasPermission("courses.update")
        : !session.isSuperAdmin
      : ["tsps", "rounds"].includes(kind) &&
        !hasPermission(`${kind}.${isEditing ? "update" : "create"}`);
  if (restrictedFromEditing)
    return (
      <>
        <PageHeader
          eyebrow="Restricted record editor"
          title={
            isEditing
              ? `Edit ${definition.singular}`
              : `Add ${definition.singular}`
          }
          description={
            kind === "courses" && !isEditing
              ? "Only a Super Admin can create new global academic structure records."
              : "You don't have permission to manage this record yet."
          }
          action={
            <Button variant="outline" onClick={goBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to list
            </Button>
          }
        />
        <RecordCard className="p-7">
          <p className="text-sm leading-6 text-[#536d65]">
            {kind === "courses" && !isEditing
              ? "New courses are created only by the Super Admin. Ask a Super Admin to add this course."
              : "Ask a Super Admin to grant you this permission from Roles & Permissions."}
          </p>
        </RecordCard>
      </>
    );
  const submit = async event => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const form = new FormData(event.currentTarget);
    if (kind === "students" && !form.get("batchId")) {
      toast.error("Select a batch before saving — a student without a batch assignment cannot sign in or access an examination.");
      setBusy(false);
      return;
    }
    try {
      let record;
      if (kind === "courses")
        record = {
          id: existing?.id,
          code: String(form.get("courseCode")).trim().toUpperCase(),
          name: String(form.get("courseName")).trim(),
          duration: `${form.get("duration")} months`,
          batches: existing?.batches ?? 0,
          status: form.get("status") ?? "Active",
        };
      if (kind === "tsps")
        record = {
          id: existing?.id,
          code: String(form.get("tspCode")).trim().toUpperCase(),
          name: String(form.get("tspName")).trim(),
          location: String(form.get("location")).trim(),
          centerManagerMobile: String(form.get("centerManagerMobile") ?? "").trim(),
          batches: existing?.batches ?? 0,
          status: form.get("status") ?? "Active",
        };
      if (kind === "rounds")
        record = {
          id: existing?.id,
          code: String(form.get("roundCode")).trim(),
          name: String(form.get("roundName")).trim(),
          status: form.get("status") ?? "Active",
        };
      if (kind === "batches") {
        const tsp = records.tsps.find(item => item.id === tspId);
        const round = records.rounds.find(item => item.id === roundId);
        const shift = String(form.get("shift"));
        const number = String(form.get("batchNumber")).padStart(2, "0");
        record = {
          id: existing?.id,
          identifier: `${courseCode}/${tsp?.code}-${shift[0]}/${round?.code}/${number}`,
          course: courseCode,
          courseId: records.courses.find(item => item.code === courseCode)?.id,
          tsp: tsp?.code,
          tspId: tsp?.id,
          shift,
          round: round?.code,
          roundId: round?.id,
          batchNumber: number,
          startDate: form.get("startDate"),
          endDate: form.get("endDate"),
          students: existing?.students ?? 0,
          capacity: Number(form.get("capacity")),
          status: form.get("status") ?? "Active",
        };
      }
      if (kind === "students") {
        const batch = records.batches.find(
          item => item.id === form.get("batchId")
        );
        record = {
          id: existing?.id,
          studentId: String(form.get("studentId")).trim(),
          name: String(form.get("name")).trim(),
          // The field is typed/displayed as DD-MM-YYYY, but every backend
          // comparison (student login, exports, etc.) expects YYYY-MM-DD —
          // convert here, once, at the save boundary.
          dob: dmyToYmd(form.get("dob")),
          email: String(form.get("email")).trim(),
          batchId: batch?.id,
          batch: batch?.identifier,
          previousBatchId: existing?.batchId,
          batchAssignmentId: existing?.batchAssignmentId,
          status: form.get("status") ?? "Active",
        };
      }
      const curriculumStatus = isEditing
        ? (form.get("status") ?? existing?.status ?? "Active")
        : "Active";
      const curriculumBaseFor = name => {
        if (kind === "modules") {
          const courseSubjectIndex =
            selectedSubject?.courses.indexOf(courseCode) ?? -1;
          return {
            id: existing?.id,
            name,
            course: courseCode,
            courseId: records.courses.find(item => item.code === courseCode)?.id,
            subject: selectedSubject?.name,
            subjectId:
              courseSubjectIndex >= 0
                ? selectedSubject?.courseRowIds?.[courseSubjectIndex]
                : selectedSubject?.id,
            status: curriculumStatus,
          };
        }
        if (kind === "competency-units")
          return {
            id: existing?.id,
            name,
            module: selectedModule?.name,
            moduleId: selectedModule?.id,
            subject: selectedSubject?.name,
            course: courseCode,
            courseId: records.courses.find(item => item.code === courseCode)?.id,
            status: curriculumStatus,
          };
        return {
          id: existing?.id,
          name,
          competencyUnit: selectedUnit?.name,
          competencyUnitId: selectedUnit?.id,
          module: selectedModule?.name,
          moduleId: selectedModule?.id,
          subject: selectedSubject?.name,
          course: courseCode,
          courseId: records.courses.find(item => item.code === courseCode)?.id,
          status: curriculumStatus,
        };
      };
      // Create mode for modules / competency-units / elements accepts multiple
      // names at once (one per line) instead of forcing a single add-then-repeat
      // cycle. Edit mode still saves exactly one record.
      if (
        !isEditing &&
        ["modules", "competency-units", "elements"].includes(kind)
      ) {
        const names = String(form.get("name") ?? "")
          .split("\n")
          .map(line => line.trim())
          .filter(Boolean);
        const uniqueNames = [...new Set(names)];
        if (!uniqueNames.length) throw new Error("Enter at least one name.");
        // These are independent creates (different names, no shared state
        // to race on) — firing them together instead of one-at-a-time
        // turns N sequential round-trips into a single round-trip's worth
        // of wall-clock time, which matters once someone pastes in a dozen
        // module/CU/element names at once.
        await Promise.all(uniqueNames.map(name => saveAcademicRecord(keyFor(kind), curriculumBaseFor(name))));
        toast.success(
          uniqueNames.length === 1
            ? `${definition.singular[0].toUpperCase()}${definition.singular.slice(1)} created`
            : `${uniqueNames.length} ${definition.plural.toLowerCase()} created`
        );
        goBack();
        return;
      }
      if (["modules", "competency-units", "elements"].includes(kind)) {
        record = curriculumBaseFor(String(form.get("name")).trim());
      }
      await saveAcademicRecord(keyFor(kind), record);
      toast.success(
        `${definition.singular[0].toUpperCase()}${definition.singular.slice(1)} ${isEditing ? "updated" : "created"}`
      );
      goBack();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader
        eyebrow="Record editor"
        title={
          isEditing
            ? `Edit ${definition.singular}`
            : `Add ${definition.singular}`
        }
        description={`Complete the required fields for this ${definition.singular}. Changes are saved to the Laravel API.`}
        action={
          <Button
            variant="outline"
            className="border-[#d5ddd6]"
            onClick={goBack}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to list
          </Button>
        }
      />
      <RecordCard>
        <form className="p-5 md:p-7" onSubmit={submit}>
          <div className="grid gap-5 md:grid-cols-2">
            {kind === "courses" && (
              <>
                <Field label="Course code" required>
                  <Input
                    name="courseCode"
                    defaultValue={existing?.code ?? ""}
                    placeholder="e.g. PWAD"
                    required
                  />
                </Field>
                <Field label="Course name" required>
                  <Input
                    name="courseName"
                    list="course-name-options"
                    defaultValue={existing?.name ?? ""}
                    placeholder="Choose or enter a course name"
                    required
                  />
                  <datalist id="course-name-options">
                    {records.courses.map(item => (
                      <option key={item.id} value={item.name} />
                    ))}
                  </datalist>
                </Field>
                <Field label="Duration in months" required>
                  <Input
                    name="duration"
                    type="number"
                    min="1"
                    defaultValue={Number.parseInt(
                      existing?.duration ?? "6",
                      10
                    )}
                    required
                  />
                </Field>
              </>
            )}
            {kind === "tsps" && (
              <>
                <Field label="TSP code" required>
                  <Input
                    name="tspCode"
                    defaultValue={existing?.code ?? ""}
                    placeholder="e.g. CCSL"
                    required
                  />
                </Field>
                <Field label="TSP name" required>
                  <Input
                    name="tspName"
                    list="tsp-name-options"
                    defaultValue={existing?.name ?? ""}
                    placeholder="Choose or enter a TSP name"
                    required
                  />
                  <datalist id="tsp-name-options">
                    {records.tsps.map(item => (
                      <option key={item.id} value={item.name} />
                    ))}
                  </datalist>
                </Field>
                <Field label="Location" required>
                  <Input
                    name="location"
                    defaultValue={existing?.location ?? ""}
                    placeholder="e.g. Dhaka"
                    required
                  />
                </Field>
                <Field label="Center Manager Mobile Number">
                  <Input
                    name="centerManagerMobile"
                    type="tel"
                    defaultValue={existing?.centerManagerMobile ?? ""}
                    placeholder="e.g. 01711000000"
                  />
                </Field>
              </>
            )}
            {kind === "rounds" && (
              <>
                <Field label="Round code" required>
                  <Input
                    name="roundCode"
                    defaultValue={existing?.code ?? ""}
                    placeholder="e.g. R-2026-1"
                    required
                  />
                </Field>
                <Field label="Round name" required>
                  <Input
                    name="roundName"
                    defaultValue={existing?.name ?? ""}
                    placeholder="e.g. Round 1 - 2026"
                    required
                  />
                </Field>
              </>
            )}
            {kind === "batches" && (
              <>
                <Field label="Course" required>
                  <Select
                    value={courseCode}
                    onChange={event => setCourseCode(event.target.value)}
                  >
                    {allowedCourses.map(item => (
                      <option key={item.id} value={item.code}>
                        {item.code} · {item.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="TSP" required>
                  <Select
                    value={tspId}
                    onChange={event => setTspId(event.target.value)}
                  >
                    {records.tsps.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.code} · {item.name} · {item.location}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Shift" required>
                  <Select
                    name="shift"
                    defaultValue={existing?.shift ?? "Morning"}
                  >
                    <option>Morning</option>
                    <option>Day</option>
                    <option>Evening</option>
                  </Select>
                </Field>
                <Field label="Round" required>
                  <Select
                    value={roundId}
                    onChange={event => setRoundId(event.target.value)}
                  >
                    {records.rounds.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.code} · {item.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Batch number" required>
                  <Input
                    name="batchNumber"
                    defaultValue={existing?.batchNumber ?? "01"}
                    required
                  />
                </Field>
                <Field label="Capacity" required>
                  <Input
                    name="capacity"
                    type="number"
                    min="1"
                    defaultValue={existing?.capacity ?? 15}
                    required
                  />
                </Field>
                <Field label="Start date" required>
                  <Input
                    name="startDate"
                    type="date"
                    defaultValue={existing?.startDate ?? "2026-01-05"}
                    required
                  />
                </Field>
                <Field label="End date" required>
                  <Input
                    name="endDate"
                    type="date"
                    defaultValue={existing?.endDate ?? "2026-06-30"}
                    required
                  />
                </Field>
              </>
            )}
            {kind === "students" && (
              <>
                <Field label="Student ID" required>
                  <Input
                    name="studentId"
                    defaultValue={existing?.studentId ?? ""}
                    required
                  />
                </Field>
                <Field label="Full name" required>
                  <Input
                    name="name"
                    defaultValue={existing?.name ?? ""}
                    required
                  />
                </Field>
                <Field label="Date of birth (DD-MM-YYYY)" required>
                  <Input
                    name="dob"
                    type="text"
                    inputMode="numeric"
                    pattern={DMY_PATTERN}
                    placeholder="DD-MM-YYYY"
                    maxLength={10}
                    defaultValue={existing?.dob ? ymdToDmy(existing.dob) : "12-04-2003"}
                    onChange={(event) => { event.target.value = autoFormatDmyInput(event.target.value); }}
                    required
                  />
                </Field>
                <Field label="Email">
                  <Input
                    name="email"
                    type="email"
                    defaultValue={existing?.email ?? ""}
                  />
                </Field>
                <Field label="Assign batch" required>
                  {allowedBatches.filter(item => item.students < item.capacity).length === 0 ? (
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900">
                      No batch with open capacity is available yet. Create or open up a batch before adding this
                      student — without a batch assignment they will not be able to sign in or access an
                      examination.
                    </p>
                  ) : (
                    <Select
                      name="batchId"
                      required
                      defaultValue={
                        existing?.batchId ??
                        allowedBatches.find(item => item.students < item.capacity)?.id
                      }
                    >
                      {allowedBatches.map(item => (
                        <option
                          key={item.id}
                          value={item.id}
                          disabled={item.students >= item.capacity}
                        >
                          {item.identifier} · {item.students} / {item.capacity}{" "}
                          students
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </>
            )}
            {["modules", "competency-units", "elements"].includes(kind) && (
              <>
                <Field label="Course" required>
                  <Select
                    value={courseCode}
                    onChange={event => {
                      setCourseCode(event.target.value);
                      setModuleId("");
                      setCuId("");
                      setSubjectId("");
                    }}
                  >
                    {allowedCourses.map(item => (
                      <option key={item.id} value={item.code}>
                        {item.code} · {item.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                {["modules", "competency-units", "elements"].includes(kind) && (
                  <Field label="Subject" required>
                    <Select
                      value={subjectId || selectedSubject?.id || ""}
                      onChange={event => {
                        setSubjectId(event.target.value);
                        setModuleId("");
                        setCuId("");
                      }}
                    >
                      <option value="" disabled>
                        Select subject
                      </option>
                      {selectedSubjectsForCourse.map(item => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                {["competency-units", "elements"].includes(kind) && (
                  <Field label="Module" required>
                    <Select
                      value={moduleId || selectedModule?.id || ""}
                      onChange={event => {
                        setModuleId(event.target.value);
                        setCuId("");
                      }}
                    >
                      <option value="" disabled>
                        Select module
                      </option>
                      {selectedModules.map(item => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                {kind === "elements" && (
                  <Field label="Competency unit" required>
                    <Select
                      value={cuId || selectedUnit?.id || ""}
                      onChange={event => setCuId(event.target.value)}
                    >
                      <option value="" disabled>
                        Select competency unit
                      </option>
                      {selectedUnits.map(item => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                <Field
                  label={
                    isEditing
                      ? `${definition.singular[0].toUpperCase()}${definition.singular.slice(1)} name`
                      : `${definition.plural} name(s)`
                  }
                  required
                >
                  {isEditing ? (
                    <Input
                      name="name"
                      defaultValue={existing?.name ?? ""}
                      placeholder={`Enter ${definition.singular} name`}
                      required
                    />
                  ) : (
                    <>
                      <Textarea
                        name="name"
                        rows={5}
                        placeholder={`Enter one ${definition.singular} name per line to add multiple at once, e.g.\n${definition.singular[0].toUpperCase()}${definition.singular.slice(1)} 1\n${definition.singular[0].toUpperCase()}${definition.singular.slice(1)} 2`}
                        required
                      />
                      <p className="mt-1.5 text-xs text-[#77877f]">
                        One name per line — each line becomes a separate {definition.singular}, all under the course/subject/{["competency-units", "elements"].includes(kind) ? "module" : ""}{kind === "elements" ? "/competency unit" : ""} selected above.
                      </p>
                    </>
                  )}
                </Field>
                {isEditing && ["modules", "competency-units", "elements"].includes(kind) && (
                  <Field label="Status">
                    <Select name="status" defaultValue={existing?.status ?? "Active"}>
                      <option>Active</option>
                      <option>Inactive</option>
                    </Select>
                  </Field>
                )}
              </>
            )}
            {!["subjects", "modules", "competency-units", "elements"].includes(
              kind
            ) && (
              <Field label="Status">
                <Select
                  name="status"
                  defaultValue={existing?.status ?? "Active"}
                >
                  <option>Active</option>
                  <option>Inactive</option>
                  <option>Completed</option>
                </Select>
              </Field>
            )}
          </div>
          <div className="mt-7 flex justify-end gap-3 border-t border-[#e6ebe6] pt-5">
            <Button type="button" variant="outline" onClick={goBack}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy} className="bg-[#0e5a4f] hover:bg-[#0a4a40]">
              <Save className="mr-2 h-4 w-4" />
              {busy ? "Saving…" : isEditing ? "Save changes" : `Create ${definition.singular}`}
            </Button>
          </div>
        </form>
      </RecordCard>
    </>
  );
}

function BatchDetailPage() {
  const [, params] = useRoute("/admin/batches/:id");
  const { session } = useAuth();
  const records = useAcademicRecords();
  const batch =
    records.batches.find(record => record.id === params?.id) ??
    records.batches[0];
  if (!batch || !hasCourseScope(session, batch.course))
    return (
      <>
        <PageHeader
          eyebrow="Restricted record"
          title="Batch unavailable"
          description="This batch does not belong to your assigned course scope."
        />
        <RecordCard className="p-6">
          <p className="text-sm leading-6 text-[#536b64]">
            Ask a Super Admin to update your course assignment if you require
            access.
          </p>
        </RecordCard>
      </>
    );
  const assigned = records.students.filter(
    student => student.batchId === batch.id
  );
  return (
    <>
      <PageHeader
        eyebrow="Batch record"
        title={String(batch.identifier)}
        description="A consolidated academic context with member capacity and forthcoming examination information."
        action={
          <Link
            href={`/admin/batches/${batch.id}/edit`}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#d5ddd6] bg-white px-4 text-sm font-semibold text-[#264741]"
          >
            <Edit3 className="h-4 w-4" />
            Edit batch
          </Link>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[1.05fr_1.35fr]">
        <RecordCard className="p-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#72827e]">
            Batch information
          </p>
          <dl className="mt-5 space-y-4">
            {[
              ["Course", batch.course],
              ["TSP", batch.tsp],
              ["Shift", batch.shift],
              ["Round", batch.round],
              ["Batch number", batch.batchNumber],
              ["Period", `${batch.startDate} — ${batch.endDate}`],
              ["Status", batch.status],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="flex items-start justify-between gap-5 border-b border-[#edf0ec] pb-3 text-sm"
              >
                <dt className="font-medium text-[#73837f]">{label}</dt>
                <dd className="text-right font-semibold text-[#29453f]">
                  {label === "Status" ? <StatusBadge value={value} /> : value}
                </dd>
              </div>
            ))}
          </dl>
        </RecordCard>
        <RecordCard>
          <div className="flex items-center justify-between border-b border-[#e5ebe5] p-5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#72827e]">
                Assigned students
              </p>
              <h3 className="mt-1 font-serif text-xl font-semibold text-[#1d413b]">
                {batch.students} / {batch.capacity} active students
              </h3>
            </div>
            <span className="rounded-full bg-[#e8f3ed] px-3 py-1.5 text-xs font-bold text-[#0e5a4f]">
              {Number(batch.capacity) - Number(batch.students)} available slots
            </span>
          </div>
          <DataTable
            records={assigned}
            columns={[
              { key: "studentId", label: "Student ID" },
              {
                key: "name",
                label: "Student",
                render: record => (
                  <span className="font-semibold text-[#25453e]">
                    {String(record.name)}
                  </span>
                ),
              },
              { key: "email", label: "Email" },
              {
                key: "status",
                label: "Status",
                render: record => <StatusBadge value={record.status} />,
              },
            ]}
          />
        </RecordCard>
      </div>
    </>
  );
}

function CurriculumOverviewPage() {
  const records = useAcademicRecords();
  const course =
    records.courses.find(item => item.code === "PWAD") ?? records.courses[0];
  return (
    <>
      <PageHeader
        eyebrow="Curriculum navigation"
        title="Curriculum overview"
        description="Verify the relationship from course to subject, module, competency unit, and element before building question banks or examinations."
        action={
          <Link
            href="/admin/curriculum/import"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0e5a4f] px-4 text-sm font-semibold text-white hover:bg-[#0a4a40]"
          >
            <UploadCloud className="h-4 w-4" />
            CSV Import Curriculum
          </Link>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_1.35fr]">
        <RecordCard className="p-6">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-[#e9f1ec] text-[#0e5a4f]">
              <FolderTree className="h-5 w-5" />
            </div>
            <div>
              <p className="font-serif text-xl font-semibold text-[#1c403b]">
                {course?.code}
              </p>
              <p className="text-sm text-[#6d7d78]">{course?.name}</p>
            </div>
          </div>
          <div className="mt-6 space-y-5">
            {records.subjects
              .filter(subject => subject.courses.includes(course?.code))
              .map(subject => (
                <div
                  key={subject.id}
                  className="flex items-start justify-between gap-3 border-l-2 border-[#a4c4b8] pl-4"
                >
                  <div>
                    <p className="font-semibold text-[#274740]">
                      {String(subject.name)}
                    </p>
                    <p className="mt-1 text-xs text-[#788783]">
                      Shared with {subject.courses.join(", ")}
                    </p>
                  </div>
                  <Link
                    href={`/admin/subjects/${subject.id}/edit`}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 ring-1 ring-inset ring-emerald-700/10 transition hover:bg-[#0e5a4f] hover:text-white hover:ring-[#0e5a4f]"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Edit
                  </Link>
                </div>
              ))}
          </div>
        </RecordCard>
        <RecordCard className="p-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#72827e]">
            Module to element trail
          </p>
          <div className="mt-5 space-y-5">
            {records.modules
              .filter(module => module.course === course?.code)
              .map(module => (
                <div
                  key={module.id}
                  className="rounded-lg border border-[#e3e9e3] bg-[#fbfcfa] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-[#24443e]">
                      {String(module.name)}
                    </p>
                    <Link
                      href={`/admin/modules/${module.id}/edit`}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 ring-1 ring-inset ring-emerald-700/10 transition hover:bg-[#0e5a4f] hover:text-white hover:ring-[#0e5a4f]"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Edit
                    </Link>
                  </div>
                  {records.competencyUnits
                    .filter(unit => unit.moduleId === module.id)
                    .map(unit => (
                      <div
                        key={unit.id}
                        className="mt-4 border-l-2 border-[#0e5a4f] pl-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-semibold text-[#31514a]">
                            {String(unit.name)}
                          </p>
                          <Link
                            href={`/admin/competency-units/${unit.id}/edit`}
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 ring-1 ring-inset ring-emerald-700/10 transition hover:bg-[#0e5a4f] hover:text-white hover:ring-[#0e5a4f]"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            Edit
                          </Link>
                        </div>
                        {records.elements
                          .filter(
                            element => element.competencyUnitId === unit.id
                          )
                          .map(element => (
                            <div
                              key={element.id}
                              className="mt-2 flex items-start justify-between gap-3"
                            >
                              <p className="text-sm text-[#687975]">
                                • {String(element.name)}
                              </p>
                              <Link
                                href={`/admin/elements/${element.id}/edit`}
                                className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 ring-1 ring-inset ring-emerald-700/10 transition hover:bg-[#0e5a4f] hover:text-white hover:ring-[#0e5a4f]"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                                Edit
                              </Link>
                            </div>
                          ))}
                      </div>
                    ))}
                </div>
              ))}
          </div>
        </RecordCard>
      </div>
    </>
  );
}

const curriculumImportTabs = [
  { kind: "subjects", label: "Subjects only" },
  { kind: "modules", label: "Modules only" },
  { kind: "competency-units", label: "Competency units only" },
  { kind: "elements", label: "Elements only" },
];

function CurriculumImportPage() {
  const { session } = useAuth();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [kind, setKind] = useState("subjects");
  const allowedCourses = session.isSuperAdmin ? [] : session.courseCodes ?? [];
  const active = curriculumImportTabs.find(tab => tab.kind === kind);
  return (
    <>
      <PageHeader
        eyebrow="Curriculum management"
        title="CSV Import Curriculum"
        description="Upload one CSV with course, subject, module, competency unit, and element columns — every level is created automatically in a single import. Rows that reuse an existing subject, module, or competency unit simply attach to it instead of duplicating it."
        action={
          <Link
            href="/admin/curriculum"
            className="inline-flex h-10 items-center rounded-lg border border-[#d6ded7] bg-white px-4 text-sm font-semibold text-[#294942] hover:bg-[#f6faf6]"
          >
            Back to Curriculum
          </Link>
        }
      />
      <RecordCard className="overflow-hidden">
        <div className="grid gap-6 p-6 lg:grid-cols-[1fr_0.72fr] lg:items-center lg:p-8">
          <div>
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-lg bg-[#e5f0ec] text-[#0e5a4f]">
                <FolderTree className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#6f7f79]">
                  One file, whole hierarchy
                </p>
                <h3 className="mt-1 font-serif text-2xl font-semibold text-[#1e403a]">
                  Import full curriculum from one CSV
                </h3>
              </div>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-[#657570]">
              Each row lists a course, subject, module, competency unit, and element. Subjects, modules, and
              competency units are created the first time they appear and reused for every later row that repeats
              them — so a course's entire curriculum tree can be built from one spreadsheet.
            </p>
            <div className="mt-5 grid gap-3 text-sm text-[#48635b] sm:grid-cols-3">
              <div className="rounded-lg border border-[#e1e9e2] bg-[#fbfcfa] p-3">
                <p className="font-semibold text-[#294a43]">1. Prepare</p>
                <p className="mt-1 text-xs leading-5">Use the template or demo CSV.</p>
              </div>
              <div className="rounded-lg border border-[#e1e9e2] bg-[#fbfcfa] p-3">
                <p className="font-semibold text-[#294a43]">2. Validate</p>
                <p className="mt-1 text-xs leading-5">Review row and column errors.</p>
              </div>
              <div className="rounded-lg border border-[#e1e9e2] bg-[#fbfcfa] p-3">
                <p className="font-semibold text-[#294a43]">3. Import</p>
                <p className="mt-1 text-xs leading-5">Every level is created in one pass.</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-[#d8e5db] bg-[#f5fbf7] p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#5c766d]">
              Authorized course scope
            </p>
            <p className="mt-2 text-sm leading-6 text-[#48635b]">
              Only courses permitted for your signed-in account can be imported.
            </p>
            {allowedCourses.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {allowedCourses.map(course => (
                  <span
                    key={course}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#0e5a4f] ring-1 ring-inset ring-[#bfd7c6]"
                  >
                    {course}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <CsvTemplateDownloadButton dataType="curriculum" allowedCourses={allowedCourses} />
              <CsvBulkImportDialog dataType="curriculum" allowedCourses={allowedCourses} />
            </div>
          </div>
        </div>
      </RecordCard>
      <RecordCard className="mt-5 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAdvanced(current => !current)}
          className="flex w-full items-center justify-between gap-3 p-5 text-left"
        >
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#72827e]">Advanced</p>
            <p className="mt-1 font-serif text-lg font-semibold text-[#1e403a]">
              Import just one level instead
            </p>
          </div>
          <ChevronDown
            className={`h-5 w-5 shrink-0 text-[#0e5a4f] transition-transform ${showAdvanced ? "rotate-180" : ""}`}
          />
        </button>
        {showAdvanced && (
          <div className="border-t border-[#e6ece7] p-5">
            <p className="text-sm leading-6 text-[#657570]">
              Only needed if you want to add records to a single level (e.g. just new elements under existing
              competency units) instead of the full hierarchy above.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {curriculumImportTabs.map(tab => (
                <button
                  key={tab.kind}
                  type="button"
                  onClick={() => setKind(tab.kind)}
                  className={`rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] transition ${
                    tab.kind === kind
                      ? "bg-[#0e5a4f] text-white"
                      : "border border-[#d6ded7] bg-white text-[#4c645d] hover:bg-[#f3f8f5]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 sm:max-w-md">
              <CsvTemplateDownloadButton dataType={kind} allowedCourses={allowedCourses} />
              <CsvBulkImportDialog dataType={kind} allowedCourses={allowedCourses} />
            </div>
          </div>
        )}
      </RecordCard>
    </>
  );
}

function DashboardPage() {
  // Seed from the module-level cache in academic-demo-store (set by a
  // previous successful fetch this session) so navigating back to the
  // dashboard shows the last known numbers immediately instead of
  // flashing back to "…" while a fresh request that will very likely
  // return the same values completes.
  const [stats, setStats] = useState(() => getCachedDashboardStats());
  useEffect(() => {
    let active = true;
    fetchDashboardStats()
      .then(next => {
        if (active) setStats(next);
      })
      .catch(() => {
        // Keep showing whatever we already had (cached or freshly loaded)
        // rather than overwriting good numbers with zeros on a transient
        // network error.
        if (active) setStats(prev => prev ?? { activeCourses: 0, activeBatches: 0 });
      });
    return () => {
      active = false;
    };
  }, []);

  const [overview, setOverview] = useState(() => loadCachedDashboardOverview());
  const [overviewError, setOverviewError] = useState("");
  useEffect(() => {
    let active = true;
    dashboardService
      .overview()
      .then((data) => {
        if (active) {
          setOverview(data);
          cacheDashboardOverview(data);
        }
      })
      .catch((err) => {
        // Keep showing whatever was cached rather than replacing good
        // data with an error banner on a transient network hiccup.
        if (active && !overview) setOverviewError(err?.response?.data?.message ?? "Exam schedule and performance data could not be loaded.");
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cards = [
    [
      "Active courses",
      stats ? String(stats.activeCourses) : "…",
      "Course delivery records",
      "/admin/courses",
    ],
    [
      "Active batches",
      stats ? String(stats.activeBatches) : "…",
      "Enrolled student batches",
      "/admin/batches",
    ],
    [
      "Question bank",
      "Question management",
      "Manage eligible questions",
      "/admin/questions",
    ],
    ["Exams", "Exam operation", "Review assessment status", "/admin/exams"],
  ];

  const examTypeLabel = (examType) => (String(examType).toUpperCase() === "MONTHLY" ? "Monthly" : "Mid Monthly");
  const formatWhen = (isoString) => (isoString ? new Date(isoString).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Not scheduled yet");

  return (
    <>
      <PageHeader
        eyebrow="System overview"
        title="Operational dashboard"
        description="A concise view of the current examination workspace, with direct paths to high-priority administrative work."
        action={
          <PrimaryLink href="/admin/exams/create">Create exam</PrimaryLink>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, note, href]) => (
          <Link key={label} href={href} className="block">
            <RecordCard className="p-5 transition hover:-translate-y-0.5 hover:border-[#9fc4b4] hover:bg-[#fbfdfb]">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#72827e]">
                {label}
              </p>
              <p className="mt-3 font-serif text-3xl font-semibold text-[#173c36]">
                {value}
              </p>
              <p className="mt-2 text-xs text-[#70807b]">{note} · View</p>
            </RecordCard>
          </Link>
        ))}
      </div>

      {overviewError ? (
        <RecordCard className="mt-5 border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          {overviewError}
        </RecordCard>
      ) : !overview ? (
        <RecordCard className="mt-5 p-8 text-center font-semibold text-[#295148]">
          Loading exam schedule and performance…
        </RecordCard>
      ) : (
        <>
          {/* Overall performance */}
          <RecordCard className="mt-5 p-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#72827e]">
              Performance
            </p>
            <h3 className="mt-1 font-serif text-2xl font-semibold text-[#24453f]">
              Across everything you have access to
            </h3>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {[
                ["Students assigned", overview.performance.students_assigned],
                ["Pass", overview.performance.pass],
                ["Fail", overview.performance.fail],
                ["Absent", overview.performance.absent],
                ["Pass rate", `${overview.performance.pass_rate}%`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-[#e3eae4] bg-[#fbfcfa] p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-[#7b8985]">{label}</p>
                  <p className="mt-1 font-serif text-2xl font-semibold text-[#24453f]">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <Link
                href="/admin/reports"
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#d5ddd6] bg-white px-4 text-xs font-semibold text-[#0e5a4f] transition hover:border-[#9cc1b2] hover:bg-[#f3f8f5]"
              >
                <FileBarChart2 className="h-3.5 w-3.5" />
                View full reports
              </Link>
            </div>
          </RecordCard>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            {/* Upcoming exams */}
            <RecordCard className="p-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#72827e]">
                Upcoming
              </p>
              <h3 className="mt-1 font-serif text-xl font-semibold text-[#24453f]">
                Exams not finished yet
              </h3>
              {overview.upcoming_exams.length ? (
                <ul className="mt-4 divide-y divide-[#edf0ec]">
                  {overview.upcoming_exams.map((exam) => (
                    <li key={exam.exam_id} className="flex items-center justify-between gap-3 py-3 text-sm">
                      <div>
                        <p className="font-semibold text-[#24453f]">{exam.exam_title}</p>
                        <p className="text-xs text-[#71827c]">{exam.course} · {exam.batch}</p>
                      </div>
                      <div className="text-right">
                        <span className="inline-flex items-center rounded-full bg-[#e8f3ed] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#0e5a4f]">
                          {examTypeLabel(exam.exam_type)}
                        </span>
                        <p className="mt-1 text-xs text-[#71827c]">{formatWhen(exam.start_at)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-[#70807b]">Nothing upcoming right now.</p>
              )}
            </RecordCard>

            {/* Recently completed exams */}
            <RecordCard className="p-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#72827e]">
                Recently finished
              </p>
              <h3 className="mt-1 font-serif text-xl font-semibold text-[#24453f]">
                Exams already completed
              </h3>
              {overview.recent_exams.length ? (
                <ul className="mt-4 divide-y divide-[#edf0ec]">
                  {overview.recent_exams.map((exam) => (
                    <li key={exam.exam_id} className="flex items-center justify-between gap-3 py-3 text-sm">
                      <div>
                        <p className="font-semibold text-[#24453f]">{exam.exam_title}</p>
                        <p className="text-xs text-[#71827c]">{exam.course} · {exam.batch}</p>
                      </div>
                      <div className="text-right">
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-700">
                          {examTypeLabel(exam.exam_type)}
                        </span>
                        <p className="mt-1 text-xs text-[#71827c]">{formatWhen(exam.end_at)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-[#70807b]">No exams have finished yet.</p>
              )}
            </RecordCard>
          </div>

          {/* Next exam per batch (Mid Monthly <-> Monthly rotation) */}
          {overview.next_by_batch.length > 0 && (
            <RecordCard className="mt-5 p-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#72827e]">
                What's next, per batch
              </p>
              <h3 className="mt-1 font-serif text-xl font-semibold text-[#24453f]">
                Mid Monthly finished → Monthly is next (and vice versa)
              </h3>
              <DataTable
                records={overview.next_by_batch}
                rowLabel="batches"
                pageSize={8}
                columns={[
                  { key: "batch", label: "Batch" },
                  { key: "course", label: "Course" },
                  { key: "just_finished", label: "Just finished", render: (r) => `${r.just_finished.exam_title} (${formatWhen(r.just_finished.end_at)})` },
                  {
                    key: "next_type",
                    label: "Next up",
                    render: (r) => (
                      <span className="inline-flex items-center rounded-full bg-[#e8f3ed] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#0e5a4f]">
                        {examTypeLabel(r.next_type)}
                      </span>
                    ),
                  },
                  {
                    key: "next_exam",
                    label: "Status",
                    render: (r) => (r.next_exam ? `Scheduled · ${formatWhen(r.next_exam.start_at)}` : "Not scheduled yet"),
                  },
                ]}
              />
            </RecordCard>
          )}

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            {/* Courses overview */}
            <RecordCard className="p-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#72827e]">
                Courses
              </p>
              <h3 className="mt-1 font-serif text-xl font-semibold text-[#24453f]">
                Overview
              </h3>
              <DataTable
                records={overview.courses}
                rowLabel="courses"
                pageSize={6}
                columns={[
                  { key: "code", label: "Course" },
                  { key: "active_batches", label: "Active batches" },
                  { key: "batches", label: "Total batches" },
                  { key: "pass_rate", label: "Pass rate", render: (r) => (r.pass_rate === null ? "—" : `${r.pass_rate}%`) },
                  {
                    key: "actions",
                    label: "",
                    render: (r) => (
                      <Link
                        href={`/admin/batches?course=${r.code}`}
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-[#d5ddd6] bg-white px-3 text-xs font-semibold text-[#0e5a4f] transition hover:border-[#9cc1b2] hover:bg-[#f3f8f5]"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View batches
                      </Link>
                    ),
                  },
                ]}
              />
            </RecordCard>

            {/* Rounds overview */}
            <RecordCard className="p-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#72827e]">
                Rounds
              </p>
              <h3 className="mt-1 font-serif text-xl font-semibold text-[#24453f]">
                Overview
              </h3>
              <p className="mt-2 text-xs text-[#71827c]">
                Rounds don't carry their own dates in this system — a round with no active batch yet is shown as "Upcoming".
              </p>
              <DataTable
                records={overview.rounds}
                rowLabel="rounds"
                pageSize={6}
                columns={[
                  { key: "name", label: "Round" },
                  { key: "active_batches", label: "Active batches" },
                  {
                    key: "is_upcoming",
                    label: "Status",
                    render: (r) => (
                      <StatusBadge value={r.is_upcoming ? "Scheduled (upcoming)" : "Active"} />
                    ),
                  },
                ]}
              />
            </RecordCard>
          </div>
        </>
      )}

      <RecordCard className="mt-5 p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#72827e]">
          Quick actions
        </p>
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {[
            ["Add student", "/admin/students/create"],
            ["Add question", "/admin/questions/create"],
            ["Import students", "/admin/students"],
            ["Review results", "/admin/results"],
          ].map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="flex items-center justify-between rounded-lg border border-[#e1e8e2] px-4 py-3 text-sm font-semibold text-[#34544e] transition hover:border-[#9cc1b2] hover:bg-[#f3f8f5]"
            >
              <span>{label}</span>
              <ChevronDown className="h-4 w-4 -rotate-90 text-[#0e5a4f]" />
            </Link>
          ))}
        </div>
      </RecordCard>
    </>
  );
}

export {
  BatchDetailPage,
  CurriculumImportPage,
  CurriculumOverviewPage,
  DashboardPage,
  ManagementFormPage,
  ManagementListPage,
  defs as getDefinition,
};