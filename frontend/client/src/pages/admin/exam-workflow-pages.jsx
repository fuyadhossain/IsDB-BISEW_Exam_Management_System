/** Examination ledger style: course-scoped batch sets, clear lifecycle states, and distinct online/offline delivery. */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import {
  ArrowLeft,
  ChevronDown,
  CirclePlay,
  CircleStop,
  Clock3,
  FileText,
  Plus,
  Printer,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { normalizeApiError } from "@/services/api-client";
import { useAuth } from "@/contexts/AuthContext";
import { scopeRecords } from "@/lib/course-scope";
import {
  academicUpdateEvent,
  getAcademicLoadProgress,
  getAcademicRecords,
  isAcademicRecordsLoaded,
} from "@/lib/academic-demo-store";
import {
  availableNumbers,
  buildOfflinePaper,
  changeExamStatus,
  publishExam,
  createExamSet,
  fetchExamForEdit,
  getExam,
  getExamLoadProgress,
  getExamRecords,
  getExamSet,
  isExamRecordsLoaded,
  saveExam,
  updateEvent,
  updateExamSet,
} from "@/lib/exam-demo-store";
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
import { formatClock } from "@/lib/exam-schedule";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
/**
 * Publish (and other lifecycle actions) failing with 422 is Laravel
 * rejecting the request — e.g. DistributionService::assertAvailable()
 * saying there aren't enough eligible questions for a configured
 * competency unit — and it puts the actual reason in
 * response.data.data.errors, keyed by field (e.g. "availability").
 * Every catch block here was doing `toast.error(error.message)`, which on
 * an Axios error is just the generic "Request failed with status code
 * 422" — never the real reason from the server. This pulls the specific
 * message(s) out instead, falling back to normalizeApiError's message
 * for non-validation errors.
 */
const describeApiError = (error) => {
  const normalized = normalizeApiError(error);
  const fieldMessages = Object.values(normalized.errors ?? {}).flat();
  return fieldMessages.length ? fieldMessages.join(" ") : normalized.message;
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
const deliveryLabel = (mode) =>
  mode === "ONLINE" ? "Online dynamic" : "Offline printable";
const setName = (type) => (type === "MID_MONTHLY" ? "Mid Monthly" : "Monthly");
const remainingLabel = (exam) => {
  const start = new Date(exam?.startDate).getTime();
  const end = new Date(exam?.endDate).getTime();
  const now = Date.now();
  if (exam?.status === "Running" && Number.isFinite(end))
    return Math.max(0, end - now) > 0
      ? formatClock(Math.ceil((end - now) / 1000))
      : "00:00";
  if (
    ["Ready", "Scheduled", "Available"].includes(exam?.status) &&
    Number.isFinite(start) &&
    start > now
  )
    return `Starts in ${formatClock(Math.ceil((start - now) / 1000))}`;
  if (exam?.status === "Completed" || (Number.isFinite(end) && end <= now))
    return "Ended";
  return "—";
};
const toDateTimeLocalSeconds = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};
const useExamRecords = () => {
  const [records, setRecords] = useState(() => getExamRecords());
  useEffect(() => {
    const refresh = () => setRecords(getExamRecords());
    const timer = window.setInterval(refresh, 1000);
    window.addEventListener(updateEvent, refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(updateEvent, refresh);
    };
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
// Mirrors useAcademicRecordsLoading() in management-pages.jsx: apiCache
// (behind isExamRecordsLoaded/isAcademicRecordsLoaded) stays unset until
// the first real fetch resolves, so without this flag the exam/exam-set
// list pages can't tell "still loading" apart from "genuinely empty" and
// briefly show the empty-table state on every mount. Exam sets and exams
// depend on both stores (batches/courses/rounds come from academic), so
// this only reports "loaded" once neither source is still pending.
//
// `percent` is a genuine combined progress readout, not a simulated
// animation: getExamLoadProgress()/getAcademicLoadProgress() report how
// many of the sequential per-slice requests (see fetchSlices() in
// academic-demo-store.js and refreshFromApi() in exam-demo-store.js) have
// actually resolved so far, out of the real total for this load. Both
// stores dispatch their update event after each step, so this recomputes
// live as each request lands. It's null (nothing to show) once nothing is
// loading, or before either store has started reporting a total.
const useExamWorkflowLoading = () => {
  const stillLoading = () => !isExamRecordsLoaded() || !isAcademicRecordsLoaded();
  const computeProgress = () => {
    const exam = getExamLoadProgress();
    const academic = getAcademicLoadProgress();
    const total = exam.total + academic.total;
    if (!total) return null;
    const done = exam.done + academic.done;
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
    window.addEventListener(updateEvent, check);
    window.addEventListener(academicUpdateEvent, check);
    return () => {
      window.removeEventListener(updateEvent, check);
      window.removeEventListener(academicUpdateEvent, check);
    };
  }, [loading]);
  return { loading, percent };
};
// Small reusable progress bar for the loading cards below. `percent` is
// null until either store has reported a real total (see
// useExamWorkflowLoading above) — in that brief window we show the bar
// without a number rather than a misleading "0%".
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
// Offline print cover page — first page of the printed paper. Every field
// here comes from the exam's own existing data (course/round parsed from
// the batch code, module from the exam's configured question plan, marks/
// duration/date/time from the exam record itself). Trainee Name/Trainee ID
// are left blank for hand-write, matching how these fixed monthly papers
// are actually distributed to a batch and filled in by each student; Batch
// ID is filled in since it is the same for the whole batch/paper.
const parseRoundFromBatchCode = (batchCode) => {
  // Batch display codes follow COURSE/SHIFT-TSP/ROUND/NUMBER, e.g.
  // "PWAD/CCSL-M/71/01" -> round segment is "71".
  const parts = String(batchCode ?? "").split("/");
  return parts.length >= 3 ? parts[2] : "";
};
const formatCoverDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "________";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
};
const formatCoverTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "________";
  const pad = (n) => String(n).padStart(2, "0");
  const hours24 = date.getHours();
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${pad(hours12)}:${pad(date.getMinutes())} ${period}`;
};
const OfflinePrintCoverPage = ({ exam, moduleNames }) => {
  const round = parseRoundFromBatchCode(exam.batch);
  const moduleLabel = moduleNames?.length ? moduleNames.join(", ") : "—";
  return (
    <section className="print-only-cover-page">
      {/* max-w-2xl kept this readable as a centered card everywhere it was
          reused, but for the actual printed cover page it left roughly a
          third of each A4 side blank — the "boxed in the middle of the
          sheet" look. print:max-w-none only widens it for the print
          stylesheet (@page already sets the real page margins in
          index.css), so this component's own on-screen usage elsewhere,
          if any, is unaffected. */}
      <div className="mx-auto max-w-2xl p-8 text-[#1d3d37] print:max-w-none print:p-0">
        <header className="border-b-2 border-[#1d3d37] pb-3 text-center">
          <img
            src="/isdb-bisew-logo.png"
            alt="IsDB-BISEW logo"
            className="mx-auto mb-2 h-20 w-auto"
          />
          <h1 className="font-serif text-2xl font-bold">
            IsDB-BISEW IT Scholarship Programme
          </h1>
          <p className="mt-1 text-lg font-semibold">
            {round ? `Round-${round}` : "Round-__"}
          </p>
          <p className="mt-1 text-base">Course: {exam.course ?? "________"}</p>
        </header>
        <table className="mt-4 w-full border-collapse border border-[#1d3d37] text-sm">
          <tbody>
            <tr>
              <td
                rowSpan={4}
                className="w-1/2 border border-[#1d3d37] p-2 align-top font-semibold"
              >
                {exam.setType === "MID_MONTHLY"
                  ? "Mid Monthly Test"
                  : "Monthly External Test"}
                <br />
                Exam #{String(exam.number ?? "").padStart(2, "0")}
              </td>
              <td className="border border-[#1d3d37] p-2">
                Module: {moduleLabel}
              </td>
            </tr>
            <tr>
              <td className="border border-[#1d3d37] p-2">
                Full Marks: {exam.totalMarks ?? 50}
              </td>
            </tr>
            <tr>
              <td className="border border-[#1d3d37] p-2">
                Duration: {exam.duration ?? "—"} minutes
              </td>
            </tr>
            <tr>
              <td className="border border-[#1d3d37] p-2">
                Date: {formatCoverDate(exam.startDate)} &nbsp; Time:{" "}
                {formatCoverTime(exam.startDate)}
              </td>
            </tr>
          </tbody>
        </table>
        <table className="mt-4 w-full border-collapse border border-[#1d3d37] text-sm">
          <tbody>
            <tr>
              <td className="border border-[#1d3d37] p-2 font-semibold">
                Trainee Name: ________________________________
              </td>
            </tr>
            <tr>
              <td className="border border-[#1d3d37] p-2 font-semibold">
                Trainee ID: ________________ &nbsp;&nbsp; Batch ID:{" "}
                {exam.batch ?? "________"}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="mt-4 text-sm font-semibold">For official use only</p>
        <table className="mt-1 w-full border-collapse border border-[#1d3d37] text-sm">
          <tbody>
            <tr>
              <td rowSpan={2} className="w-1/2 border border-[#1d3d37] p-2">
                Invigilator: ________________
              </td>
              <td className="border border-[#1d3d37] p-2">
                Marks Obtained: ________
              </td>
            </tr>
            <tr>
              <td className="border border-[#1d3d37] p-2">&nbsp;</td>
            </tr>
            <tr>
              <td colSpan={2} className="border border-[#1d3d37] p-2">
                Assessor: ________________
              </td>
            </tr>
          </tbody>
        </table>
        <div className="mt-5 text-sm leading-6">
          <p className="font-semibold">Instructions:</p>
          <ul className="list-disc pl-6">
            <li>Answer all the questions.</li>
            <li>Each question of particular section carries equal marks.</li>
            <li>CIRCLE the correct answer(s) for the MCQs.</li>
          </ul>
        </div>
      </div>
    </section>
  );
};
const OfflineQuestionList = ({ paper, className = "" }) => (
  <div className={`space-y-5 text-sm text-[#405a53] ${className}`}>
    {paper.mcq.map((question) => (
      <article key={question.id} className="border-b border-[#e5ebe5] pb-4">
        <p className="font-semibold">
          {question.no}. {question.text}
        </p>
        <ol className="mt-2 grid gap-1 pl-5 text-[#61746e]">
          {question.options.map((option, index) => (
            <li key={`${question.id}-${option}`} className="list-[upper-alpha]">
              {option}
            </li>
          ))}
        </ol>
      </article>
    ))}
    {paper.descriptive.map((question) => (
      <article key={question.id} className="border-b border-[#e5ebe5] pb-4">
        <p className="font-semibold">
          {question.no}. {question.text}
        </p>
        <div className="mt-3 space-y-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={`${question.id}-line-${index}`}
              className="h-6 border-b border-dashed border-[#aebdb7]"
            />
          ))}
        </div>
      </article>
    ))}
  </div>
);
const examColumns = (refresh, busyId, setBusyId) => [
  { key: "number", label: "Exam no." },
  {
    key: "title",
    label: "Title",
    render: (record) => (
      <Link
        href={`/admin/exams/${record.id}`}
        className="font-semibold text-[#24443e] hover:underline"
      >
        {record.title}
      </Link>
    ),
  },
  { key: "batch", label: "Batch" },
  {
    key: "deliveryMode",
    label: "Delivery",
    render: (record) => deliveryLabel(record.deliveryMode),
  },
  {
    key: "timeRemaining",
    label: "Time remaining",
    render: (record) => (
      <span
        className={`inline-flex items-center gap-1.5 font-mono text-xs font-bold tabular-nums ${record.status === "Running" ? "text-[#0e5a4f]" : "text-[#71817c]"}`}
      >
        <Clock3 className="h-3.5 w-3.5" />
        {remainingLabel(record)}
      </span>
    ),
  },
  {
    key: "status",
    label: "Status",
    render: (record) => <StatusBadge value={record.status} />,
  },
  {
    key: "actions",
    label: "Manual control",
    render: (record) => {
      const busy = busyId === record.id;
      const runAction = async (action) => {
        if (busyId) return;
        setBusyId(record.id);
        try {
          await action();
        } catch (error) {
          toast.error(describeApiError(error));
        } finally {
          setBusyId(null);
        }
      };
      return (
        <div className="flex flex-wrap items-center gap-2">
          {(record.status === "Draft" || record.status === "Scheduled") && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                runAction(async () => {
                  await publishExam(record.id);
                  refresh();
                  toast.success(
                    "Exam published. It is now Ready and visible to students.",
                  );
                })
              }
            >
              <CirclePlay className="mr-1 h-3.5 w-3.5" />
              {busy ? "Publishing…" : "Publish"}
            </Button>
          )}
          {record.deliveryMode === "ONLINE" && record.status === "Ready" && (
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                runAction(async () => {
                  await changeExamStatus(record.id, "START");
                  refresh();
                  toast.success("Exam is now Running.");
                })
              }
            >
              <CirclePlay className="mr-1 h-3.5 w-3.5" />
              {busy ? "Starting…" : "Start"}
            </Button>
          )}
          {record.deliveryMode === "ONLINE" && record.status === "Running" && (
            <Button
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() =>
                runAction(async () => {
                  await changeExamStatus(record.id, "STOP");
                  refresh();
                  toast.success("Exam is now Completed.");
                })
              }
            >
              <CircleStop className="mr-1 h-3.5 w-3.5" />
              {busy ? "Stopping…" : "Stop"}
            </Button>
          )}
          {record.deliveryMode === "OFFLINE" && (
            <Link
              href={`/admin/exams/${record.id}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#e8f3ed] px-3 text-xs font-bold text-[#0e5a4f] transition hover:bg-[#d9ece2]"
            >
              <Printer className="h-3.5 w-3.5" />
              Print Questions
            </Link>
          )}
          <Link
            href={`/admin/exams/${record.id}/edit`}
            className="inline-flex h-8 items-center rounded-md bg-[#e8f3ed] px-3 text-xs font-bold text-[#0e5a4f] transition hover:bg-[#d9ece2]"
          >
            Edit
          </Link>
        </div>
      );
    },
  },
];

/**
 * Exam sets/exams reference a single batch (or "all batches" of a course),
 * not a round directly. A round covers many batches across courses, so
 * matching against a selected round means: this record's batch is in that
 * round, or (for "all batches" coverage) at least one batch of its course is.
 */
const matchesRound = (record, round, batches) => {
  if (round === "all") return true;
  if (record.allBatches)
    return batches.some(
      (batch) => batch.course === record.course && batch.round === round,
    );
  return batches.find((batch) => batch.id === record.batchId)?.round === round;
};

function ExamSetListPage() {
  const { session } = useAuth();
  const { examSets } = useExamRecords();
  const academic = useAcademicRecords();
  const { loading, percent } = useExamWorkflowLoading();
  const [round, setRound] = useState("all");
  const items = scopeRecords("exam-sets", examSets, session).filter((record) =>
    matchesRound(record, round, academic.batches),
  );
  return (
    <>
      <PageHeader
        eyebrow="Examination configuration"
        title="Exam sets"
        description="Create and edit Mid Monthly online or Monthly offline sets for one batch or all batches in a course."
        action={
          <PrimaryLink href="/admin/exam-sets/create">Add exam set</PrimaryLink>
        }
      />
      <FilterBand onClear={() => setRound("all")}>
        <FilterField label="Round">
          <Select
            value={round}
            onChange={(event) => setRound(event.target.value)}
          >
            <option value="all">All rounds</option>
            {academic.rounds.map((item) => (
              <option key={item.id} value={item.code}>
                {item.code} · {item.name}
              </option>
            ))}
          </Select>
        </FilterField>
      </FilterBand>
      <DataTable
        records={items}
        rowLabel="exam sets"
        empty={
          loading ? (
            <RecordCard className="border-dashed p-8 text-center">
              <p className="font-semibold text-[#295148]">
                Loading exam sets…
              </p>
              <p className="mt-2 text-sm text-[#6c7d78]">
                Fetching the latest exam sets and batch coverage.
              </p>
              <LoadingProgressBar percent={percent} />
            </RecordCard>
          ) : undefined
        }
        columns={[
          {
            key: "name",
            label: "Exam set",
            render: (record) => (
              <Link
                href={`/admin/exam-sets/${record.id}`}
                className="font-semibold text-[#24443e] hover:underline"
              >
                {record.name}
              </Link>
            ),
          },
          { key: "course", label: "Course" },
          {
            key: "batch",
            label: "Batch coverage",
            render: (record) =>
              record.allBatches ? "All batches" : record.batch,
          },
          {
            key: "setType",
            label: "Set type",
            render: (record) => setName(record.setType),
          },
          {
            key: "deliveryMode",
            label: "Exam type",
            render: (record) => deliveryLabel(record.deliveryMode),
          },
          {
            key: "status",
            label: "Status",
            render: (record) => <StatusBadge value={record.status} />,
          },
          {
            key: "actions",
            label: "Actions",
            render: (record) => (
              <Link
                href={`/admin/exam-sets/${record.id}/edit`}
                className="inline-flex items-center rounded-md bg-[#e8f3ed] px-2.5 py-1.5 text-xs font-bold text-[#0e5a4f] transition hover:bg-[#d9ece2]"
              >
                Edit
              </Link>
            ),
          },
        ]}
      />
    </>
  );
}

function ExamSetFormPage() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/admin/exam-sets/:id/edit");
  const { session } = useAuth();
  const records = useExamRecords();
  const academic = useAcademicRecords();
  const existing = params?.id
    ? records.examSets.find((item) => item.id === params.id)
    : null;
  const allowedCourses = scopeRecords("courses", academic.courses, session);
  const [course, setCourse] = useState(
    existing?.course ?? allowedCourses[0]?.code ?? "",
  );
  const existingRound = existing?.batchId
    ? academic.batches.find((batch) => batch.id === existing.batchId)?.round
    : "";
  const [round, setRound] = useState(existingRound ?? "");
  const [coverage, setCoverage] = useState(
    existing?.allBatches ? "ALL_BATCHES" : (existing?.batchId ?? ""),
  );
  const [setType, setSetType] = useState(existing?.setType ?? "MID_MONTHLY");
  // Round is selected before Batch: without knowing the round first, the correct batch
  // cannot be found, since the same course can have batches across several rounds.
  const roundScopedBatches = scopeRecords(
    "batches",
    academic.batches,
    session,
  ).filter((batch) => batch.course === course);
  const roundOptions = useMemo(
    () =>
      Array.from(
        new Set(roundScopedBatches.map((batch) => batch.round).filter(Boolean)),
      ).sort(),
    [roundScopedBatches],
  );
  const scopedBatches = roundScopedBatches.filter(
    (batch) => !round || batch.round === round,
  );
  const deliveryMode = setType === "MID_MONTHLY" ? "ONLINE" : "OFFLINE";
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const allBatches = coverage === "ALL_BATCHES";
    const batch = scopedBatches.find((item) => item.id === coverage);
    const codeScope = allBatches ? course : (batch?.identifier ?? course);
    const payload = {
      name: setName(setType),
      course,
      batch: allBatches ? "All batches" : batch?.identifier,
      batchId: allBatches ? null : batch?.id,
      allBatches,
      setType,
      deliveryMode,
      status: form.get("status"),
      // The exam_sets.code column had no source anywhere in this form, so it
      // was always left NULL. Derive a stable, readable code instead.
      code: `${setType}/${codeScope}`
        .toUpperCase()
        .replace(/\s+/g, "")
        .slice(0, 100),
    };
    try {
      const saved = existing
        ? await updateExamSet(existing.id, payload)
        : await createExamSet(payload);
      toast.success(existing ? "Exam set updated" : "Exam set created", {
        description: `${saved.name} is configured as ${deliveryLabel(saved.deliveryMode)}.`,
      });
      navigate("/admin/exam-sets");
    } catch (error) {
      toast.error(describeApiError(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader
        eyebrow="Examination configuration"
        title={existing ? "Edit exam set" : "Create exam set"}
        description="Mid Monthly sets use online dynamic delivery. Monthly sets use the administrator-only printable paper."
        action={
          <Button
            variant="outline"
            onClick={() => navigate("/admin/exam-sets")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        }
      />
      <RecordCard>
        <form className="p-6" onSubmit={submit}>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Course" required>
              <Select
                value={course}
                onChange={(event) => {
                  setCourse(event.target.value);
                  setRound("");
                  setCoverage("ALL_BATCHES");
                }}
              >
                {allowedCourses.map((item) => (
                  <option key={item.id} value={item.code}>
                    {item.code} · {item.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Round" required>
              <Select
                value={round}
                onChange={(event) => {
                  setRound(event.target.value);
                  setCoverage("ALL_BATCHES");
                }}
              >
                <option value="" disabled>
                  Select a round
                </option>
                {roundOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Batch" required>
              <Select
                value={coverage}
                disabled={!round}
                onChange={(event) => setCoverage(event.target.value)}
              >
                <option value="ALL_BATCHES">All batches</option>
                {scopedBatches.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.identifier}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Exam set name" required>
              <Select
                value={setType}
                onChange={(event) => setSetType(event.target.value)}
              >
                <option value="MID_MONTHLY">Mid Monthly</option>
                <option value="MONTHLY">Monthly</option>
              </Select>
              <p className="text-xs text-[#70817b]">
                Exam type: {deliveryLabel(deliveryMode)}
              </p>
            </Field>
            <Field label="Availability status">
              <Select
                name="status"
                defaultValue={existing?.status ?? "Available"}
              >
                <option>Available</option>
                <option>Scheduled</option>
                <option>Ready</option>
              </Select>
              <p className="text-xs text-[#70817b]">
                You may edit availability before creating an exam.
              </p>
            </Field>
          </div>
          <div className="mt-7 flex justify-end gap-3 border-t border-[#e6ece6] pt-5">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/admin/exam-sets")}
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
                : existing
                  ? "Save exam set"
                  : "Create exam set"}
            </Button>
          </div>
        </form>
      </RecordCard>
    </>
  );
}

function ExamSetDetailPage() {
  const [, params] = useRoute("/admin/exam-sets/:id");
  const [, navigate] = useLocation();
  const { exams } = useExamRecords();
  const { loading, percent } = useExamWorkflowLoading();
  const [busyId, setBusyId] = useState(null);
  const set = getExamSet(params?.id);
  // getExamSet() reads from the same apiCache-backed getExamRecords(), so
  // while the first fetch is still in flight `set` is legitimately
  // undefined even for a real id — this used to render "Exam set
  // unavailable" for every direct/cold navigation here, indistinguishable
  // from the id genuinely not existing. Only treat it as unavailable once
  // loading has actually finished.
  if (!set) {
    if (loading) {
      return (
        <RecordCard className="border-dashed p-8 text-center">
          <p className="font-semibold text-[#295148]">
            Loading exam set…
          </p>
          <p className="mt-2 text-sm text-[#6c7d78]">
            Fetching this exam set's details.
          </p>
          <LoadingProgressBar percent={percent} />
        </RecordCard>
      );
    }
    return <PageHeader title="Exam set unavailable" />;
  }
  const items = exams.filter((exam) => exam.examSetId === set.id);
  return (
    <>
      <PageHeader
        eyebrow="Examination configuration"
        title={set.name}
        description={`${set.course} · ${set.allBatches ? "All batches" : set.batch} · ${deliveryLabel(set.deliveryMode)}`}
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => navigate(`/admin/exam-sets/${set.id}/edit`)}
            >
              Edit set
            </Button>
            <PrimaryLink href="/admin/exams/create">Create exam</PrimaryLink>
          </div>
        }
      />
      <DataTable
        records={items}
        rowLabel="exams"
        empty={
          loading ? (
            <RecordCard className="border-dashed p-8 text-center">
              <p className="font-semibold text-[#295148]">
                Loading exams…
              </p>
              <p className="mt-2 text-sm text-[#6c7d78]">
                Fetching exams created for this set.
              </p>
              <LoadingProgressBar percent={percent} />
            </RecordCard>
          ) : undefined
        }
        columns={examColumns(
          () => window.dispatchEvent(new CustomEvent(updateEvent)),
          busyId,
          setBusyId,
        )}
      />
    </>
  );
}

function ExamListPage() {
  const { session } = useAuth();
  const { exams } = useExamRecords();
  const academic = useAcademicRecords();
  const { loading, percent } = useExamWorkflowLoading();
  const [status, setStatus] = useState("all");
  const [round, setRound] = useState("all");
  const [, rerender] = useState(0);
  const [busyId, setBusyId] = useState(null);
  const records = scopeRecords("exams", exams, session).filter(
    (exam) =>
      (status === "all" || exam.status === status) &&
      matchesRound(exam, round, academic.batches),
  );
  return (
    <>
      <PageHeader
        eyebrow="Examination operation"
        title="Exams"
        description="Only Ready exams can start manually; only Running exams can stop manually. The demonstration also reconciles scheduled start and close times."
        action={
          <PrimaryLink href="/admin/exams/create">Create exam</PrimaryLink>
        }
      />
      <FilterBand
        onClear={() => {
          setStatus("all");
          setRound("all");
        }}
      >
        <FilterField label="Exam status">
          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">All statuses</option>
            <option>Available</option>
            <option>Scheduled</option>
            <option>Ready</option>
            <option>Running</option>
            <option>Completed</option>
          </Select>
        </FilterField>
        <FilterField label="Round">
          <Select
            value={round}
            onChange={(event) => setRound(event.target.value)}
          >
            <option value="all">All rounds</option>
            {academic.rounds.map((item) => (
              <option key={item.id} value={item.code}>
                {item.code} · {item.name}
              </option>
            ))}
          </Select>
        </FilterField>
      </FilterBand>
      <DataTable
        records={records}
        rowLabel="exams"
        empty={
          loading ? (
            <RecordCard className="border-dashed p-8 text-center">
              <p className="font-semibold text-[#295148]">Loading exams…</p>
              <p className="mt-2 text-sm text-[#6c7d78]">
                Fetching the latest exams and their lifecycle status.
              </p>
              <LoadingProgressBar percent={percent} />
            </RecordCard>
          ) : undefined
        }
        columns={examColumns(
          () => rerender((value) => value + 1),
          busyId,
          setBusyId,
        )}
      />
    </>
  );
}

// One "Module distribution" card per added module: a Module select, a
// stacked (not side-by-side) list of competency-unit checkboxes, and a
// single total-questions field for the whole module.
const ModuleDistributionBlock = ({
  index,
  moduleRow,
  details,
  groupedModules,
  otherSelectedModuleNames,
  onChangeModule,
  toggleUnit,
  setTotalQuestions,
  removeModule,
  canRemove,
}) => {
  const checkedCount = moduleRow.unitIds.length;
  const [pickerOpen, setPickerOpen] = useState(false);
  const selectableModules = groupedModules.filter(
    (group) =>
      group.name === moduleRow.moduleName ||
      !otherSelectedModuleNames.includes(group.name),
  );
  const moduleOptionLabel = (group) =>
    group.subjects.length
      ? `${group.name} - ${group.subjects.join(", ")}`
      : group.name;
  const selectedGroup = groupedModules.find(
    (group) => group.name === moduleRow.moduleName,
  );
  return (
    <div className="rounded-xl border border-[#dce8df] bg-[#fbfdfb] p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#0e5a4f] text-xs font-bold text-white">
            {index + 1}
          </span>
          <div>
            <p className="text-sm font-bold text-[#1b413a]">
              Module distribution
            </p>
            <p className="text-xs text-[#6e7f7a]">
              {checkedCount} competency unit{checkedCount === 1 ? "" : "s"}{" "}
              selected
            </p>
          </div>
        </div>
        {canRemove && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => removeModule(moduleRow.id)}
            className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800"
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Remove
          </Button>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-[1.1fr_1.4fr_0.8fr]">
        <Field label="Module" required>
          {/*
            A module's option label can be very long (module name plus
            every subject it belongs to, comma-separated), and a native
            <select>'s options can't wrap onto multiple lines — the text
            just overflows past the page edge instead. This is a small
            custom dropdown built from plain divs instead, so the label can
            wrap normally.
          */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setPickerOpen((open) => !open)}
              className="flex min-h-10 w-full items-center justify-between gap-2 rounded-md border border-[#d6ded7] bg-white px-3 py-2 text-left text-sm text-[#274a6b]"
            >
              <span className="whitespace-normal break-words">
                {selectedGroup
                  ? moduleOptionLabel(selectedGroup)
                  : "Select module"}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-[#6e7f7a]" />
            </button>
            {pickerOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setPickerOpen(false)}
                />
                <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-[#d6ded7] bg-white shadow-lg">
                  {selectableModules.map((group) => (
                    <button
                      key={group.name}
                      type="button"
                      onClick={() => {
                        onChangeModule(moduleRow.id, group.name);
                        setPickerOpen(false);
                      }}
                      className={`block w-full whitespace-normal break-words px-3 py-2 text-left text-sm ${
                        group.name === moduleRow.moduleName
                          ? "bg-[#0e5a4f] text-white"
                          : "text-[#274a6b] hover:bg-[#f2f7f4]"
                      }`}
                    >
                      {moduleOptionLabel(group)}
                    </button>
                  ))}
                  {!selectableModules.length && (
                    <p className="px-3 py-2 text-sm text-[#6e7f7a]">
                      No modules available.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </Field>
        <Field label="Competency units" required>
          <div className="space-y-2 rounded-md border border-[#d6ded7] bg-white p-3">
            {details.availableUnits.length === 0 && (
              <p className="text-sm text-[#6e7f7a]">
                No competency units for this module.
              </p>
            )}
            {details.availableUnits.map((unit) => (
              <label
                key={unit.id}
                className="flex items-center gap-2 text-sm text-[#37574f]"
              >
                <input
                  type="checkbox"
                  checked={moduleRow.unitIds.includes(unit.id)}
                  onChange={() => toggleUnit(moduleRow.id, unit.id)}
                  className="h-4 w-4 rounded border-[#c7d6cb] text-[#0e5a4f] focus:ring-[#0e5a4f]"
                />
                {unit.name}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Total questions for this module" required>
          <Input
            type="number"
            min="0"
            placeholder="Questions"
            value={moduleRow.totalQuestions}
            onChange={(event) =>
              setTotalQuestions(moduleRow.id, event.target.value)
            }
          />
        </Field>
      </div>
    </div>
  );
};

function ExamFormPage() {
  const [, params] = useRoute("/admin/exams/:id/edit");
  const isEditing = Boolean(params?.id);
  const [busy, setBusy] = useState(false);
  const [, navigate] = useLocation();
  const { session } = useAuth();
  const { examSets } = useExamRecords();
  const academic = useAcademicRecords();
  // getExam() only reads the admin exam LIST cache, which never carries
  // modules/competency_units (see fetchExamForEdit's comment in
  // exam-demo-store.js) — so every field driven by those (the module
  // rows below) rendered as if the exam had never been configured, even
  // though the data was saved. It also returns undefined on a direct,
  // cold navigation to the edit URL (before the list has ever been
  // fetched), and every field below is seeded once via a useState
  // initializer, so it silently stayed blank even after the list loaded.
  // Seed from the cache for an instant paint, then replace with the full
  // single-exam fetch (which does eager-load those relations) once it
  // resolves, and re-hydrate the fields below exactly once when that
  // happens.
  const [existing, setExisting] = useState(() =>
    isEditing ? getExam(params.id) : null,
  );
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!isEditing) return;
    fetchExamForEdit(params.id)
      .then((full) => {
        if (full) setExisting(full);
      })
      .catch(() =>
        toast.error("Could not load this exam's saved configuration."),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, params?.id]);
  const scopedSets = scopeRecords("exam-sets", examSets, session);
  const [setId, setSetId] = useState(
    existing?.examSetId ?? scopedSets[0]?.id ?? "",
  );
  const selectedSet = scopedSets.find((item) => item.id === setId);
  const numberOptions = availableNumbers(setId);
  const [number, setNumber] = useState(
    existing?.number ?? numberOptions.find((item) => !item.taken)?.number ?? "",
  );
  const defaultStartDateTime = () => {
    const d = new Date();
    d.setSeconds(0, 0);
    d.setMinutes(d.getMinutes() + 5); // a few minutes from now so it isn't immediately "ended"
    return d;
  };
  const [startDate, setStartDate] = useState(
    () =>
      toDateTimeLocalSeconds(existing?.startDate) ??
      toDateTimeLocalSeconds(defaultStartDateTime()),
  );
  const [duration, setDuration] = useState(() =>
    String(existing?.duration ?? 50),
  );
  const addMinutes = (dateTimeLocal, minutes) => {
    const base = dateTimeLocal ? new Date(dateTimeLocal) : new Date();
    if (!Number.isFinite(base.getTime())) return null;
    return toDateTimeLocalSeconds(
      new Date(base.getTime() + minutes * 60 * 1000),
    );
  };
  const [endDate, setEndDate] = useState(
    () =>
      toDateTimeLocalSeconds(existing?.endDate) ??
      addMinutes(startDate, Number(existing?.duration ?? 50)),
  );
  const endDateTouched = useRef(isEditing); // don't auto-recompute closing time while editing an existing exam
  useEffect(() => {
    if (endDateTouched.current) return;
    const durationMinutes = Number(duration);
    if (!startDate || !Number.isFinite(durationMinutes) || durationMinutes <= 0)
      return;
    const computed = addMinutes(startDate, durationMinutes);
    if (computed) setEndDate(computed);
  }, [startDate, duration]);
  const [status, setStatus] = useState(
    () =>
      existing?.status ??
      (selectedSet?.status === "Available"
        ? "Ready"
        : (selectedSet?.status ?? "Ready")),
  );
  // All modules offered for the selected exam set's course, grouped by
  // name — the same module name can exist under several subjects, and we
  // only want it to appear once in the dropdown, with its subjects listed.
  const courseModules = academic.modules.filter(
    (module) => module.course === selectedSet?.course,
  );
  const groupedModules = useMemo(() => {
    const byName = new Map();
    courseModules.forEach((module) => {
      const group = byName.get(module.name) ?? {
        name: module.name,
        moduleIds: [],
        subjects: [],
        moduleNumber: Number(module.moduleNumber) || null,
      };
      group.moduleIds.push(module.id);
      if (module.subject && !group.subjects.includes(module.subject))
        group.subjects.push(module.subject);
      if (group.moduleNumber === null)
        group.moduleNumber = Number(module.moduleNumber) || null;
      byName.set(module.name, group);
    });
    // Serial order: 1, 2, 3, ... by the module's own number; modules
    // without a number fall back to their name so the list stays stable.
    return Array.from(byName.values()).sort((a, b) => {
      if (a.moduleNumber !== null && b.moduleNumber !== null)
        return a.moduleNumber - b.moduleNumber;
      if (a.moduleNumber !== null) return -1;
      if (b.moduleNumber !== null) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [courseModules]);
  const unitsForModuleIds = (moduleIds) =>
    academic.competencyUnits.filter((unit) =>
      moduleIds.includes(unit.moduleId),
    );
  const toModuleRow = (item, index) => {
    const group = groupedModules.find(
      (candidate) => candidate.name === item?.module,
    );
    const units = unitsForModuleIds(group?.moduleIds ?? []);
    const unitIds = (item?.competencyUnits ?? [])
      .map((name) => units.find((unit) => unit.name === name)?.id)
      .filter(Boolean);
    return {
      id: `module-row-${index + 1}`,
      moduleName: group?.name ?? "",
      unitIds,
      totalQuestions: item?.questionNumber ?? "",
    };
  };
  const initialModuleRows = existing?.questionPlan?.length
    ? existing.questionPlan.map(toModuleRow)
    : [];
  const [moduleRows, setModuleRows] = useState(() => initialModuleRows);
  const [nextRowSeq, setNextRowSeq] = useState(() => initialModuleRows.length);
  // The very first render (cache miss on a cold direct navigation, or a
  // list-cache row with no questionPlan) can seed the fields above as
  // empty before the fetch in the effect above resolves. Once the full
  // exam arrives, re-apply every simple field it carries — but only the
  // first time, so it never overwrites something the admin has already
  // started typing.
  useEffect(() => {
    if (hydratedRef.current || !existing) return;
    hydratedRef.current = true;
    setSetId(existing.examSetId ?? "");
    setNumber(existing.number ?? "");
    const nextStart = toDateTimeLocalSeconds(existing.startDate);
    if (nextStart) setStartDate(nextStart);
    setDuration(String(existing.duration ?? 50));
    const nextEnd = toDateTimeLocalSeconds(existing.endDate);
    if (nextEnd) setEndDate(nextEnd);
    setStatus(existing.status ?? "Ready");
  }, [existing]);
  // Module rows need groupedModules, which only reflects the right course
  // once selectedSet has caught up to the setSetId call above — that
  // lands on the render *after* this effect runs, so mapping the plan in
  // the same effect (against the still-stale groupedModules) would
  // silently drop every row on a cold navigation. Wait for both to be
  // ready instead.
  const moduleRowsHydratedRef = useRef(false);
  useEffect(() => {
    if (
      moduleRowsHydratedRef.current ||
      !existing?.questionPlan?.length ||
      selectedSet?.course !== existing.course ||
      !groupedModules.length
    )
      return;
    moduleRowsHydratedRef.current = true;
    const rows = existing.questionPlan.map(toModuleRow);
    setModuleRows(rows);
    setNextRowSeq(rows.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing, selectedSet?.course, groupedModules]);
  // Drop rows whose module no longer exists for the newly selected course.
  useEffect(() => {
    const validNames = new Set(groupedModules.map((group) => group.name));
    setModuleRows((rows) =>
      rows.filter((row) => validNames.has(row.moduleName)),
    );
  }, [selectedSet?.course]);
  const addModuleRow = () => {
    setModuleRows((rows) => [
      ...rows,
      {
        id: `module-row-${Date.now()}-${nextRowSeq}`,
        moduleName: "",
        unitIds: [],
        totalQuestions: "",
      },
    ]);
    setNextRowSeq((seq) => seq + 1);
  };
  const onChangeModuleRowModule = (rowId, moduleName) =>
    setModuleRows((rows) =>
      rows.map((row) =>
        row.id === rowId ? { ...row, moduleName, unitIds: [] } : row,
      ),
    );
  const toggleModuleRowUnit = (rowId, unitId) =>
    setModuleRows((rows) =>
      rows.map((row) => {
        if (row.id !== rowId) return row;
        const unitIds = row.unitIds.includes(unitId)
          ? row.unitIds.filter((id) => id !== unitId)
          : [...row.unitIds, unitId];
        return { ...row, unitIds };
      }),
    );
  const setModuleRowTotalQuestions = (rowId, value) =>
    setModuleRows((rows) =>
      rows.map((row) =>
        row.id === rowId ? { ...row, totalQuestions: value } : row,
      ),
    );
  const removeModuleRow = (rowId) =>
    setModuleRows((rows) => rows.filter((row) => row.id !== rowId));
  const getModuleRowDetails = (row) => {
    const group = groupedModules.find(
      (candidate) => candidate.name === row.moduleName,
    );
    const availableUnits = unitsForModuleIds(group?.moduleIds ?? []);
    const subjectsLabel = group?.subjects.join(", ") ?? "";
    return { ...row, group, availableUnits, subjectsLabel };
  };
  const moduleIdToSubjectId = new Map(
    courseModules.map((module) => [module.id, module.subjectId]),
  );
  const moduleRowDetails = moduleRows.map(getModuleRowDetails);
  const resolvedPlans = moduleRowDetails
    .filter((row) => row.moduleName && row.unitIds.length && row.totalQuestions)
    .map((row) => {
      const checkedUnits = row.availableUnits.filter((unit) =>
        row.unitIds.includes(unit.id),
      );
      const moduleIds = [...new Set(checkedUnits.map((unit) => unit.moduleId))];
      return {
        module: row.moduleName,
        moduleIds,
        // The backend's configure step requires every module's subject to
        // be included in subject_ids too — without this it rejects the
        // module with "must belong to a selected subject" even though the
        // module is valid, because it checks membership in subject_ids,
        // not just that the module exists.
        subjectIds: [
          ...new Set(
            moduleIds
              .map((moduleId) => moduleIdToSubjectId.get(moduleId))
              .filter(Boolean),
          ),
        ],
        competencyUnits: checkedUnits.map((unit) => unit.name),
        competencyUnitIds: checkedUnits.map((unit) => unit.id),
        questionNumber: Number(row.totalQuestions) || 0,
        // Split this module's "Total questions for this module" evenly
        // across its selected competency units, so the backend can store
        // (and later actually draw) the admin's own per-module number
        // instead of silently re-splitting the exam_type's fixed total
        // across every competency unit in the exam.
        unitDistribution: (() => {
          const total = Number(row.totalQuestions) || 0;
          const count = checkedUnits.length;
          if (!count) return [];
          const base = Math.floor(total / count);
          const remainder = total % count;
          return checkedUnits.map((unit, i) => ({
            competency_unit_id: unit.id,
            question_count: base + (i < remainder ? 1 : 0),
          }));
        })(),
      };
    });
  const checkedRowCount = resolvedPlans.length;
  const totalQuestionsUsed = resolvedPlans.reduce(
    (sum, plan) => sum + plan.questionNumber,
    0,
  );
  const MAX_QUESTIONS = 25;
  const MARKS_PER_QUESTION = 2;
  const title = selectedSet
    ? `${setName(selectedSet.setType)} Examination ${number}`
    : "Select an exam set";
  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    if (!selectedSet || !setId)
      return toast.error("Select an exam set before continuing.");
    if (!number) return toast.error("Select an exam number before continuing.");
    const selectedNumber = numberOptions.find(
      (option) => String(option.number) === String(number),
    );
    if (
      selectedNumber?.taken &&
      String(selectedNumber.number) !== String(existing?.number)
    )
      return toast.error(
        "That exam number is already taken. Select an available number.",
      );
    if (!startDate || !endDate)
      return toast.error("Enter both the start time and closing time.");
    const start = new Date(startDate);
    const end = new Date(endDate);
    const durationMinutes = Number(duration);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()))
      return toast.error("Enter valid start and closing times.");
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0)
      return toast.error("Duration must be greater than zero minutes.");
    if (end.getTime() <= start.getTime())
      return toast.error("Closing time must be after the start time.");
    if (end.getTime() - start.getTime() < durationMinutes * 60 * 1000)
      return toast.error(
        "The exam window cannot be shorter than the configured duration.",
      );
    if (!moduleRows.length)
      return toast.error("Add at least one module before continuing.");
    if (checkedRowCount !== moduleRows.length)
      return toast.error(
        "For every module, pick at least one competency unit and enter the total questions.",
      );
    if (totalQuestionsUsed !== MAX_QUESTIONS)
      return toast.error(
        `Total questions across all modules must be exactly ${MAX_QUESTIONS}. Currently ${totalQuestionsUsed}.`,
      );
    try {
      setBusy(true);
      await saveExam({
        id: existing?.id,
        examSetId: setId,
        number,
        title,
        setType: selectedSet.setType,
        deliveryMode: selectedSet.deliveryMode,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        duration: durationMinutes,
        questions: 25,
        totalMarks: 50,
        passMarks: 25,
        status,
        distribution: resolvedPlans.map(
          (plan) =>
            `${plan.module} / ${plan.competencyUnits.join(", ")} · ${plan.questionNumber} question(s)`,
        ),
        questionPlan: resolvedPlans,
        subjectIds: [
          ...new Set(resolvedPlans.flatMap((plan) => plan.subjectIds)),
        ],
        moduleIds: [
          ...new Set(resolvedPlans.flatMap((plan) => plan.moduleIds)),
        ],
        competencyUnitIds: resolvedPlans.flatMap(
          (plan) => plan.competencyUnitIds,
        ),
        distribution: resolvedPlans.flatMap((plan) => plan.unitDistribution),
      });
      toast.success(isEditing ? "Exam updated" : "Exam created", {
        description:
          selectedSet.deliveryMode === "OFFLINE"
            ? "The fixed administrator-only paper is ready to print."
            : "The online dynamic exam will be visible only while Running.",
      });
      navigate("/admin/exams");
    } catch (error) {
      toast.error(describeApiError(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader
        eyebrow="Dynamic examination builder"
        title={isEditing ? "Edit exam" : "Create exam"}
        description="The selected set supplies course, batch coverage, type, and delivery. Total marks are fixed at 50."
        action={
          <Button variant="outline" onClick={() => navigate("/admin/exams")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        }
      />
      <RecordCard>
        <form className="space-y-6 p-6" onSubmit={submit}>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Exam set" required>
              <Select
                value={setId}
                onChange={(event) => setSetId(event.target.value)}
              >
                <option value="" disabled>
                  Select exam set
                </option>
                {scopedSets.map((set) => (
                  <option key={set.id} value={set.id}>
                    {set.name} · {set.course} ·{" "}
                    {set.allBatches ? "All batches" : set.batch} ·{" "}
                    {deliveryLabel(set.deliveryMode)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Exam number" required>
              <Select
                value={number}
                onChange={(event) => setNumber(event.target.value)}
              >
                {numberOptions.map((option) => (
                  <option
                    key={option.number}
                    value={option.number}
                    disabled={
                      option.taken && option.number !== existing?.number
                    }
                  >
                    No. {option.number}
                    {option.taken ? " · Taken" : " · Available"}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Exam type">
              <div className="flex h-10 items-center rounded-md border border-[#d6ded7] bg-[#f5f8f5] px-3 text-sm font-semibold text-[#37574f]">
                {deliveryLabel(selectedSet?.deliveryMode)}
              </div>
            </Field>
            <Field label="Exam title">
              <div className="flex h-10 items-center rounded-md border border-[#d6ded7] bg-[#f5f8f5] px-3 text-sm font-semibold text-[#37574f]">
                {title}
              </div>
            </Field>
            <Field label="Start time" required>
              <Input
                name="startDate"
                type="datetime-local"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                step="1"
                required
              />
            </Field>
            <Field label="Closing time" required>
              <Input
                name="endDate"
                type="datetime-local"
                value={endDate}
                onChange={(event) => {
                  endDateTouched.current = true;
                  setEndDate(event.target.value);
                }}
                step="1"
                required
              />
            </Field>
            <Field label="Duration (minutes)" required>
              <Input
                name="duration"
                type="number"
                min="1"
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                required
              />
            </Field>
            <Field label="Total marks">
              <div className="flex h-10 items-center rounded-md border border-[#b5d2c6] bg-[#eff8f3] px-3 text-sm font-bold text-[#0e5a4f]">
                50 fixed marks
              </div>
            </Field>
            <Field label="Status">
              <Select
                name="status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option>Available</option>
                <option>Scheduled</option>
                <option>Ready</option>
              </Select>
            </Field>
          </div>
          <section className="border-t border-[#e6ece6] pt-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Button
                  type="button"
                  size="sm"
                  onClick={addModuleRow}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add module
                </Button>
                <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[#72827e]">
                  Question Distribution
                </p>
                <p className="mt-1 text-xs text-[#6e7f7a]">
                  Add a module, pick its competency units, and set the total
                  question count for that module.
                </p>
              </div>
              <div
                className={`shrink-0 rounded-md border px-3 py-1.5 text-xs font-bold ${
                  totalQuestionsUsed > MAX_QUESTIONS
                    ? "border-red-300 bg-red-50 text-red-700"
                    : "border-[#b5d2c6] bg-[#eff8f3] text-[#0e5a4f]"
                }`}
              >
                {totalQuestionsUsed} / {MAX_QUESTIONS} questions ·{" "}
                {totalQuestionsUsed * MARKS_PER_QUESTION} marks
              </div>
            </div>
            <div className="mt-4 space-y-4">
              {moduleRowDetails.map((row, index) => (
                <ModuleDistributionBlock
                  key={row.id}
                  index={index}
                  moduleRow={row}
                  details={row}
                  groupedModules={groupedModules}
                  otherSelectedModuleNames={moduleRows
                    .filter((other) => other.id !== row.id && other.moduleName)
                    .map((other) => other.moduleName)}
                  onChangeModule={onChangeModuleRowModule}
                  toggleUnit={toggleModuleRowUnit}
                  setTotalQuestions={setModuleRowTotalQuestions}
                  removeModule={removeModuleRow}
                  canRemove
                />
              ))}
              {!moduleRows.length && (
                <p className="rounded-lg border border-dashed border-[#dce8df] bg-[#fbfdfb] p-4 text-center text-sm text-[#6e7f7a]">
                  No modules added yet. Use "Add module" above to add one.
                </p>
              )}
            </div>
            <p className="mt-3 text-xs text-[#6e7f7a]">
              Online questions are selected per attempt only while the exam is
              Running. Monthly offline papers are one fixed 23 MCQ + 2
              descriptive selection from the Question Bank.
            </p>
          </section>
          <section className="rounded-xl border border-[#cfe1d7] bg-[#f8fcf9] p-5">
            <div className="flex items-start gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#e2f1e8] text-[#0e5a4f]">
                <FileText className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#698079]">
                  Review
                </p>
                <h2 className="mt-1 font-serif text-xl font-semibold text-[#1b413a]">
                  {title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#587168]">
                  {selectedSet?.course ?? "No course selected"} ·{" "}
                  {selectedSet?.allBatches
                    ? "All batches"
                    : (selectedSet?.batch ?? "No batch selected")}{" "}
                  · {deliveryLabel(selectedSet?.deliveryMode)} · 25 questions ·
                  50 marks
                </p>
                <div className="mt-2 space-y-1 text-sm text-[#587168]">
                  {resolvedPlans.length ? (
                    resolvedPlans.map((item, index) => (
                      <p key={`${item.module}-${index}`}>
                        {index + 1}. {item.module} →{" "}
                        {item.competencyUnits.join(", ")} ·{" "}
                        {item.questionNumber} question(s)
                      </p>
                    ))
                  ) : (
                    <p>
                      Add a module, check its competency units, and enter its
                      total questions to preview the question plan.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>
          <div className="flex justify-end border-t border-[#e6ece6] pt-5">
            <Button
              type="submit"
              disabled={busy || totalQuestionsUsed > MAX_QUESTIONS}
              className="bg-[#0e5a4f] hover:bg-[#0a4a40] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save className="mr-2 h-4 w-4" />
              {busy ? "Saving…" : isEditing ? "Save exam" : "Create exam"}
            </Button>
          </div>
        </form>
      </RecordCard>
    </>
  );
}

function ExamDetailPage() {
  const [, params] = useRoute("/admin/exams/:id");
  const [, navigate] = useLocation();
  const [, setVersion] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(
      () => setVersion((value) => value + 1),
      1000,
    );
    return () => window.clearInterval(timer);
  }, []);
  const exam = getExam(params?.id);
  // The plain exam list this page reads from never loads modules/
  // competencyUnits, so it can't tell us the exam's Module(s) for the
  // print cover page. fetchExamForEdit() already does load them (via the
  // single-exam endpoint) — reuse that existing call rather than adding a
  // new endpoint, just to read the module names for the cover.
  const [examModules, setExamModules] = useState([]);
  useEffect(() => {
    if (!params?.id) return undefined;
    let active = true;
    fetchExamForEdit(params.id)
      .then((full) => {
        if (!active) return;
        // questionPlan's own "module" field is the module's internal code
        // (e.g. "Module01"), which the print cover page used to show
        // verbatim as "Module(s): Module01" — not useful to a student, who
        // never sees that code anywhere else. Resolve each selected
        // module to the subject name(s) it actually groups together (e.g.
        // "Concepts of IT, Windows 10") and show those instead, matching
        // the same simplified "Module: <subjects>" style used on the
        // printed Result sheet.
        const allModules = getAcademicRecords().modules ?? [];
        const subjectNames = new Set();
        (full?.questionPlan ?? [])
          .map((group) => group.module)
          .filter(Boolean)
          .forEach((moduleName) => {
            allModules
              .filter((module) => module.name === moduleName)
              .forEach((module) => { if (module.subject) subjectNames.add(module.subject); });
          });
        setExamModules(Array.from(subjectNames));
      })
      .catch(() => {
        if (active) setExamModules([]);
      });
    return () => {
      active = false;
    };
  }, [params?.id]);
  // Clicking "Print Questions" only opens the browser's native print
  // dialog (window.print()) — there is no PDF generation step. When a
  // user chooses "Save as PDF" there, the browser suggests document.title
  // as the filename, and this app's <title> never changes from the
  // generic "IsDB-BISEW Examination Management System" set in
  // index.html. Every printed exam therefore saved under that same
  // generic name regardless of which exam or module it was. Set the tab
  // title to this exam's own name/batch/number while its detail page is
  // open, and restore the previous title on unmount, so "Save as PDF"
  // suggests a meaningful, exam-specific filename instead.
  useEffect(() => {
    if (!exam) return undefined;
    const previousTitle = document.title;
    const safe = (value) =>
      String(value ?? "")
        .replace(/[\\/:*?"<>|]+/g, "-")
        .trim();
    document.title =
      [
        safe(exam.title),
        safe(exam.batch),
        exam.number ? `No-${safe(exam.number)}` : null,
      ]
        .filter(Boolean)
        .join(" - ") || previousTitle;
    return () => {
      document.title = previousTitle;
    };
  }, [exam?.title, exam?.batch, exam?.number]);
  if (!exam) return <PageHeader title="Exam unavailable" />;
  const paper =
    exam.deliveryMode === "OFFLINE" ? buildOfflinePaper(exam) : null;
  return (
    <>
      <PageHeader
        eyebrow="Examination record"
        title={exam.title}
        description={`${deliveryLabel(exam.deliveryMode)} · ${exam.batch}`}
        action={
          <div className="flex flex-wrap gap-2">
            {paper?.available && (
              <Button onClick={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" />
                Print Questions
              </Button>
            )}
            <Button variant="outline" onClick={() => navigate("/admin/exams")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </div>
        }
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <RecordCard className="p-6">
          <dl className="space-y-3 text-sm">
            {[
              ["Exam number", exam.number],
              ["Status", exam.status],
              ["Delivery", deliveryLabel(exam.deliveryMode)],
              ["Total marks", "50"],
              ["Start", exam.startDate],
              ["Close", exam.endDate],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex justify-between gap-4 border-b border-[#edf1ed] pb-3"
              >
                <dt className="text-[#70817c]">{label}</dt>
                <dd className="font-semibold text-[#294a43]">
                  {label === "Status" ? <StatusBadge value={value} /> : value}
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-5 flex gap-2">
            {(exam.status === "Draft" || exam.status === "Scheduled") && (
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await publishExam(exam.id);
                    setVersion((value) => value + 1);
                    toast.success(
                      "Exam published. It is now Ready and visible to students.",
                    );
                  } catch (error) {
                    toast.error(describeApiError(error));
                  }
                }}
              >
                <CirclePlay className="mr-2 h-4 w-4" />
                Publish
              </Button>
            )}
            {exam.deliveryMode === "ONLINE" && exam.status === "Ready" && (
              <Button
                onClick={() => {
                  try {
                    changeExamStatus(exam.id, "START");
                    setVersion((value) => value + 1);
                    toast.success("Exam is now Running.");
                  } catch (error) {
                    toast.error(describeApiError(error));
                  }
                }}
              >
                <CirclePlay className="mr-2 h-4 w-4" />
                Start manually
              </Button>
            )}
            {exam.deliveryMode === "ONLINE" && exam.status === "Running" && (
              <Button
                variant="destructive"
                onClick={() => {
                  try {
                    changeExamStatus(exam.id, "STOP");
                    setVersion((value) => value + 1);
                    toast.success("Exam is now Completed.");
                  } catch (error) {
                    toast.error(describeApiError(error));
                  }
                }}
              >
                <CircleStop className="mr-2 h-4 w-4" />
                Stop manually
              </Button>
            )}
          </div>
        </RecordCard>
        {paper ? (
          // print:border-0/rounded-none/shadow-none/bg-transparent/p-0 undo
          // RecordCard's own boxed-card styling for print. This RecordCard
          // is a direct ancestor of .print-only-cover-page, so index.css's
          // print stylesheet (which only hides elements that are NOT an
          // ancestor of a print-only block) intentionally leaves it in the
          // DOM and visible -- meaning its border/rounded-xl/shadow/p-6
          // otherwise render on the printed page exactly as they do on
          // screen, wrapping the cover sheet in a visibly boxed card
          // instead of it filling the printable page.
          <RecordCard className="p-6 print:border-0 print:rounded-none print:bg-transparent print:p-0 print:shadow-none">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#72827e]">
              Offline paper
            </p>
            <h2 className="mt-2 font-serif text-2xl font-semibold text-[#1d413b]">
              23 MCQ + 2 descriptive questions
            </h2>
            {!paper.available ? (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
                This paper cannot be generated until {paper.missingMcq} more MCQ
                and {paper.missingDescriptive} more descriptive eligible
                Question Bank records are available.
              </p>
            ) : (
              <>
                <p className="mt-3 text-sm leading-6 text-[#61746e]">
                  This fixed paper is generated from Question Bank snapshots. It
                  is available to administrators for printing only and never
                  appears in the student portal.
                </p>
                <Button
                  className="mt-5 print:hidden"
                  onClick={() => window.print()}
                >
                  <Printer className="mr-2 h-4 w-4" />
                  Print question paper
                </Button>
                {/* On-screen preview of the paper (admin view only). This
                    used to duplicate OfflineQuestionList's markup inline,
                    which meant two separate copies of the questions existed
                    in the DOM at once. At print time the print stylesheet
                    hides this block with visibility:hidden, but hidden
                    elements still occupy their layout box/page space, which
                    is what was producing extra blank pages after the real
                    printed content. Reuse OfflineQuestionList here too
                    (marked print:hidden so it collapses out of the layout
                    entirely for print, not just visually) instead of
                    keeping a second, drifting copy of this markup. */}
                <OfflineQuestionList
                  paper={paper}
                  className="mt-5 print:hidden"
                />
                {/* Print-only output, in the exact order pages should come
                    out: cover page first, then the question paper. Both are
                    `display:none` on screen and only switched on inside the
                    print stylesheet, and neither is positioned absolutely,
                    so they stack in normal document flow and paginate in
                    this order instead of the cover page trailing after the
                    questions. */}
                <OfflinePrintCoverPage exam={exam} moduleNames={examModules} />
                <OfflineQuestionList
                  paper={paper}
                  className="print-only-question-paper"
                />
              </>
            )}
          </RecordCard>
        ) : (
          <RecordCard className="p-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#72827e]">
              Online delivery
            </p>
            <h2 className="mt-2 font-serif text-2xl font-semibold text-[#1d413b]">
              Dynamic student attempt
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#61746e]">
              Eligible students receive a dynamic Question Bank attempt only
              while this exam is Running. Offline monthly papers never enter
              this portal.
            </p>
          </RecordCard>
        )}
      </div>
    </>
  );
}

export {
  ExamDetailPage,
  ExamFormPage,
  ExamListPage,
  ExamSetDetailPage,
  ExamSetFormPage,
  ExamSetListPage,
};