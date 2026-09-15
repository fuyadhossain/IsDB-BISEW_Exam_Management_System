/** Question Bank style: course-scoped authoring with a curriculum trail that feeds online attempts and fixed monthly paper snapshots. */
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  FileText,
  History,
  Plus,
  Save,
  Trash2,
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
import {
  CsvBulkImportDialog,
  CsvTemplateDownloadButton,
} from "@/components/csv-bulk-import";
import { useAuth } from "@/contexts/AuthContext";
import {
  hasCourseScope,
  scopeCourseOptions,
  scopeRecords,
} from "@/lib/course-scope";
import {
  academicUpdateEvent,
  getAcademicLoadProgress,
  getAcademicRecords,
  isAcademicRecordsLoaded,
} from "@/lib/academic-demo-store";
import {
  getQuestionLoadProgress,
  getQuestionRecords,
  isQuestionRecordsLoaded,
  questionUpdateEvent,
  saveQuestionRecord,
} from "@/lib/question-demo-store";
import { questionImportService } from "@/services/services";

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
const useQuestionRecords = () => {
  const [records, setRecords] = useState(() => getQuestionRecords());
  useEffect(() => {
    const refresh = () => setRecords(getQuestionRecords());
    window.addEventListener(questionUpdateEvent, refresh);
    return () => window.removeEventListener(questionUpdateEvent, refresh);
  }, []);
  return records;
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
// Mirrors useExamWorkflowLoading() in exam-workflow-pages.jsx: the
// Question Bank list depends on both the question store and the academic
// store (round/course filters), so this only reports "loaded" once
// neither source is still pending. `percent` is a genuine combined
// progress readout from each store's own real step/page counters — see
// getQuestionLoadProgress() and getAcademicLoadProgress() — not a
// simulated animation.
const useQuestionListLoading = () => {
  const stillLoading = () =>
    !isQuestionRecordsLoaded() || !isAcademicRecordsLoaded();
  const computeProgress = () => {
    const question = getQuestionLoadProgress();
    const academic = getAcademicLoadProgress();
    const total = question.total + academic.total;
    if (!total) return null;
    const done = question.done + academic.done;
    return Math.min(100, Math.round((done / total) * 100));
  };
  const [loading, setLoading] = useState(stillLoading);
  const [percent, setPercent] = useState(computeProgress);
  useEffect(() => {
    if (!loading) return undefined;
    const check = () => {
      setLoading(stillLoading());
      setPercent(computeProgress());
    };
    window.addEventListener(questionUpdateEvent, check);
    window.addEventListener(academicUpdateEvent, check);
    return () => {
      window.removeEventListener(questionUpdateEvent, check);
      window.removeEventListener(academicUpdateEvent, check);
    };
  }, [loading]);
  return { loading, percent };
};
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

function QuestionListPage() {
  const { session } = useAuth();
  const questions = useQuestionRecords();
  const academic = useAcademicRecords();
  const { loading, percent } = useQuestionListLoading();
  const [search, setSearch] = useState("");
  const [course, setCourse] = useState("all");
  const [status, setStatus] = useState("all");
  const [round, setRound] = useState("all");
  const availableCourses = useMemo(
    () =>
      scopeCourseOptions(academic.courses, session).map((item) => item.code),
    [academic.courses, session],
  );
  const coursesInRound = useMemo(
    () =>
      round === "all"
        ? null
        : new Set(
            academic.batches
              .filter((batch) => batch.round === round)
              .map((batch) => batch.course),
          ),
    [academic.batches, round],
  );
  const roundScopedCourses = useMemo(
    () =>
      coursesInRound
        ? availableCourses.filter((code) => coursesInRound.has(code))
        : availableCourses,
    [availableCourses, coursesInRound],
  );
  const filtered = useMemo(
    () =>
      scopeRecords("questions", questions, session).filter(
        (question) =>
          Object.values(question)
            .join(" ")
            .toLowerCase()
            .includes(search.toLowerCase()) &&
          (course === "all" || question.course === course) &&
          (status === "all" || question.status === status) &&
          (!coursesInRound || coursesInRound.has(question.course)),
      ),
    [coursesInRound, course, questions, search, session, status],
  );
  return (
    <>
      <PageHeader
        eyebrow="Question management"
        title="Question bank"
        description="Search, filter, and maintain curriculum-aligned questions used for dynamic online attempts and fixed monthly papers."
        action={
          <div className="flex flex-wrap gap-2">
            <PrimaryLink href="/admin/questions/create">
              Add question
            </PrimaryLink>
          </div>
        }
      />
      <FilterBand
        onClear={() => {
          setSearch("");
          setCourse("all");
          setStatus("all");
          setRound("all");
        }}
      >
        <FilterField label="Search question text">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search question content"
          />
        </FilterField>
        <FilterField label="Round">
          <Select
            value={round}
            onChange={(event) => {
              setRound(event.target.value);
              setCourse("all");
            }}
          >
            <option value="all">All rounds</option>
            {academic.rounds.map((item) => (
              <option key={item.id} value={item.code}>
                {item.code} · {item.name}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField label="Course">
          <Select
            value={course}
            onChange={(event) => setCourse(event.target.value)}
            disabled={round === "all"}
          >
            <option value="all">
              {round === "all" ? "Select a round first" : "All courses"}
            </option>
            {roundScopedCourses.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField label="Question status">
          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">All statuses</option>
            <option>Active</option>
            <option>Inactive</option>
          </Select>
        </FilterField>
      </FilterBand>
      <DataTable
        records={filtered}
        rowLabel="questions"
        empty={
          loading ? (
            <RecordCard className="border-dashed p-8 text-center">
              <p className="font-semibold text-[#295148]">
                Loading questions…
              </p>
              <p className="mt-2 text-sm text-[#6c7d78]">
                Fetching the Question Bank, page by page.
              </p>
              <LoadingProgressBar percent={percent} />
            </RecordCard>
          ) : undefined
        }
        columns={[
          {
            key: "preview",
            label: "Question preview",
            className: "min-w-72",
            render: (record) => (
              <span className="line-clamp-2 font-medium text-[#294a43]">
                {String(record.preview)}
              </span>
            ),
          },
          { key: "course", label: "Course" },
          { key: "subject", label: "Subject" },
          { key: "module", label: "Module" },
          { key: "competencyUnit", label: "Competency unit" },
          {
            key: "marks",
            label: "Marks",
            render: (record) => (
              <span className="tabular-nums">{String(record.marks)}</span>
            ),
          },
          { key: "type", label: "Type" },
          {
            key: "status",
            label: "Status",
            render: (record) => <StatusBadge value={record.status} />,
          },
          {
            key: "actions",
            label: "Actions",
            render: (record) => (
              <div className="flex gap-2">
                <Link
                  href={`/admin/questions/${record.id}`}
                  className="inline-flex items-center rounded-md bg-[#e8f3ed] px-2.5 py-1.5 text-xs font-bold text-[#0e5a4f] transition hover:bg-[#d9ece2]"
                >
                  View
                </Link>
                <Link
                  href={`/admin/questions/${record.id}/edit`}
                  className="inline-flex items-center rounded-md bg-[#e8f3ed] px-2.5 py-1.5 text-xs font-bold text-[#0e5a4f] transition hover:bg-[#d9ece2]"
                >
                  Edit
                </Link>
              </div>
            ),
          },
        ]}
      />
    </>
  );
}

function QuestionImportPage() {
  const { session } = useAuth();
  const academic = useAcademicRecords();
  const availableCourses = useMemo(
    () =>
      scopeCourseOptions(academic.courses, session).map((item) => item.code),
    [academic.courses, session],
  );
  return (
    <>
      <PageHeader
        eyebrow="Question management"
        title="CSV Import Question"
        description="Import validated question records in bulk for the courses assigned to your account."
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/questions/import/history"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#d6ded7] bg-white px-4 text-sm font-semibold text-[#294942] hover:bg-[#f6faf6]"
            >
              <History className="h-4 w-4" />
              Import history
            </Link>
            <Link
              href="/admin/questions"
              className="inline-flex h-10 items-center rounded-lg border border-[#d6ded7] bg-white px-4 text-sm font-semibold text-[#294942] hover:bg-[#f6faf6]"
            >
              Back to Question Bank
            </Link>
          </div>
        }
      />
      <RecordCard className="overflow-hidden">
        <div className="grid gap-6 p-6 lg:grid-cols-[1fr_0.72fr] lg:items-center lg:p-8">
          <div>
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-lg bg-[#e5f0ec] text-[#0e5a4f]">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#6f7f79]">
                  Bulk question intake
                </p>
                <h3 className="mt-1 font-serif text-2xl font-semibold text-[#1e403a]">
                  Import questions from CSV
                </h3>
              </div>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-[#657570]">
              Choose the approved Questions CSV file. The complete file is
              previewed and validated before any records are saved. After
              importing, open{" "}
              <Link
                href="/admin/questions/import/history"
                className="font-semibold text-[#0e5a4f] underline"
              >
                Import history
              </Link>{" "}
              to see exactly which rows succeeded or failed and why.
            </p>
            <div className="mt-5 grid gap-3 text-sm text-[#48635b] sm:grid-cols-3">
              <div className="rounded-lg border border-[#e1e9e2] bg-[#fbfcfa] p-3">
                <p className="font-semibold text-[#294a43]">1. Prepare</p>
                <p className="mt-1 text-xs leading-5">
                  Use the template or demo CSV.
                </p>
              </div>
              <div className="rounded-lg border border-[#e1e9e2] bg-[#fbfcfa] p-3">
                <p className="font-semibold text-[#294a43]">2. Validate</p>
                <p className="mt-1 text-xs leading-5">
                  Review row and column errors.
                </p>
              </div>
              <div className="rounded-lg border border-[#e1e9e2] bg-[#fbfcfa] p-3">
                <p className="font-semibold text-[#294a43]">3. Import</p>
                <p className="mt-1 text-xs leading-5">
                  Save only an entirely valid file.
                </p>
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
            <div className="mt-4 flex flex-wrap gap-2">
              {availableCourses.map((course) => (
                <span
                  key={course}
                  className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#0e5a4f] ring-1 ring-inset ring-[#bfd7c6]"
                >
                  {course}
                </span>
              ))}
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <CsvTemplateDownloadButton
                dataType="questions"
                allowedCourses={availableCourses}
              />
              <CsvBulkImportDialog
                dataType="questions"
                allowedCourses={availableCourses}
              />
            </div>
          </div>
        </div>
      </RecordCard>
    </>
  );
}

const importStatusTone = {
  COMPLETED: "bg-emerald-50 text-emerald-800 ring-emerald-600/10",
  FAILED: "bg-rose-50 text-rose-800 ring-rose-600/10",
  PROCESSING: "bg-amber-50 text-amber-800 ring-amber-600/10",
  SUCCESS: "bg-emerald-50 text-emerald-800 ring-emerald-600/10",
  UPDATED: "bg-sky-50 text-sky-800 ring-sky-600/10",
  DUPLICATE: "bg-slate-50 text-slate-700 ring-slate-600/10",
};
const ImportStatusPill = ({ value }) => (
  <span
    className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${importStatusTone[value] ?? "bg-slate-50 text-slate-700 ring-slate-600/10"}`}
  >
    {value}
  </span>
);

/**
 * Every question CSV import is already persisted server-side (QuestionImport
 * + QuestionImportRow, via QuestionImportController) with per-row pass/fail
 * detail — but until now nothing in the app surfaced it, so a failed row
 * was only visible by opening the database directly. This lists every past
 * import for the signed-in administrator (or all of them for a Super
 * Admin) with its success/failure counts.
 */
function QuestionImportHistoryPage() {
  const [imports, setImports] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    questionImportService
      .list()
      .then((response) => {
        if (!active) return;
        const list =
          response?.data ?? (Array.isArray(response) ? response : []);
        setImports(list);
      })
      .catch((err) => {
        if (active) setError(err.message ?? "Unable to load import history.");
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <>
      <PageHeader
        eyebrow="Question management"
        title="Question CSV import history"
        description="Every uploaded question file, with row-level pass/fail detail — no database access required."
        action={
          <Link
            href="/admin/questions/import"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#d6ded7] bg-white px-4 text-sm font-semibold text-[#294942] hover:bg-[#f6faf6]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to CSV import
          </Link>
        }
      />
      {error && (
        <RecordCard className="p-6">
          <p className="text-sm text-rose-700">{error}</p>
        </RecordCard>
      )}
      {!error && imports === null && (
        <RecordCard className="p-6">
          <p className="text-sm text-[#657570]">Loading import history…</p>
        </RecordCard>
      )}
      {!error && imports !== null && imports.length === 0 && (
        <RecordCard className="p-6">
          <p className="text-sm text-[#657570]">
            No CSV files have been imported yet. Uploads from the CSV Import
            Question page will appear here.
          </p>
        </RecordCard>
      )}
      {!error && imports !== null && imports.length > 0 && (
        <DataTable
          records={imports}
          rowLabel="imports"
          columns={[
            {
              key: "file_name",
              label: "File",
              render: (record) => (
                <span className="font-semibold text-[#1f413c]">
                  {record.file_name}
                </span>
              ),
            },
            {
              key: "total_rows",
              label: "Rows",
              render: (record) => (
                <span className="tabular-nums">{record.total_rows}</span>
              ),
            },
            {
              key: "successful_rows",
              label: "Successful",
              render: (record) => (
                <span className="font-semibold tabular-nums text-emerald-700">
                  {record.successful_rows}
                </span>
              ),
            },
            {
              key: "failed_rows",
              label: "Failed",
              render: (record) => (
                <span
                  className={`font-semibold tabular-nums ${record.failed_rows > 0 ? "text-rose-700" : "text-[#657570]"}`}
                >
                  {record.failed_rows}
                </span>
              ),
            },
            {
              key: "updated_rows",
              label: "Updated",
              render: (record) => (
                <span className="font-semibold tabular-nums text-sky-700">
                  {record.updated_rows ?? 0}
                </span>
              ),
            },
            {
              key: "duplicate_rows",
              label: "Duplicate",
              render: (record) => (
                <span className="tabular-nums">{record.duplicate_rows}</span>
              ),
            },
            {
              key: "status",
              label: "Status",
              render: (record) => <ImportStatusPill value={record.status} />,
            },
            {
              key: "created_at",
              label: "Uploaded",
              render: (record) => (
                <span className="text-xs text-[#657570]">
                  {new Date(record.created_at).toLocaleString()}
                </span>
              ),
            },
            {
              key: "actions",
              label: "Actions",
              render: (record) => (
                <Link
                  href={`/admin/questions/import/history/${record.id}`}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 ring-1 ring-inset ring-emerald-700/10 transition hover:bg-[#0e5a4f] hover:text-white hover:ring-[#0e5a4f]"
                >
                  <Eye className="h-3.5 w-3.5" />
                  View rows
                </Link>
              ),
            },
          ]}
        />
      )}
    </>
  );
}

/** One import's full row-by-row result — every failed row's exact error message, so a rejected CSV can be corrected without ever opening the database. */
function QuestionImportDetailPage() {
  const [, params] = useRoute("/admin/questions/import/history/:id");
  const [record, setRecord] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!params?.id) return;
    let active = true;
    questionImportService
      .get(params.id)
      .then((response) => {
        if (active) setRecord(response);
      })
      .catch((err) => {
        if (active) setError(err.message ?? "Unable to load this import.");
      });
    return () => {
      active = false;
    };
  }, [params?.id]);
  if (error)
    return (
      <>
        <PageHeader
          eyebrow="Question management"
          title="Import unavailable"
          description={error}
          action={
            <Link
              href="/admin/questions/import/history"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#d6ded7] bg-white px-4 text-sm font-semibold text-[#294942] hover:bg-[#f6faf6]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to history
            </Link>
          }
        />
      </>
    );
  if (!record)
    return (
      <>
        <PageHeader
          eyebrow="Question management"
          title="Loading import…"
          description="Fetching row-level detail for this file."
        />
      </>
    );
  const rows = record.rows ?? [];
  const failedRows = rows.filter((row) => row.status === "FAILED");
  return (
    <>
      <PageHeader
        eyebrow="Question management"
        title={record.file_name}
        description={`Uploaded ${new Date(record.created_at).toLocaleString()} · ${record.total_rows} rows · ${record.successful_rows} successful · ${record.updated_rows ?? 0} updated · ${record.failed_rows} failed · ${record.duplicate_rows} duplicate`}
        action={
          <Link
            href="/admin/questions/import/history"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#d6ded7] bg-white px-4 text-sm font-semibold text-[#294942] hover:bg-[#f6faf6]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to history
          </Link>
        }
      />
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["Total rows", record.total_rows, "text-[#173c36]"],
          ["Successful", record.successful_rows, "text-emerald-700"],
          ["Updated", record.updated_rows ?? 0, "text-sky-700"],
          ["Failed", record.failed_rows, "text-rose-700"],
          ["Duplicate", record.duplicate_rows, "text-amber-700"],
        ].map(([label, value, tone]) => (
          <RecordCard key={label} className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#72827e]">
              {label}
            </p>
            <p className={`mt-2 font-serif text-2xl font-semibold ${tone}`}>
              {value}
            </p>
          </RecordCard>
        ))}
      </div>
      {failedRows.length > 0 && (
        <RecordCard className="mt-5 overflow-hidden">
          <div className="border-b border-rose-100 bg-rose-50 px-5 py-4">
            <p className="font-semibold text-rose-950">
              Failed rows ({failedRows.length})
            </p>
            <p className="mt-1 text-sm text-rose-800">
              Fix these rows in your source file, then re-upload only the
              corrected rows.
            </p>
          </div>
          <div className="max-h-[32rem] overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-[#fff8f8] text-xs uppercase tracking-[0.1em] text-rose-800">
                <tr>
                  <th className="px-4 py-3">Row</th>
                  <th className="px-4 py-3">Course</th>
                  <th className="px-4 py-3">Element</th>
                  <th className="px-4 py-3">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rose-100">
                {failedRows.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap px-4 py-3 font-mono font-bold text-rose-900">
                      {row.row_number}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-[#795e57]">
                      {row.raw_data?.course ?? "—"}
                    </td>
                    <td className="max-w-48 truncate px-4 py-3 text-xs text-[#795e57]">
                      {row.raw_data?.element ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[#6b504b]">
                      {row.error_message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </RecordCard>
      )}
      {rows.length > failedRows.length && (
        <RecordCard className="mt-5 overflow-hidden">
          <div className="border-b border-[#e6ece7] px-5 py-4">
            <p className="font-semibold text-[#1e403a]">All rows</p>
          </div>
          <div className="max-h-[32rem] overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-[#eff5f0] text-xs uppercase tracking-[0.1em] text-[#526961]">
                <tr>
                  <th className="px-4 py-3">Row</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Course</th>
                  <th className="px-4 py-3">Element</th>
                  <th className="px-4 py-3">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e9efea] bg-white">
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className={row.status === "FAILED" ? "bg-rose-50" : ""}
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-mono font-bold text-[#657973]">
                      {row.row_number}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <ImportStatusPill value={row.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-[#36534b]">
                      {row.raw_data?.course ?? "—"}
                    </td>
                    <td className="max-w-48 truncate px-4 py-3 text-xs text-[#36534b]">
                      {row.raw_data?.element ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#657973]">
                      {row.error_message ?? "Saved successfully."}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </RecordCard>
      )}
    </>
  );
}

function QuestionFormPage() {
  const [, params] = useRoute("/admin/questions/:id/edit");
  const isEditing = Boolean(params?.id);
  const [, navigate] = useLocation();
  const { session } = useAuth();
  const questions = useQuestionRecords();
  const academic = useAcademicRecords();
  const existing = isEditing
    ? questions.find((question) => question.id === params?.id)
    : null;
  const scopedCourses = scopeCourseOptions(academic.courses, session);
  const [course, setCourse] = useState(
    existing?.course ?? scopedCourses[0]?.code ?? "",
  );
  const selectedSubjects = academic.subjects.filter((item) =>
    item.courses.includes(course),
  );
  const [subject, setSubject] = useState(
    existing?.subject ?? selectedSubjects[0]?.name ?? "",
  );
  const selectedModules = academic.modules.filter(
    (item) =>
      item.course === course && (!item.subject || item.subject === subject),
  );
  const [moduleId, setModuleId] = useState(
    () =>
      academic.modules.find((item) =>
        item.name.startsWith(existing?.module ?? ""),
      )?.id ??
      selectedModules[0]?.id ??
      "",
  );
  const selectedModule =
    selectedModules.find((item) => item.id === moduleId) ?? selectedModules[0];
  const selectedUnits = academic.competencyUnits.filter(
    (item) => item.moduleId === selectedModule?.id,
  );
  const [cuId, setCuId] = useState(
    () =>
      academic.competencyUnits.find((item) =>
        item.name.startsWith(existing?.competencyUnit ?? ""),
      )?.id ??
      selectedUnits[0]?.id ??
      "",
  );
  const selectedUnit =
    selectedUnits.find((item) => item.id === cuId) ?? selectedUnits[0];
  const selectedElements = academic.elements.filter(
    (item) => item.competencyUnitId === selectedUnit?.id,
  );
  const [elementId, setElementId] = useState(
    () =>
      academic.elements.find((item) => item.name === existing?.element)?.id ??
      selectedElements[0]?.id ??
      "",
  );
  const selectedElement =
    selectedElements.find((item) => item.id === elementId) ??
    selectedElements[0];
  const [type, setType] = useState(existing?.type ?? "Single Correct");
  const initialOptions = existing?.options?.length
    ? existing.options.map((text, index) => ({
        id: `${index}`,
        text,
        correct: existing.correctOptionIds?.includes(`${index}`),
      }))
    : [
        { id: "0", text: "", correct: true },
        { id: "1", text: "", correct: false },
      ];
  const [options, setOptions] = useState(initialOptions);
  useEffect(() => {
    setSubject((value) =>
      selectedSubjects.some((item) => item.name === value)
        ? value
        : (selectedSubjects[0]?.name ?? ""),
    );
    setModuleId("");
    setCuId("");
    setElementId("");
  }, [course]);
  useEffect(() => {
    setModuleId((value) =>
      selectedModules.some((item) => item.id === value)
        ? value
        : (selectedModules[0]?.id ?? ""),
    );
  }, [selectedModules]);
  useEffect(() => {
    setCuId((value) =>
      selectedUnits.some((item) => item.id === value)
        ? value
        : (selectedUnits[0]?.id ?? ""),
    );
  }, [selectedUnits]);
  useEffect(() => {
    setElementId((value) =>
      selectedElements.some((item) => item.id === value)
        ? value
        : (selectedElements[0]?.id ?? ""),
    );
  }, [selectedElements]);
  if (isEditing && (!existing || !hasCourseScope(session, existing.course)))
    return (
      <>
        <PageHeader
          eyebrow="Restricted question"
          title="Question unavailable"
          description="This question belongs to a course outside your assigned scope."
        />
        <RecordCard className="p-6">
          <p className="text-sm text-[#536b64]">
            Return to your Question Bank to manage only authorized course
            records.
          </p>
        </RecordCard>
      </>
    );
  const updateOption = (id, patch) =>
    setOptions((current) =>
      current.map((option) =>
        option.id === id ? { ...option, ...patch } : option,
      ),
    );
  const toggleCorrect = (id) =>
    setOptions((current) =>
      current.map((option) =>
        type === "Single Correct"
          ? { ...option, correct: option.id === id }
          : option.id === id
            ? { ...option, correct: !option.correct }
            : option,
      ),
    );
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    if (!selectedModule || !selectedUnit || !selectedElement)
      return toast.error("Complete each curriculum selection before saving.");
    if (
      type !== "Descriptive" &&
      (!options.some((option) => option.correct) ||
        options.some((option) => !option.text.trim()))
    )
      return toast.error(
        "Provide answer options and mark at least one correct option.",
      );
    const text = event.currentTarget.questionText.value.trim();
    setBusy(true);
    try {
      const selectedCourse = scopedCourses.find((item) => item.code === course);
      const selectedSubject = selectedSubjects.find(
        (item) => item.name === subject,
      );
      await saveQuestionRecord({
        id: existing?.id,
        preview: text,
        text,
        course,
        courseId: selectedCourse?.id,
        subject,
        subjectId:
          selectedSubject?.courseRowIds?.[
            selectedSubject.courses.indexOf(course)
          ] ?? selectedSubject?.id,
        module: selectedModule.name.split(" · ")[0],
        moduleId: selectedModule.id,
        competencyUnit: selectedUnit.name.split(" · ")[0],
        competencyUnitId: selectedUnit.id,
        element: selectedElement.name,
        elementId: selectedElement.id,
        marks: Number(event.currentTarget.marks.value),
        type,
        status: event.currentTarget.status.value,
        options:
          type === "Descriptive"
            ? []
            : options.map((option) => option.text.trim()),
        correctOptionIds:
          type === "Descriptive"
            ? []
            : options
                .filter((option) => option.correct)
                .map((option) => String(options.indexOf(option))),
      });
      toast.success(`Question ${isEditing ? "updated" : "created"}`, {
        description:
          "The saved Question Bank record is immediately available to the demonstration examination workflow.",
      });
      navigate("/admin/questions");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader
        eyebrow="Question record editor"
        title={isEditing ? "Edit question" : "Add question"}
        description="Question content and answer keys remain inside authorized administration. Students never receive correct-answer data."
        action={
          <Button
            variant="outline"
            onClick={() => navigate("/admin/questions")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to bank
          </Button>
        }
      />
      <form onSubmit={submit} className="space-y-5">
        <RecordCard className="p-5 md:p-7">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#72827e]">
            1. Curriculum context
          </p>
          <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-5">
            <Field label="Course" required>
              <Select
                value={course}
                onChange={(event) => setCourse(event.target.value)}
              >
                {scopedCourses.map((item) => (
                  <option key={item.id} value={item.code}>
                    {item.code}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Subject" required>
              <Select
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
              >
                {selectedSubjects.map((item) => (
                  <option key={item.id} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Module" required>
              <Select
                value={moduleId || selectedModule?.id || ""}
                onChange={(event) => setModuleId(event.target.value)}
              >
                {selectedModules.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Competency unit" required>
              <Select
                value={cuId || selectedUnit?.id || ""}
                onChange={(event) => setCuId(event.target.value)}
              >
                {selectedUnits.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Element" required>
              <Select
                value={elementId || selectedElement?.id || ""}
                onChange={(event) => setElementId(event.target.value)}
              >
                {selectedElements.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </RecordCard>
        <RecordCard className="p-5 md:p-7">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#72827e]">
            2. Question and options
          </p>
          <div className="mt-5 grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
            <Field label="Question text" required>
              <Textarea
                name="questionText"
                defaultValue={existing?.text ?? ""}
                placeholder="Write the complete question shown to a student."
                className="min-h-32"
                required
              />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Question type" required>
                <Select
                  value={type}
                  onChange={(event) => setType(event.target.value)}
                >
                  <option>Single Correct</option>
                  <option>Multiple Correct</option>
                  <option>Descriptive</option>
                </Select>
              </Field>
              <Field label="Marks" required>
                <Input
                  name="marks"
                  type="number"
                  min="1"
                  defaultValue={String(existing?.marks ?? 1)}
                  required
                />
              </Field>
              <Field label="Status">
                <Select
                  name="status"
                  defaultValue={existing?.status ?? "Active"}
                >
                  <option>Active</option>
                  <option>Inactive</option>
                </Select>
              </Field>
            </div>
          </div>
          {type !== "Descriptive" ? (
            <div className="mt-6">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#254640]">
                    Answer options
                  </p>
                  <p className="mt-1 text-xs text-[#71817c]">
                    {type === "Single Correct"
                      ? "Select exactly one correct answer."
                      : "Select every correct answer."}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setOptions((current) => [
                      ...current,
                      { id: crypto.randomUUID(), text: "", correct: false },
                    ])
                  }
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Add option
                </Button>
              </div>
              <div className="space-y-3">
                {options.map((option, index) => (
                  <div
                    key={option.id}
                    className="flex items-center gap-3 rounded-lg border border-[#e0e7e1] bg-[#fbfcfa] p-3"
                  >
                    <button
                      type="button"
                      onClick={() => toggleCorrect(option.id)}
                      aria-label={`Mark option ${index + 1} correct`}
                      className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${option.correct ? "border-[#0e5a4f] bg-[#0e5a4f] text-white" : "border-[#b4c4bd] bg-white text-transparent"}`}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </button>
                    <Input
                      value={option.text}
                      onChange={(event) =>
                        updateOption(option.id, { text: event.target.value })
                      }
                      placeholder={`Option ${index + 1}`}
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={options.length <= 2}
                      onClick={() =>
                        setOptions((current) =>
                          current.filter((item) => item.id !== option.id),
                        )
                      }
                      className="text-[#778883] hover:text-rose-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-6 rounded-lg border border-[#cfe1d6] bg-[#f5fbf7] p-4 text-sm leading-6 text-[#47635b]">
              Descriptive questions do not require answer options. They are
              eligible only for the administrator-generated monthly printable
              paper.
            </p>
          )}
          <div className="mt-7 flex justify-end gap-3 border-t border-[#e7ece7] pt-5">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/admin/questions")}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy}
              className="bg-[#0e5a4f] hover:bg-[#0a4a40]"
            >
              <Save className="mr-2 h-4 w-4" />
              {busy
                ? "Saving…"
                : isEditing
                  ? "Save changes"
                  : "Create question"}
            </Button>
          </div>
        </RecordCard>
      </form>
    </>
  );
}

function QuestionDetailPage() {
  const [, params] = useRoute("/admin/questions/:id");
  const { session } = useAuth();
  const questions = useQuestionRecords();
  const question = questions.find((record) => record.id === params?.id);
  if (!question || !hasCourseScope(session, question.course))
    return (
      <>
        <PageHeader
          eyebrow="Restricted question"
          title="Question unavailable"
          description="This question belongs to a course outside your assigned scope."
        />
        <RecordCard className="p-6">
          <p className="text-sm text-[#536b64]">
            Return to your Question Bank to manage only authorized records.
          </p>
        </RecordCard>
      </>
    );
  return (
    <>
      <PageHeader
        eyebrow="Sensitive administrative record"
        title="Question details"
        description="Correct-answer indicators are displayed only in this authorized administration context."
        action={
          <div className="flex gap-2">
            <Link
              href="/admin/questions"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#d5ddd6] bg-white px-4 text-sm font-semibold text-[#294942]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
            <Link
              href={`/admin/questions/${question.id}/edit`}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0e5a4f] px-4 text-sm font-semibold text-white"
            >
              <FileText className="h-4 w-4" />
              Edit question
            </Link>
          </div>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[1.4fr_0.8fr]">
        <RecordCard className="p-6">
          <div className="flex items-center justify-between gap-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#72827e]">
              Question content
            </p>
            <StatusBadge value={question.status} />
          </div>
          <p className="mt-5 font-serif text-2xl font-semibold leading-9 text-[#1c413b]">
            {String(question.text)}
          </p>
          {question.type === "Descriptive" ? (
            <p className="mt-6 rounded-lg border border-[#cfe1d6] bg-[#f5fbf7] p-4 text-sm text-[#48645c]">
              This is a descriptive monthly-paper question. It has no predefined
              correct option.
            </p>
          ) : (
            <div className="mt-7 space-y-3">
              {question.options.map((option, index) => (
                <div
                  key={option}
                  className={`flex items-center gap-3 rounded-lg border p-4 ${question.correctOptionIds.includes(`${index}`) ? "border-emerald-300 bg-emerald-50" : "border-[#e2e8e2] bg-white"}`}
                >
                  <span
                    className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${question.correctOptionIds.includes(`${index}`) ? "bg-[#0e5a4f] text-white" : "bg-[#eef2ee] text-[#587069]"}`}
                  >
                    {String.fromCharCode(65 + index)}
                  </span>
                  <span className="flex-1 text-sm font-medium text-[#2a4842]">
                    {option}
                  </span>
                  {question.correctOptionIds.includes(`${index}`) && (
                    <span className="text-xs font-bold text-emerald-800">
                      Correct answer
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </RecordCard>
        <RecordCard className="p-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#72827e]">
            Classification
          </p>
          <dl className="mt-5 space-y-4">
            {[
              ["Course", question.course],
              ["Subject", question.subject],
              ["Module", question.module],
              ["Competency unit", question.competencyUnit],
              ["Element", question.element],
              ["Question type", question.type],
              ["Marks", question.marks],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="flex justify-between gap-4 border-b border-[#edf1ed] pb-3 text-sm"
              >
                <dt className="text-[#73827e]">{label}</dt>
                <dd className="text-right font-semibold text-[#27473f]">
                  {String(value)}
                </dd>
              </div>
            ))}
          </dl>
        </RecordCard>
      </div>
    </>
  );
}

export {
  QuestionDetailPage,
  QuestionFormPage,
  QuestionImportDetailPage,
  QuestionImportHistoryPage,
  QuestionImportPage,
  QuestionListPage,
};
