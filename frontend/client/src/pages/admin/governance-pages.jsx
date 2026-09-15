/** Results workspace style: outcome records stay deliberately hidden until an administrator selects the exact course and batch context. */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useRoute, useSearch } from "wouter";
import {
  ArrowLeft,
  Download,
  Eye,
  FileBarChart2,
  Printer,
  Save,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { jsPDF } from "jspdf";
import { toast } from "sonner";
import { auditLogs, permissions, roles, violations } from "@/lib/mock-data";
import {
  DataTable,
  FilterBand,
  FilterField,
  LoadingState,
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getLaravelApiConfig,
  resetLaravelApiConfig,
  setLaravelApiConfig,
} from "@/services/api-client";
import { apiClient, isMockMode } from "@/services/api-client";
import { reportService, resultService, settingsService } from "@/services/services";
import {
  academicUpdateEvent,
  getAcademicRecords,
} from "@/lib/academic-demo-store";
import { LiveResultListPage } from "@/components/result-list-live";
import {
  CourseScopedUserFormPage,
  CourseScopedUserListPage,
} from "@/components/course-scoped-user-pages";
/**
 * Kept in sync with Batch::displayCode() on the backend
 * (course/tsp-shiftLetter/round/batchNumber, e.g. "PWAD/CCSL-M/71/01") so a
 * batch is shown the same way here as everywhere else in the app, instead
 * of falling back to a bare batch number like "01".
 */
const batchDisplayLabel = (batch) => {
  if (!batch || typeof batch !== "object") return batch ?? null;
  if (batch.display_code) return batch.display_code;
  const shiftLetter = String(batch.shift ?? "")
    .charAt(0)
    .toUpperCase();
  const tspShift = [batch.tsp?.code, shiftLetter].filter(Boolean).join("-");
  const paddedNumber =
    batch.batch_number !== undefined && batch.batch_number !== null
      ? String(batch.batch_number).padStart(2, "0")
      : null;
  const joined = [batch.course?.code, tspShift || null, batch.round?.code, paddedNumber]
    .filter(Boolean)
    .join("/");
  // Previously fell back to the raw `batch.batch_number` here when every
  // other piece was missing (e.g. an empty `{}` placeholder batch) — for
  // an empty batch that's also undefined, which rendered as the literal
  // text "undefined" instead of a normal empty/placeholder value.
  return joined || batch.batch_number || null;
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
// `loading` starts true in real (non-mock) mode and only flips false once
// this endpoint's request actually resolves (success or failure) — until
// now callers had no way to tell "still fetching" apart from "genuinely
// empty", so PermissionListPage/AuditLogPage/ViolationListPage briefly (or,
// on a slow connection, not-so-briefly) showed "No records found" on every
// mount even when records existed on the server.
const useLiveCollection = (endpoint, fallback, normalize = (item) => item) => {
  const [items, setItems] = useState(() => (isMockMode ? fallback : []));
  const [loading, setLoading] = useState(() => !isMockMode);
  useEffect(() => {
    if (isMockMode) return undefined;
    let active = true;
    setLoading(true);
    apiClient
      .get(endpoint, { params: { per_page: 100 } })
      .then((response) => {
        const payload = response.data?.data;
        const rows = Array.isArray(payload) ? payload : (payload?.data ?? []);
        if (active) setItems(rows.map(normalize));
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [endpoint]);
  return { items, loading };
};
const Select = ({ children, ...props }) => (
  <select
    {...props}
    className="h-10 w-full rounded-md border border-[#d6ded7] bg-white px-3 text-sm text-[#2f4d47] outline-none focus:ring-2 focus:ring-[#0e5a4f]/30"
  >
    {children}
  </select>
);
const downloadResultTable = (records, selectedBatch) => {
  if (!records.length) {
    toast.error("There are no result records to print.");
    return;
  }
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const columns = [
    { label: "Student ID", x: 20, width: 38 },
    { label: "Student name", x: 58, width: 76 },
    { label: "Marks", x: 134, width: 26 },
    { label: "Status", x: 160, width: 30 },
  ];
  const drawTableHeader = (y2) => {
    pdf.setFillColor(14, 90, 79);
    pdf.rect(20, y2, 170, 8, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(255, 255, 255);
    columns.forEach((column) => pdf.text(column.label, column.x + 2, y2 + 5.3));
    pdf.setTextColor(31, 61, 55);
    return y2 + 8;
  };
  let y = 20;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  pdf.text(
    `IsDB-BISEW \xB7 Result Summary${selectedBatch === "all" ? "" : ` \xB7 ${selectedBatch}`}`,
    20,
    y,
  );
  y = drawTableHeader(y + 9);
  records.forEach((result) => {
    if (y > 276) {
      pdf.addPage();
      y = drawTableHeader(20);
    }
    pdf.setDrawColor(211, 224, 216);
    pdf.setFillColor(248, 251, 249);
    pdf.rect(20, y, 170, 9, "FD");
    columns
      .slice(1)
      .forEach((column) => pdf.line(column.x, y, column.x, y + 9));
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(String(result.studentId), 22, y + 5.8);
    pdf.text(String(result.student), 60, y + 5.8);
    pdf.text(String(result.obtainedMarks), 136, y + 5.8);
    pdf.text(String(result.status), 162, y + 5.8);
    y += 9;
  });
  const batchSuffix =
    selectedBatch === "all"
      ? "all-batches"
      : selectedBatch
          .replace(/[^a-z0-9]+/gi, "-")
          .replace(/^-|-$/g, "")
          .toLowerCase();
  pdf.save(`isdb-bisew-result-table-${batchSuffix}.pdf`);
  toast.success("Result table PDF downloaded.", {
    description:
      "The document contains one table with student ID, student name, marks, and status.",
  });
};
const REPORT_BRAND_LOGO_URL = "/manus-storage/isdb-bisew-brand-logo_29718725.png";
const loadReportImageDataUrl = (url) => new Promise((resolve, reject) => {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d").drawImage(img, 0, 0);
    resolve(canvas.toDataURL("image/png"));
  };
  img.onerror = reject;
  img.src = url;
});
// Same branded letterhead as the Result Management PDF (result-list-live.jsx)
// -- crest, "IsDB-BISEW · Examination Management System", page/generated
// stamp -- so every exported document in the app looks consistent.
const buildReportPdf = async (rows, reportType, roundLabel) => {
  if (!rows.length) {
    toast.error("There is no report data to export yet.");
    return;
  }
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const TABLE_LEFT = 14;
  const TABLE_WIDTH = 269;
  const logoDataUrl = await loadReportImageDataUrl(REPORT_BRAND_LOGO_URL).catch(() => null);
  const reportTitle = reportType === "batch" ? "Batch-wise Report" : "Exam-wise Report";
  const columns = reportType === "batch"
    ? [
        ["Batch", "batch", 46],
        ["Course", "course", 20],
        ["Students", "students_assigned", 20],
        ["Attempted", "results_recorded", 22],
        ["Avg. External", "average_external", 26],
        ["Avg. Evidence", "average_evidence", 26],
        ["Pass", "pass", 18],
        ["Fail", "fail", 18],
        ["Absent", "absent", 20],
        ["Pass rate", (row) => `${row.pass_rate}%`, 24],
      ]
    : [
        ["Exam", "exam", 52],
        ["No.", "exam_number", 14],
        ["Type", (row) => (String(row.exam_type).toUpperCase() === "MONTHLY" ? "Monthly" : "Mid Monthly"), 24],
        ["Batch", "batch", 40],
        ["Students", "students_assigned", 20],
        ["Attempted", "attempts", 20],
        ["Avg. External", "average_external", 24],
        ["Avg. Evidence", "average_evidence", 24],
        ["Pass", "pass", 16],
        ["Fail", "fail", 16],
        ["Absent", "absent", 18],
        ["Pass rate", (row) => `${row.pass_rate}%`, 20],
      ];
  const bounds = [TABLE_LEFT];
  columns.forEach(([, , width]) => bounds.push(bounds[bounds.length - 1] + width));
  const mid = (index) => (bounds[index] + bounds[index + 1]) / 2;
  const valueOf = (row, accessor) => (typeof accessor === "function" ? accessor(row) : row[accessor] ?? "—");

  const drawLetterhead = (pageNumber, totalPages) => {
    if (logoDataUrl) pdf.addImage(logoDataUrl, "PNG", TABLE_LEFT, 10, 14, 14);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(15);
    pdf.setTextColor(14, 90, 79);
    pdf.text("IsDB-BISEW", TABLE_LEFT + 18, 16.5);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    pdf.setTextColor(90, 105, 99);
    pdf.text("Examination Management System", TABLE_LEFT + 18, 21.5);
    pdf.setFontSize(8.5);
    pdf.text(`Page ${pageNumber} of ${totalPages}`, TABLE_LEFT + TABLE_WIDTH - 24, 16.5);
    pdf.text(`Generated ${new Date().toLocaleString()}`, TABLE_LEFT + TABLE_WIDTH - 60, 21.5);
    pdf.setDrawColor(14, 90, 79);
    pdf.setLineWidth(0.6);
    pdf.line(TABLE_LEFT, 27, TABLE_LEFT + TABLE_WIDTH, 27);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.setTextColor(31, 61, 55);
    pdf.text(`${reportTitle}${roundLabel && roundLabel !== "all" ? ` \xB7 Round ${roundLabel}` : ""}`, TABLE_LEFT, 34);
    return 40;
  };
  const interiorBounds = bounds.slice(1, -1);
  const drawTableHeader = (y) => {
    pdf.setFillColor(14, 90, 79);
    pdf.rect(TABLE_LEFT, y, TABLE_WIDTH, 8, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(255, 255, 255);
    columns.forEach(([label], index) => pdf.text(label, mid(index), y + 5.3, { align: "center" }));
    pdf.setDrawColor(255, 255, 255);
    pdf.setLineWidth(0.2);
    interiorBounds.forEach((x) => pdf.line(x, y, x, y + 8));
    pdf.setTextColor(31, 61, 55);
    return y + 8;
  };

  let page = 1;
  const totalPages = Math.max(1, Math.ceil(rows.length / 22));
  let y = drawLetterhead(page, totalPages);
  y = drawTableHeader(y);
  rows.forEach((row, index) => {
    if (y > 195) {
      pdf.addPage();
      page += 1;
      y = drawLetterhead(page, totalPages);
      y = drawTableHeader(y);
    }
    pdf.setDrawColor(211, 224, 216);
    pdf.setFillColor(index % 2 === 0 ? 255 : 248, index % 2 === 0 ? 255 : 251, index % 2 === 0 ? 255 : 249);
    pdf.rect(TABLE_LEFT, y, TABLE_WIDTH, 8, "FD");
    interiorBounds.forEach((x) => pdf.line(x, y, x, y + 8));
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    columns.forEach(([, accessor], columnIndex) => pdf.text(String(valueOf(row, accessor)), mid(columnIndex), y + 5.3, { align: "center" }));
    y += 8;
  });

  pdf.save(`isdb-bisew-${reportType}-wise-report.pdf`);
  toast.success(`${reportTitle} PDF downloaded.`);
};
const ResultListPage = LiveResultListPage;
function ResultDetailPage() {
  const [, params] = useRoute("/admin/results/:id");
  const searchString = useSearch();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [combined, setCombined] = useState(null);
  const [notFoundMessage, setNotFoundMessage] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setNotFoundMessage("");
    // Monthly exams have no auto-graded ExamResult row at all (Monthly is
    // offline — its marks live entirely on exam_evidences), so their
    // roster rows carry no result `id` to fetch by. Those rows link here
    // as "/admin/results/na?examId=&studentId=" instead (see
    // detailsHref() in result-list-live.jsx); recognize that sentinel and
    // look the student+exam up directly via getDetail() rather than
    // assuming an ExamResult id is always present.
    const searchParams = new URLSearchParams(searchString);
    const isDirectLookup = params?.id === "na";
    const fetcher = isDirectLookup
      ? resultService.getDetail({
          examId: searchParams.get("examId"),
          studentId: searchParams.get("studentId"),
        })
      : resultService.get(params?.id);
    fetcher
      .then((record) => {
        if (!active) return;
        if (!record) {
          setResult(null);
          setNotFoundMessage("Student result data not found.");
          return;
        }
        const exam = record.exam ?? {};
        // Confirmed from the actual API response: Eloquent's default
        // relationsToArray() runs the relation name through Str::snake()
        // for its array/JSON key, so `examSet()` really does serialize as
        // `exam_set` — the opposite of what an earlier pass here assumed.
        // That earlier "fix" (reading `examSet` instead of `exam_set`)
        // was itself the actual regression causing Round/Batch to show
        // blank; reverted back to the correct `exam_set` key.
        const batch = exam.exam_set?.batch ?? {};
        const student = record.student ?? {};
        // These four were previously never read off `record` at all — the
        // detail cards asked for `result.examinationDate`/`totalMarks`/
        // `violations`/`violationStatus`, but nothing in this mapping ever
        // set them, so they fell through to `String(undefined)` -> the
        // literal text "undefined" on screen.
        // getDetail() (the no-ExamResult path) already returns a rolled-up
        // `violationCount` across every attempt that student made on this
        // exam; get() (the ExamResult-id path) still only carries a single
        // attempt's violations via the `attempt` relation. Prefer the
        // former when present so both paths report the same true count.
        const violationCount = record.violationCount ?? (record.attempt?.violations ?? []).length;
        setResult({
          ...record,
          studentId: student.student_id,
          student: student.name,
          course: batch.course?.code,
          batch: batchDisplayLabel(batch),
          round: batch.round?.code,
          exam: exam.exam_title,
          examNumber: exam.exam_number,
          examType: exam.exam_type,
          examinationDate: exam.start_at
            ? new Date(exam.start_at).toLocaleString()
            : null,
          totalQuestions:
            Number(record.correct_answers ?? 0) +
            Number(record.wrong_answers ?? 0) +
            Number(record.unanswered_questions ?? 0),
          correct: record.correct_answers,
          wrong: record.wrong_answers,
          unanswered: record.unanswered_questions,
          // `total_marks` on the API record is the marks the student
          // *obtained*, not the exam's maximum — that maximum lives on
          // the exam itself (`max_marks`). Reusing the same value for
          // both "Obtained marks" and "Total marks" would have shown the
          // same number twice; max_marks is the correct, separate value.
          obtainedMarks: record.total_marks,
          totalMarks: exam.max_marks,
          percentage: record.percentage,
          status: record.status,
          violations: violationCount,
          violationStatus: violationCount > 0 ? "Flagged" : "Clean",
        });
        // Both get() and getDetail() now embed `finalResult` directly (see
        // ResultController::show()/detail()) — no second request needed.
        setCombined(record.finalResult ?? null);
      })
      .catch((error) => {
        if (!active) return;
        setResult(null);
        setNotFoundMessage(error?.response?.data?.message ?? "The requested result could not be loaded or is outside your assigned scope.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [params?.id, searchString]);
  if (loading)
    return (
      <PageHeader
        eyebrow="Result"
        title="Loading result"
        description="Retrieving the authorized result record."
      />
    );
  // A shared "Back" action so the two error states below aren't dead
  // ends — previously they had no way back to the filtered list except
  // manually editing the URL, since the success-path's "Back to results"
  // button only existed further down, past both of these early returns.
  const backAction = (
    <button
      type="button"
      onClick={() => window.history.back()}
      className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#d5ddd6] bg-white px-4 text-sm font-semibold text-[#294942]"
    >
      <ArrowLeft className="h-4 w-4" />
      Back to results
    </button>
  );
  if (!result)
    return (
      <>
        <PageHeader
          eyebrow="Result unavailable"
          title="Result not found"
          description={notFoundMessage || "The requested result could not be loaded or is outside your assigned scope."}
          action={backAction}
        />
        <RecordCard className="p-6">
          <p className="text-sm leading-6 text-[#536b64]">
            Return to Results to view authorized records.
          </p>
        </RecordCard>
      </>
    );
  // Course-scope authorization is already fully enforced server-side
  // (ResultAuthorizationService), so no separate client-side re-check here.
  return (
    <>
      <PageHeader
        eyebrow="Authorized outcome record"
        title={`Result \xB7 ${String(result.student)}`}
        description="This administrative view provides examination performance and violation information. It must not be included in any student-facing route or payload."
        action={backAction}
      />
      <div className="grid gap-5 xl:grid-cols-3">
        <RecordCard className="p-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#72827e]">
            Student information
          </p>
          <dl className="mt-5 space-y-4">
            {[
              ["Student ID", result.studentId],
              ["Name", result.student],
              ["Round", result.round],
              ["Batch", result.batch],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="border-b border-[#edf1ed] pb-3"
              >
                <dt className="text-xs font-bold uppercase tracking-[0.12em] text-[#7a8984]">
                  {label}
                </dt>
                <dd className="mt-1 font-semibold text-[#274840]">
                  {String(value ?? "—")}
                </dd>
              </div>
            ))}
          </dl>
        </RecordCard>
        <RecordCard className="p-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#72827e]">
            Exam information
          </p>
          <dl className="mt-5 space-y-4">
            {[
              ["Exam title", result.exam],
              ["Exam number", result.examNumber],
              ["Exam type", result.examType],
              ["Examination date", result.examinationDate],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="border-b border-[#edf1ed] pb-3"
              >
                <dt className="text-xs font-bold uppercase tracking-[0.12em] text-[#7a8984]">
                  {label}
                </dt>
                <dd className="mt-1 font-semibold text-[#274840]">
                  {String(value ?? "—")}
                </dd>
              </div>
            ))}
          </dl>
        </RecordCard>
        <RecordCard className="p-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#72827e]">
            Performance
          </p>
          {/* Monthly is offline and never auto-graded, so it has no
              correct/wrong/unanswered/obtained-marks question breakdown —
              those would always read 0/0/0/0 and look like a broken page.
              Show its actual recorded External (MCQ)/Evidence marks and
              attendance instead; Mid Monthly keeps the original
              question-level breakdown since it IS auto-graded. */}
          <div className="mt-5 grid grid-cols-2 gap-3">
            {(String(result.examType).toUpperCase() === "MONTHLY"
              ? [
                  ["External marks", result.evidenceMcqMarks ?? "—"],
                  ["Evidence marks", result.evidenceMarks ?? "—"],
                  ["Attendance", result.attended ? "Present" : "Absent"],
                ]
              : [
                  ["Total questions", result.totalQuestions],
                  ["Correct", result.correct],
                  ["Wrong", result.wrong],
                  ["Unanswered", result.unanswered],
                  ["Obtained marks", result.obtainedMarks],
                  ["Total marks", result.totalMarks],
                ]
            ).map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-lg border border-[#e3eae4] bg-[#fbfcfa] p-3"
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-[#7b8985]">
                  {label}
                </p>
                <p className="mt-1 font-serif text-xl font-semibold text-[#24453f]">
                  {String(value ?? "—")}
                </p>
              </div>
            ))}
          </div>
        </RecordCard>
      </div>
      {combined && (
        <RecordCard className="mt-5 p-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#72827e]">
            Final Result (Mid Monthly {combined.midWeightPercent ?? 20}% + Monthly {combined.monthlyWeightPercent ?? 80}%, per component)
          </p>
          {combined.complete ? (
            <>
              <div className="mt-3 flex items-center justify-end">
                <StatusBadge value={combined.status} />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-[#e3eae4] bg-[#fbfcfa] p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-[#7b8985]">
                    Mid Monthly External
                  </p>
                  <p className="mt-1 font-serif text-xl font-semibold text-[#24453f]">
                    {combined.midMonthly?.external ?? "—"}
                  </p>
                  {combined.midMonthly?.externalStatus && (
                    <div className="mt-1"><StatusBadge value={combined.midMonthly.externalStatus} /></div>
                  )}
                </div>
                <div className="rounded-lg border border-[#e3eae4] bg-[#fbfcfa] p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-[#7b8985]">
                    Mid Monthly Evidence
                  </p>
                  <p className="mt-1 font-serif text-xl font-semibold text-[#24453f]">
                    {combined.midMonthly?.evidence ?? "—"}
                  </p>
                  {combined.midMonthly?.evidenceStatus && (
                    <div className="mt-1"><StatusBadge value={combined.midMonthly.evidenceStatus} /></div>
                  )}
                </div>
                <div className="rounded-lg border border-[#e3eae4] bg-[#fbfcfa] p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-[#7b8985]">
                    Monthly External
                  </p>
                  <p className="mt-1 font-serif text-xl font-semibold text-[#24453f]">
                    {combined.monthly?.external ?? "—"}
                  </p>
                </div>
                <div className="rounded-lg border border-[#e3eae4] bg-[#fbfcfa] p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-[#7b8985]">
                    Monthly Evidence
                  </p>
                  <p className="mt-1 font-serif text-xl font-semibold text-[#24453f]">
                    {combined.monthly?.evidence ?? "—"}
                  </p>
                </div>
                {/* Final External/Final Evidence cards commented out (not shown) -- uncomment to restore.
                <div className="rounded-lg border border-[#e3eae4] bg-[#fbfcfa] p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-[#7b8985]">
                    Final External
                  </p>
                  <p className="mt-1 font-serif text-xl font-semibold text-[#24453f]">
                    {combined.finalExternal}
                  </p>
                  <div className="mt-1"><StatusBadge value={combined.finalExternalStatus} /></div>
                </div>
                <div className="rounded-lg border border-[#e3eae4] bg-[#fbfcfa] p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-[#7b8985]">
                    Final Evidence
                  </p>
                  <p className="mt-1 font-serif text-xl font-semibold text-[#24453f]">
                    {combined.finalEvidence}
                  </p>
                  <div className="mt-1"><StatusBadge value={combined.finalEvidenceStatus} /></div>
                </div>
                */}
                <div className="rounded-lg border border-[#e3eae4] bg-[#fbfcfa] p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-[#7b8985]">
                    Total marks
                  </p>
                  <p className="mt-1 font-serif text-xl font-semibold text-[#24453f]">
                    {combined.totalMarks}
                  </p>
                </div>
                <div className="rounded-lg border border-[#e3eae4] bg-[#fbfcfa] p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-[#7b8985]">
                    Pass mark (each)
                  </p>
                  <p className="mt-1 font-serif text-xl font-semibold text-[#24453f]">
                    {combined.passThreshold}
                  </p>
                </div>
              </div>
            </>
          ) : (
            // Incomplete: one side of the pair (usually the Monthly
            // evidence marks, since that's manually entered) hasn't been
            // recorded yet. Naming the gap and linking straight to the
            // Evidence tab beats silently hiding the whole card, which
            // just left admins wondering why no combined result showed up
            // at all.
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#f0cf9a] bg-[#fdf6e8] p-4">
              <p className="text-sm text-[#7a5a18]">{combined.message}</p>
              <Link
                href="/admin/results?view=evidence"
                className="inline-flex whitespace-nowrap items-center rounded-md border border-[#c7ddd0] bg-[#e8f3ed] px-2.5 py-1.5 text-xs font-bold text-[#0e5a4f] transition hover:bg-[#d9ece2]"
              >
                Update evidence result →
              </Link>
            </div>
          )}
        </RecordCard>
      )}
      <RecordCard className="mt-5 p-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#72827e]">
          Violation information
        </p>
        <div className="mt-4 flex flex-wrap gap-6">
          <div>
            <p className="text-sm text-[#71817c]">Violation count</p>
            <p className="mt-1 font-serif text-3xl font-semibold text-[#264841]">
              {String(result.violations)}
            </p>
          </div>
          <div>
            <p className="text-sm text-[#71817c]">Violation status</p>
            <div className="mt-2">
              <StatusBadge value={result.violationStatus} />
            </div>
          </div>
        </div>
      </RecordCard>
    </>
  );
}
function RoleListPage() {
  const [liveRoles, setLiveRoles] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    apiClient
      .get("/v1/admin/roles", { params: { per_page: 100 } })
      .then((response) => {
        const payload = response.data?.data;
        const rows = Array.isArray(payload) ? payload : (payload?.data ?? []);
        if (active)
          setLiveRoles(
            rows.map((item) => ({
              ...item,
              permissionIds:
                item.permissions?.map((permission) => permission.name) ?? [],
              userCount: item.users_count ?? 0,
              status: item.status ?? "Active",
            })),
          );
      })
      .catch((requestError) => {
        if (active)
          setError(
            requestError.response?.data?.message ??
              "Roles could not be loaded from the Laravel API.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Roles"
        description="Define extensible administrative roles and their permission assignments. Laravel remains the authority that enforces every permission."
        action={<PrimaryLink href="/admin/roles/create">Add role</PrimaryLink>}
      />
      {error && (
        <RecordCard className="mb-5 border-rose-200 bg-rose-50 p-5">
          <p role="alert" className="text-sm text-rose-800">
            {error}
          </p>
        </RecordCard>
      )}
      {loading ? (
        <LoadingState title="Loading roles…" />
      ) : (
      <DataTable
        records={liveRoles}
        rowLabel="roles"
        columns={[
          {
            key: "name",
            label: "Role",
            render: (record) => (
              <div>
                <p className="font-semibold text-[#264840]">{record.name}</p>
                <p className="mt-1 max-w-md text-xs text-[#74837e]">
                  {record.description}
                </p>
              </div>
            ),
          },
          { key: "userCount", label: "Users" },
          {
            key: "permissionIds",
            label: "Permissions",
            render: (record) => (
              <span className="font-semibold text-[#36564f]">
                {record.permissionIds.length} assigned
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
            label: "Actions",
            render: (record) => (
              <Link
                href={`/admin/roles/${record.id}/edit`}
                className="inline-flex items-center rounded-md bg-[#e8f3ed] px-2.5 py-1.5 text-xs font-bold text-[#0e5a4f] transition hover:bg-[#d9ece2]"
              >
                Edit permissions
              </Link>
            ),
          },
        ]}
      />
      )}
    </>
  );
}
function RoleFormPage() {
  const [, params] = useRoute("/admin/roles/:id/edit");
  const isEditing = Boolean(params?.id);
  const [apiRole, setApiRole] = useState(null);
  const [apiPermissions, setApiPermissions] = useState([]);
  const existing =
    apiRole ?? roles.find((role) => role.id === params?.id) ?? roles[1];
  const [, navigate] = useLocation();
  const [selected, setSelected] = useState([]);
  useEffect(() => {
    Promise.all([
      isEditing
        ? apiClient.get("/v1/admin/roles", { params: { per_page: 100 } })
        : Promise.resolve(null),
      apiClient.get("/v1/admin/permissions", { params: { per_page: 100 } }),
    ])
      .then(([roleResponse, permissionResponse]) => {
        const rolePayload = roleResponse?.data?.data;
        const roleRows = Array.isArray(rolePayload)
          ? rolePayload
          : (rolePayload?.data ?? []);
        const role = roleRows.find(
          (item) => String(item.id) === String(params.id),
        );
        const permissionPayload = permissionResponse.data?.data;
        const live = Array.isArray(permissionPayload)
          ? permissionPayload
          : (permissionPayload?.data ?? []);
        setApiRole(role ?? null);
        setApiPermissions(
          live
            .filter(
              (permission) =>
                !String(permission.name ?? "").endsWith(".delete"),
            )
            .map((permission) => ({
              ...permission,
              label: permission.label ?? permission.name,
              group:
                permission.group ??
                `${String(permission.name ?? "general")
                  .split(".")[0]
                  .replace(/_/g, " ")
                  .replace(/\b\w/g, (letter) => letter.toUpperCase())}`,
              description: permission.description ?? "",
            })),
        );
        setSelected(
          role?.permissions?.map((permission) => permission.name) ?? [],
        );
      })
      .catch(() => setApiPermissions([]));
  }, [isEditing, params?.id]);
  const permissionRecords = (
    apiPermissions.length ? apiPermissions : permissions
  ).filter((permission) => !String(permission.name ?? "").endsWith(".delete"));
  const grouped = permissionRecords.reduce((groups, permission) => {
    const group =
      permission.group ??
      `${String(permission.name ?? "general")
        .split(".")[0]
        .replace(/_/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase())}`;
    return { ...groups, [group]: [...(groups[group] ?? []), permission] };
  }, {});
  const toggle = (permission) =>
    setSelected((current) =>
      current.includes(permission)
        ? current.filter((item) => item !== permission)
        : [...current, permission],
    );
  return (
    <>
      <PageHeader
        eyebrow="Role definition"
        title={isEditing ? `Edit role \xB7 ${existing.name}` : "Create role"}
        description="Assign grouped permission keys to the role. These selections prepare authorization data but must be enforced again by Laravel."
        action={
          <Button variant="outline" onClick={() => navigate("/admin/roles")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        }
      />
      <RecordCard>
        <form
          className="p-6"
          onSubmit={(event) => {
            event.preventDefault();
            const formEl = event.currentTarget;
            const form = new FormData(formEl);
            void (async () => {
              const payload = {
                name: formEl.querySelector("input")?.value?.trim(),
                description:
                  formEl.querySelector("textarea")?.value?.trim() || null,
              };
              const response = isEditing
                ? await apiClient.put(`/v1/admin/roles/${params.id}`, payload)
                : await apiClient.post("/v1/admin/roles", payload);
              const role = response.data?.data ?? response.data;
              await apiClient.put(`/v1/admin/roles/${role.id}/permissions`, {
                permission_ids: permissionRecords
                  .filter((permission) => selected.includes(permission.name))
                  .map((permission) => permission.id),
              });
              toast.success(`Role ${isEditing ? "updated" : "created"}`);
              navigate("/admin/roles");
            })().catch((error) =>
              toast.error(
                error.response?.data?.message ?? "The role could not be saved.",
              ),
            );
          }}
        >
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Role name" required>
              <Input
                defaultValue={isEditing ? existing.name : ""}
                placeholder="e.g. Assessment Officer"
                required
              />
            </Field>
            <Field label="Status">
              <Select defaultValue={isEditing ? existing.status : "Active"}>
                <option>Active</option>
                <option>Inactive</option>
              </Select>
            </Field>
          </div>
          <Field label="Description">
            <Textarea
              defaultValue={isEditing ? existing.description : ""}
              placeholder="Describe the intended operational scope of this role."
              className="mt-1 min-h-24"
            />
          </Field>
          <div className="mt-7 border-t border-[#e7ece7] pt-5">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#72827e]">
                  Permission assignment
                </p>
                <p className="mt-1 text-sm text-[#6d7d78]">
                  {selected.length} permissions selected
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="text-[#0e5a4f]"
                onClick={() => setSelected([])}
              >
                Clear selection
              </Button>
            </div>
            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              {Object.entries(grouped).map(([group, groupPermissions]) => (
                <section
                  key={group}
                  className="rounded-lg border border-[#e1e8e2] bg-[#fbfcfa] p-4"
                >
                  <p className="text-xs font-bold uppercase tracking-[0.13em] text-[#63746f]">
                    {group}
                  </p>
                  <div className="mt-3 grid gap-2">
                    {groupPermissions.map((permission) => (
                      <label
                        key={permission.id}
                        className="flex cursor-pointer gap-3 rounded-md p-2 transition hover:bg-[#eff6f2]"
                      >
                        <input
                          type="checkbox"
                          checked={selected.includes(permission.name)}
                          onChange={() => toggle(permission.name)}
                          className="mt-0.5 h-4 w-4 accent-[#0e5a4f]"
                        />
                        <span>
                          <span className="block text-sm font-semibold text-[#2b4a43]">
                            {permission.label}
                          </span>
                          <span className="mt-0.5 block text-xs leading-5 text-[#74837e]">
                            {permission.description}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
          <div className="mt-7 flex justify-end gap-3 border-t border-[#e6ece6] pt-5">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/admin/roles")}
            >
              Cancel
            </Button>
            <Button type="submit" className="bg-[#0e5a4f] hover:bg-[#0a4a40]">
              <Save className="mr-2 h-4 w-4" />
              Save role
            </Button>
          </div>
        </form>
      </RecordCard>
    </>
  );
}
function PermissionListPage() {
  const [search, setSearch] = useState("");
  const { items: livePermissions, loading: permissionsLoading } = useLiveCollection(
    "/v1/admin/permissions",
    permissions,
    (item) => ({
      ...item,
      label: item.label ?? item.name,
      group: item.group ?? "General",
      description: item.description ?? "",
      status: item.status ?? "Active",
    }),
  );
  const filtered = livePermissions.filter((permission) =>
    `${permission.label} ${permission.name} ${permission.group}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Permissions"
        description="Granular keys for future Laravel authorization. This interface records intent; the API must determine actual access."
      />
      <FilterBand onClear={() => setSearch("")}>
        <FilterField label="Search permission">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, label, or group"
          />
        </FilterField>
      </FilterBand>
      {permissionsLoading ? (
        <LoadingState title="Loading permissions…" />
      ) : (
      <DataTable
        records={filtered}
        rowLabel="permissions"
        columns={[
          {
            key: "name",
            label: "Key",
            render: (record) => (
              <code className="rounded bg-[#edf3ef] px-2 py-1 text-xs font-bold text-[#0e5a4f]">
                {String(record.name)}
              </code>
            ),
          },
          {
            key: "label",
            label: "Permission",
            render: (record) => (
              <span className="font-semibold text-[#294a43]">
                {String(record.label)}
              </span>
            ),
          },
          { key: "group", label: "Group" },
          { key: "description", label: "Description", className: "min-w-80" },
          {
            key: "status",
            label: "Status",
            render: (record) => <StatusBadge value={record.status} />,
          },
        ]}
      />
      )}
    </>
  );
}
function AuditLogPage() {
  const [search, setSearch] = useState("");
  const [module, setModule] = useState("all");
  const { items: liveAuditLogs, loading: auditLogsLoading } = useLiveCollection(
    "/v1/admin/audit-logs",
    auditLogs,
    (entry) => ({
      ...entry,
      occurredAt: entry.created_at ?? entry.occurredAt,
      user: entry.user?.name ?? entry.user,
      action: entry.action,
      module: entry.module ?? String(entry.action ?? "").split(".")[0],
      description: entry.metadata
        ? JSON.stringify(entry.metadata)
        : (entry.description ?? ""),
      ip: entry.ip_address ?? entry.ip ?? "—",
      record: entry.auditable_id ?? entry.record ?? "—",
    }),
  );
  const filtered = liveAuditLogs.filter(
    (entry) =>
      Object.values(entry)
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (module === "all" || entry.module === module),
  );
  return (
    <>
      <PageHeader
        eyebrow="Read-only administrative evidence"
        title="Audit logs"
        description="A read-only record of authorized administrative activity. Backend logging, retention, and IP policy remain Laravel responsibilities."
      />
      <FilterBand
        onClear={() => {
          setSearch("");
          setModule("all");
        }}
      >
        <FilterField label="Search log content">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search user, action, or description"
          />
        </FilterField>
        <FilterField label="Module">
          <Select
            value={module}
            onChange={(event) => setModule(event.target.value)}
          >
            <option value="all">All modules</option>
            {Array.from(
              new Set(liveAuditLogs.map((entry) => String(entry.module))),
            ).map((item) => (
              <option key={item}>{item}</option>
            ))}
          </Select>
        </FilterField>
        <FilterField label="Date range">
          <Input type="date" aria-label="Audit date filter" />
        </FilterField>
      </FilterBand>
      {auditLogsLoading ? (
        <LoadingState title="Loading audit logs…" />
      ) : (
      <DataTable
        records={filtered}
        rowLabel="audit records"
        columns={[
          {
            key: "occurredAt",
            label: "Date & time",
            className: "whitespace-nowrap",
          },
          {
            key: "user",
            label: "User",
            render: (record) => (
              <span className="font-semibold text-[#284841]">
                {String(record.user)}
              </span>
            ),
          },
          {
            key: "action",
            label: "Action",
            render: (record) => <StatusBadge value={record.action} />,
          },
          { key: "module", label: "Module" },
          { key: "description", label: "Description", className: "min-w-80" },
          { key: "ip", label: "IP address" },
          { key: "record", label: "Related record" },
        ]}
      />
      )}
    </>
  );
}
function ViolationListPage() {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const { items: liveViolations, loading: violationsLoading } = useLiveCollection(
    "/v1/admin/violations",
    violations,
    (entry) => ({
      ...entry,
      occurredAt: entry.occurred_at ?? entry.occurredAt,
      studentName: entry.attempt?.student?.name ?? entry.studentName ?? "—",
      studentId: entry.attempt?.student?.student_id ?? entry.studentId ?? "—",
      type: entry.type,
      attemptId: entry.attempt_id ?? entry.attemptId ?? "—",
    }),
  );
  const filtered = liveViolations.filter(
    (entry) =>
      Object.values(entry)
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (type === "all" || entry.type === type),
  );
  return (
    <>
      <PageHeader
        eyebrow="Exam integrity events"
        title="Violations"
        description="A read-only record of security events reported during student exam attempts, including focus loss, fullscreen exits, and detected screenshot attempts. Screenshot detection is a best-effort deterrent, not a guarantee — it cannot block or catch every screenshot method."
      />
      <FilterBand
        onClear={() => {
          setSearch("");
          setType("all");
        }}
      >
        <FilterField label="Search student or attempt">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search student, ID, or attempt"
          />
        </FilterField>
        <FilterField label="Event type">
          <Select
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="all">All event types</option>
            {Array.from(
              new Set(liveViolations.map((entry) => String(entry.type))),
            ).map((item) => (
              <option key={item}>{item}</option>
            ))}
          </Select>
        </FilterField>
      </FilterBand>
      {violationsLoading ? (
        <LoadingState title="Loading violations…" />
      ) : (
      <DataTable
        records={filtered}
        rowLabel="violation records"
        columns={[
          {
            key: "occurredAt",
            label: "Date & time",
            className: "whitespace-nowrap",
          },
          {
            key: "studentName",
            label: "Student",
            render: (record) => (
              <span className="font-semibold text-[#284841]">
                {String(record.studentName)}
              </span>
            ),
          },
          { key: "studentId", label: "Student ID" },
          {
            key: "type",
            label: "Event type",
            render: (record) => <StatusBadge value={record.type} />,
          },
          { key: "attemptId", label: "Attempt ID" },
        ]}
      />
      )}    </>
  );
}
function ReportsPage() {
  const [rounds, setRounds] = useState(() => getAcademicRecords().rounds);
  const [round, setRound] = useState("all");
  const [activeReport, setActiveReport] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [exporting, setExporting] = useState(false);
  useEffect(() => {
    const refresh = () => setRounds(getAcademicRecords().rounds);
    window.addEventListener(academicUpdateEvent, refresh);
    return () => window.removeEventListener(academicUpdateEvent, refresh);
  }, []);
  const filters = useMemo(
    () => ({ round: round === "all" ? "" : round }),
    [round],
  );
  const prepareReport = (type) => {
    setActiveReport(type);
    setLoading(true);
    setLoadError("");
    const request =
      type === "batch"
        ? reportService.batchSummary(filters)
        : reportService.examSummary(filters);
    request
      .then((items) =>
        setRows(
          Array.isArray(items)
            ? items.map((item) => ({
                ...item,
                id: item.batch_id ?? item.exam_id,
              }))
            : [],
        ),
      )
      .catch((error) => {
        setRows([]);
        setLoadError(
          error?.response?.data?.message ??
            "The report could not be loaded from the Laravel API.",
        );
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    if (activeReport) prepareReport(activeReport);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);
  const runExport = () => {
    setExporting(true);
    reportService
      .exportCsv(filters)
      .then(() => toast.success("Result export CSV downloaded."))
      .catch((error) =>
        toast.error(
          error?.response?.data?.message ??
            "The result export could not be prepared.",
        ),
      )
      .finally(() => setExporting(false));
  };
  const cards = [
    {
      key: "batch",
      title: "Batch-wise report",
      description: "Summarize authorized examination outcomes by batch.",
      action: () => prepareReport("batch"),
    },
    {
      key: "exam",
      title: "Exam-wise report",
      description: "Review an assessment cohort across a selected examination.",
      action: () => prepareReport("exam"),
    },
    {
      key: "export",
      title: "Result export",
      description:
        "Download a CSV of authorized result records for the selected round.",
      action: runExport,
      busy: exporting,
      label: "Download CSV",
    },
  ];
  return (
    <>
      <PageHeader
        eyebrow="Reporting"
        title="Reports"
        description="Batch-wise and exam-wise summaries are calculated live from authorized result records."
      />
      <FilterBand onClear={() => setRound("all")}>
        <FilterField label="Round">
          <select
            value={round}
            onChange={(event) => setRound(event.target.value)}
            className="h-10 w-full rounded-md border border-[#d6ded7] bg-white px-3 text-sm text-[#2f4d47] outline-none focus:ring-2 focus:ring-[#0e5a4f]/30"
          >
            <option value="all">All rounds</option>
            {rounds.map((item) => (
              <option key={item.id} value={item.code}>
                {item.code} · {item.name}
              </option>
            ))}
          </select>
        </FilterField>
      </FilterBand>
      <div className="grid gap-5 lg:grid-cols-3">
        {cards.map(({ key, title, description, action, busy, label }) => (
          <RecordCard
            key={key}
            className={`p-6 ${activeReport === key ? "ring-2 ring-[#0e5a4f]/40" : ""}`}
          >
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-[#e8f2ed] text-[#0e5a4f]">
              <FileBarChart2 className="h-5 w-5" />
            </div>
            <h3 className="mt-5 font-serif text-xl font-semibold text-[#24453f]">
              {title}
            </h3>
            <p className="mt-2 text-sm leading-6 text-[#687a75]">
              {description}
            </p>
            <Button
              variant="outline"
              className="mt-5"
              disabled={busy}
              onClick={action}
            >
              {busy ? "Preparing…" : (label ?? "Prepare report")}
            </Button>
          </RecordCard>
        ))}
      </div>
      {activeReport === "batch" && (
        <div className="mt-5">
          {loading ? (
            <RecordCard className="p-8 text-center font-semibold text-[#295148]">
              Loading batch-wise report…
            </RecordCard>
          ) : loadError ? (
            <RecordCard className="border-rose-200 bg-rose-50 p-8 text-center text-sm text-rose-800">
              {loadError}
            </RecordCard>
          ) : (
            <>
              <div className="mb-3 flex justify-end">
                <Button variant="outline" onClick={() => buildReportPdf(rows, "batch", round)}>
                  <Download className="mr-1.5 h-4 w-4" />Download PDF
                </Button>
              </div>
              <DataTable
                records={rows}
                rowLabel="batches"
                columns={[
                  { key: "batch", label: "Batch", className: "min-w-52 text-center" },
                  { key: "course", label: "Course", className: "border-l border-[#e3e9e3] text-center" },
                  { key: "students_assigned", label: "Students", className: "border-l border-[#e3e9e3] text-center" },
                  { key: "results_recorded", label: "Attempted", className: "border-l border-[#e3e9e3] text-center" },
                  { key: "average_external", label: "Avg. External", className: "border-l border-[#e3e9e3] text-center" },
                  { key: "average_evidence", label: "Avg. Evidence", className: "border-l border-[#e3e9e3] text-center" },
                  { key: "pass", label: "Pass", className: "border-l border-[#e3e9e3] text-center" },
                  { key: "fail", label: "Fail", className: "border-l border-[#e3e9e3] text-center" },
                  { key: "absent", label: "Absent", className: "border-l border-[#e3e9e3] text-center" },
                  {
                    key: "pass_rate",
                    label: "Pass rate",
                    className: "border-l border-[#e3e9e3] text-center",
                    render: (record) => `${record.pass_rate}%`,
                  },
                ]}
              />
            </>
          )}
        </div>
      )}
      {activeReport === "exam" && (
        <div className="mt-5">
          {loading ? (
            <RecordCard className="p-8 text-center font-semibold text-[#295148]">
              Loading exam-wise report…
            </RecordCard>
          ) : loadError ? (
            <RecordCard className="border-rose-200 bg-rose-50 p-8 text-center text-sm text-rose-800">
              {loadError}
            </RecordCard>
          ) : (
            <>
              <div className="mb-3 flex justify-end">
                <Button variant="outline" onClick={() => buildReportPdf(rows, "exam", round)}>
                  <Download className="mr-1.5 h-4 w-4" />Download PDF
                </Button>
              </div>
              <DataTable
                records={rows}
                rowLabel="exams"
                columns={[
                  { key: "exam", label: "Exam", className: "min-w-52 text-center" },
                  { key: "exam_number", label: "No.", className: "border-l border-[#e3e9e3] text-center" },
                  { key: "exam_type", label: "Type", className: "border-l border-[#e3e9e3] text-center", render: (record) => (String(record.exam_type).toUpperCase() === "MONTHLY" ? "Monthly" : "Mid Monthly") },
                  { key: "course", label: "Course", className: "border-l border-[#e3e9e3] text-center" },
                  { key: "batch", label: "Batch", className: "border-l border-[#e3e9e3] text-center" },
                  { key: "students_assigned", label: "Students", className: "border-l border-[#e3e9e3] text-center" },
                  { key: "attempts", label: "Attempted", className: "border-l border-[#e3e9e3] text-center" },
                  { key: "average_external", label: "Avg. External", className: "border-l border-[#e3e9e3] text-center" },
                  { key: "external_pass", label: "Ext. pass", className: "border-l border-[#e3e9e3] text-center" },
                  { key: "external_fail", label: "Ext. fail", className: "border-l border-[#e3e9e3] text-center" },
                  { key: "average_evidence", label: "Avg. Evidence", className: "border-l border-[#e3e9e3] text-center" },
                  { key: "evidence_pass", label: "Evi. pass", className: "border-l border-[#e3e9e3] text-center" },
                  { key: "evidence_fail", label: "Evi. fail", className: "border-l border-[#e3e9e3] text-center" },
                  { key: "pass", label: "Pass", className: "border-l border-[#e3e9e3] text-center" },
                  { key: "fail", label: "Fail", className: "border-l border-[#e3e9e3] text-center" },
                  { key: "absent", label: "Absent", className: "border-l border-[#e3e9e3] text-center" },
                  {
                    key: "pass_rate",
                    label: "Pass rate",
                    className: "border-l border-[#e3e9e3] text-center",
                    render: (record) => `${record.pass_rate}%`,
                  },
                ]}
              />
            </>
          )}
        </div>
      )}
    </>
  );
}
function SettingsPage() {
  const [apiConfig, setApiConfig] = useState(() => getLaravelApiConfig());
  const [error, setError] = useState("");
  const saveApiConfig = () => {
    try {
      const saved = setLaravelApiConfig(apiConfig);
      setApiConfig(saved);
      setError("");
      toast.success("Laravel API connection saved.", {
        description: `Requests will use ${saved.baseUrl}.`,
      });
    } catch (saveError) {
      setError(
        saveError.message ??
          "The Laravel API configuration could not be saved.",
      );
    }
  };
  const restoreDefault = () => {
    const restored = resetLaravelApiConfig();
    setApiConfig(restored);
    setError("");
    toast.info("API configuration restored from the environment defaults.");
  };

  // System-wide settings (grading, branding, security, data, notifications)
  // -- Super Admin only, per SettingsController. A course-scoped admin
  // still sees this page (it's not gated in the router) but the fetch
  // below will come back with a permission error, shown as a plain notice
  // instead of a broken/empty form.
  const [settings, setSettings] = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState("");
  const [grading, setGrading] = useState(null);
  const [branding, setBranding] = useState(null);
  const [security, setSecurity] = useState(null);
  const [dataSettings, setDataSettings] = useState(null);
  const [notifications, setNotifications] = useState(null);
  const [savingSection, setSavingSection] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef(null);
  const [purging, setPurging] = useState(false);
  const [downloadingBackup, setDownloadingBackup] = useState(false);

  const loadSettings = () => {
    setSettingsLoading(true);
    settingsService
      .get()
      .then((data) => {
        setSettings(data);
        setGrading(data.grading);
        setBranding(data.branding);
        setSecurity(data.security);
        setDataSettings(data.data);
        setNotifications(data.notifications);
        setSettingsError("");
      })
      .catch((err) => {
        setSettingsError(
          err?.response?.data?.message ??
            "System settings could not be loaded. This section is restricted to Super Admin.",
        );
      })
      .finally(() => setSettingsLoading(false));
  };
  useEffect(loadSettings, []);

  const saveSection = (section, payload) => {
    setSavingSection(section);
    settingsService
      .update(payload)
      .then((data) => {
        setSettings(data);
        setGrading(data.grading);
        setBranding(data.branding);
        setSecurity(data.security);
        setDataSettings(data.data);
        setNotifications(data.notifications);
        toast.success("Settings saved.");
      })
      .catch((err) => {
        toast.error(
          err?.response?.data?.message ?? "Settings could not be saved.",
        );
      })
      .finally(() => setSavingSection(""));
  };

  const handleLogoChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    settingsService
      .uploadLogo(file)
      .then((data) => {
        setBranding((current) => ({ ...current, logo_url: data.logo_url }));
        toast.success("Institution logo updated.");
      })
      .catch((err) => {
        toast.error(err?.response?.data?.message ?? "Logo upload failed.");
      })
      .finally(() => {
        setUploadingLogo(false);
        event.target.value = "";
      });
  };

  const handlePurgeAuditLogs = () => {
    setPurging(true);
    settingsService
      .purgeAuditLogs()
      .then((data) => {
        toast.success(`Removed ${data.deleted} old audit log ${data.deleted === 1 ? "entry" : "entries"}.`);
      })
      .catch((err) => {
        toast.error(err?.response?.data?.message ?? "Could not purge audit logs.");
      })
      .finally(() => setPurging(false));
  };

  const handleDownloadBackup = () => {
    setDownloadingBackup(true);
    settingsService
      .downloadBackup()
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `isdb-bisew-backup-${new Date().toISOString().slice(0, 10)}.zip`;
        link.click();
        window.URL.revokeObjectURL(url);
        toast.success("Backup downloaded.");
      })
      .catch((err) => {
        toast.error(err?.message ?? "Backup could not be generated.");
      })
      .finally(() => setDownloadingBackup(false));
  };

  return (
    <>
      <PageHeader
        eyebrow="System"
        title="Settings"
        description="Configure grading rules, institution branding, student security policy, and data management for the whole system."
      />

      {settingsLoading ? (
        <RecordCard className="mt-5 p-8 text-center font-semibold text-[#295148]">
          Loading system settings…
        </RecordCard>
      ) : settingsError ? (
        <RecordCard className="mt-5 border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          {settingsError}
        </RecordCard>
      ) : (
        <div className="mt-5 grid gap-5">
          {/* Grading */}
          <RecordCard className="p-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#71827c]">
              Grading
            </p>
            <h3 className="mt-1 font-serif text-2xl font-semibold text-[#24453f]">
              Pass marks &amp; weights
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#687a75]">
              Controls the Mid Monthly component pass mark, the Final Result weighting between Mid Monthly and Monthly, and the Final Result pass mark — used everywhere in Result Management and Reports.
            </p>
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Mid Monthly pass mark">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={grading.mid_pass_mark}
                  onChange={(e) => setGrading((c) => ({ ...c, mid_pass_mark: e.target.value }))}
                />
              </Field>
              <Field label="Mid Monthly weight (%)">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={grading.mid_weight_percent}
                  onChange={(e) => setGrading((c) => ({ ...c, mid_weight_percent: e.target.value }))}
                />
              </Field>
              <Field label="Monthly weight (%)">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={grading.monthly_weight_percent}
                  onChange={(e) => setGrading((c) => ({ ...c, monthly_weight_percent: e.target.value }))}
                />
              </Field>
              <Field label="Final Result pass mark">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={grading.component_pass_threshold}
                  onChange={(e) => setGrading((c) => ({ ...c, component_pass_threshold: e.target.value }))}
                />
              </Field>
            </div>
            <p className="mt-3 text-xs text-[#8a9a94]">
              Mid Monthly weight + Monthly weight must add up to 100%.
            </p>
            <div className="mt-5">
              <Button
                disabled={savingSection === "grading"}
                onClick={() =>
                  saveSection("grading", {
                    "grading.mid_pass_mark": Number(grading.mid_pass_mark),
                    "grading.mid_weight_percent": Number(grading.mid_weight_percent),
                    "grading.monthly_weight_percent": Number(grading.monthly_weight_percent),
                    "grading.component_pass_threshold": Number(grading.component_pass_threshold),
                  })
                }
              >
                <Save className="mr-2 h-4 w-4" />
                {savingSection === "grading" ? "Saving…" : "Save grading settings"}
              </Button>
            </div>
          </RecordCard>

          {/* Branding */}
          <RecordCard className="p-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#71827c]">
              Branding
            </p>
            <h3 className="mt-1 font-serif text-2xl font-semibold text-[#24453f]">
              Institution identity
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#687a75]">
              Shown on the printed/PDF result sheets and reports.
            </p>
            <div className="mt-6 flex flex-wrap items-start gap-6">
              <div className="flex flex-col items-center gap-2">
                <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-lg border border-[#dce5de] bg-[#fafcf9]">
                  {branding.logo_url ? (
                    <img src={branding.logo_url} alt="Institution logo" className="h-full w-full object-contain" />
                  ) : (
                    <span className="text-[10px] text-[#9aa9a3]">No logo</span>
                  )}
                </div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingLogo}
                  onChange={handleLogoChange}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploadingLogo}
                  onClick={() => logoInputRef.current?.click()}
                >
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                  {uploadingLogo ? "Uploading…" : branding.logo_url ? "Change logo" : "Upload logo"}
                </Button>
              </div>
              <div className="grid flex-1 gap-5 sm:grid-cols-2">
                <Field label="Institution name">
                  <Input
                    value={branding.institution_name}
                    onChange={(e) => setBranding((c) => ({ ...c, institution_name: e.target.value }))}
                  />
                </Field>
                <Field label="Subtitle">
                  <Input
                    value={branding.institution_subtitle}
                    onChange={(e) => setBranding((c) => ({ ...c, institution_subtitle: e.target.value }))}
                  />
                </Field>
              </div>
            </div>
            <div className="mt-5">
              <Button
                disabled={savingSection === "branding"}
                onClick={() =>
                  saveSection("branding", {
                    "branding.institution_name": branding.institution_name,
                    "branding.institution_subtitle": branding.institution_subtitle,
                  })
                }
              >
                <Save className="mr-2 h-4 w-4" />
                {savingSection === "branding" ? "Saving…" : "Save branding"}
              </Button>
            </div>
          </RecordCard>

          {/* Security */}
          <RecordCard className="p-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#71827c]">
              Security
            </p>
            <h3 className="mt-1 font-serif text-2xl font-semibold text-[#24453f]">
              Student login &amp; exam policy
            </h3>
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Max failed logins before lock">
                <Input
                  type="number"
                  min="1"
                  value={security.student_max_failed_logins}
                  onChange={(e) => setSecurity((c) => ({ ...c, student_max_failed_logins: e.target.value }))}
                />
              </Field>
              <Field label="Account lock duration (minutes)">
                <Input
                  type="number"
                  min="1"
                  value={security.student_lock_minutes}
                  onChange={(e) => setSecurity((c) => ({ ...c, student_lock_minutes: e.target.value }))}
                />
              </Field>
              <Field label="Student session expiry (minutes)">
                <Input
                  type="number"
                  min="5"
                  value={security.student_token_expiration_minutes}
                  onChange={(e) => setSecurity((c) => ({ ...c, student_token_expiration_minutes: e.target.value }))}
                />
              </Field>
              <Field label="Violation duplicate window (seconds)">
                <Input
                  type="number"
                  min="1"
                  value={security.violation_duplicate_window_seconds}
                  onChange={(e) => setSecurity((c) => ({ ...c, violation_duplicate_window_seconds: e.target.value }))}
                />
              </Field>
              <Field label="Max active students per batch">
                <Input
                  type="number"
                  min="1"
                  value={security.batch_active_capacity}
                  onChange={(e) => setSecurity((c) => ({ ...c, batch_active_capacity: e.target.value }))}
                />
              </Field>
            </div>
            <div className="mt-5">
              <Button
                disabled={savingSection === "security"}
                onClick={() =>
                  saveSection("security", {
                    "security.student_max_failed_logins": Number(security.student_max_failed_logins),
                    "security.student_lock_minutes": Number(security.student_lock_minutes),
                    "security.student_token_expiration_minutes": Number(security.student_token_expiration_minutes),
                    "security.violation_duplicate_window_seconds": Number(security.violation_duplicate_window_seconds),
                    "security.batch_active_capacity": Number(security.batch_active_capacity),
                  })
                }
              >
                <Save className="mr-2 h-4 w-4" />
                {savingSection === "security" ? "Saving…" : "Save security settings"}
              </Button>
            </div>
          </RecordCard>

          {/* Data management */}
          <RecordCard className="p-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#71827c]">
              Data management
            </p>
            <h3 className="mt-1 font-serif text-2xl font-semibold text-[#24453f]">
              Backups &amp; audit log retention
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#687a75]">
              This exports the core tables as a CSV bundle (students, courses, batches, exams, results, evidence, violations, users) — not a raw database dump, since shell access to a database tool can't be assumed on every server.
            </p>
            <div className="mt-6 flex flex-wrap items-end gap-5">
              <Field label="Keep audit logs for (days, blank = forever)">
                <Input
                  type="number"
                  min="7"
                  value={dataSettings.audit_log_retention_days ?? ""}
                  onChange={(e) => setDataSettings((c) => ({ ...c, audit_log_retention_days: e.target.value }))}
                  placeholder="Forever"
                />
              </Field>
              <Button
                variant="outline"
                disabled={savingSection === "data"}
                onClick={() =>
                  saveSection("data", {
                    "data.audit_log_retention_days": dataSettings.audit_log_retention_days ? Number(dataSettings.audit_log_retention_days) : null,
                  })
                }
              >
                <Save className="mr-2 h-4 w-4" />
                {savingSection === "data" ? "Saving…" : "Save retention"}
              </Button>
              <Button variant="outline" disabled={purging} onClick={handlePurgeAuditLogs}>
                {purging ? "Purging…" : "Purge old audit logs now"}
              </Button>
              <Button disabled={downloadingBackup} onClick={handleDownloadBackup}>
                <Download className="mr-2 h-4 w-4" />
                {downloadingBackup ? "Preparing…" : "Download data backup"}
              </Button>
            </div>
          </RecordCard>

          {/* Notifications */}
          <RecordCard className="border-amber-200 bg-amber-50 p-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-800">
              Notifications
            </p>
            <h3 className="mt-1 font-serif text-2xl font-semibold text-[#24453f]">
              Alerts
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-amber-900">
              No email or SMS provider is connected to this app yet, so an address saved here isn't actually sent anything until that's set up (needs SMTP or an SMS gateway's credentials). Saving it now just reserves where alerts will go once delivery is wired up.
            </p>
            <div className="mt-5 max-w-sm">
              <Field label="Alert email">
                <Input
                  type="email"
                  value={notifications.alert_email ?? ""}
                  onChange={(e) => setNotifications((c) => ({ ...c, alert_email: e.target.value }))}
                  placeholder="admin@example.org"
                />
              </Field>
            </div>
            <div className="mt-5">
              <Button
                variant="outline"
                disabled={savingSection === "notifications"}
                onClick={() =>
                  saveSection("notifications", {
                    "notifications.alert_email": notifications.alert_email || null,
                  })
                }
              >
                <Save className="mr-2 h-4 w-4" />
                {savingSection === "notifications" ? "Saving…" : "Save"}
              </Button>
            </div>
          </RecordCard>
        </div>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <RecordCard className="p-6">
          <div className="flex items-start gap-4">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#e8f2ed] text-[#0e5a4f]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#71827c]">
                Integration
              </p>
              <h3 className="mt-1 font-serif text-2xl font-semibold text-[#24453f]">
                Laravel API connection
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#687a75]">
                Use a complete API base URL such as{" "}
                <code className="rounded bg-[#eef4ef] px-1.5 py-0.5 text-[#245047]">
                  https://api.example.org/api
                </code>
                . This browser setting is stored only on the current device and
                does not contain API secrets.
              </p>
            </div>
          </div>
          <div className="mt-7 space-y-5">
            <Field label="Laravel API Base URL">
              <Input
                value={apiConfig.baseUrl}
                onChange={(event) =>
                  setApiConfig((current) => ({
                    ...current,
                    baseUrl: event.target.value,
                  }))
                }
                placeholder="https://api.example.org/api"
              />
            </Field>
            <p className="rounded-lg border border-[#dce5de] bg-[#fafcf9] p-4 text-sm leading-6 text-[#3d5851]">
              This project always reads and writes real data through the Laravel
              API — demonstration/mock data is disabled everywhere.
            </p>
            {error && (
              <p
                role="alert"
                className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
              >
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={saveApiConfig}
                className="bg-[#0e5a4f] hover:bg-[#0a4a40]"
              >
                <Save className="mr-2 h-4 w-4" />
                Save API settings
              </Button>
              <Button variant="outline" onClick={restoreDefault}>
                Restore defaults
              </Button>
            </div>
          </div>
        </RecordCard>
        <RecordCard className="p-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#71827c]">
            Current connection
          </p>
          <dl className="mt-5 space-y-4 text-sm">
            <div className="border-b border-[#e7ece7] pb-3">
              <dt className="text-[#71827c]">Mode</dt>
              <dd className="mt-1 font-semibold text-[#24463f]">
                Live Laravel API
              </dd>
            </div>
            <div className="border-b border-[#e7ece7] pb-3">
              <dt className="text-[#71827c]">Base URL</dt>
              <dd className="mt-1 break-all font-mono text-xs text-[#24463f]">
                {apiConfig.baseUrl}
              </dd>
            </div>
            <div>
              <dt className="text-[#71827c]">Implemented live attempt calls</dt>
              <dd className="mt-1 leading-6 text-[#536b64]">
                Student answer save, final submission, and security-violation
                reporting.
              </dd>
            </div>
          </dl>
        </RecordCard>
      </div>
    </>
  );
}
const UserListPage = CourseScopedUserListPage;
const UserFormPage = CourseScopedUserFormPage;
export {
  AuditLogPage,
  PermissionListPage,
  ReportsPage,
  ResultDetailPage,
  ResultListPage,
  RoleFormPage,
  RoleListPage,
  SettingsPage,
  UserFormPage,
  UserListPage,
  ViolationListPage,
};