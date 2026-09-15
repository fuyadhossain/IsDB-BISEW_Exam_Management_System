/** Results workspace style: exact cohort context is chosen first, then authoritative records are fetched and exported with traceable naming. */
import { useEffect, useMemo, useState } from "react";
import { Download, Eye, Printer } from "lucide-react";
import { jsPDF } from "jspdf";
import { Link, useLocation, useSearch } from "wouter";
import { toast } from "sonner";
import { reportService, resultService } from "@/services/services";
import { useAuth } from "@/contexts/AuthContext";
import { scopeRecords } from "@/lib/course-scope";
import { DataTable, FilterBand, FilterField, PageHeader, RecordCard, StatusBadge } from "@/components/admin-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
// Same brand mark used across the app's own header (see app-shell) — reused
// here so the printed result sheet is instantly recognizable as an
// official IsDB-BISEW document at a glance, not just plain text in a
// browser-generated PDF. It lives in /public, so — same as app-shell.jsx
// — it's referenced by its served URL, not a bundler import.
const BRAND_LOGO_URL = "/manus-storage/isdb-bisew-brand-logo_29718725.png";
// Module-level (not component state) so it survives the list component
// being unmounted when the admin opens a result's Details page and
// remounted when they come back. Without this, every "Back" press waited
// on a fresh network round-trip even though the exact same roster had
// just been fetched moments ago. Keyed by the filter combination that
// determines the roster query, so switching Course/Round/Batch/Exam still
// fetches properly — only returning to an already-seen combination is
// instant.
//
// Also mirrored into sessionStorage: a plain in-memory Map is wiped by an
// actual full page reload (not just an SPA route change) — e.g. the
// browser's own Back button occasionally reloading the page instead of
// re-running client-side routing, or the admin just pressing F5 on the
// Details page. sessionStorage survives that (it's cleared only when the
// tab/window itself closes), so "Back" still shows the previous roster
// instantly even after a hard reload, not just an in-app navigation.
const ROSTER_CACHE_STORAGE_KEY = "isdb-bisew:results-roster-cache";
const loadRosterCacheFromStorage = () => {
  try {
    const raw = window.sessionStorage.getItem(ROSTER_CACHE_STORAGE_KEY);
    return raw ? new Map(Object.entries(JSON.parse(raw))) : new Map();
  } catch {
    // Storage disabled, quota exceeded, or corrupted JSON from a previous
    // version of this cache -- fall back to a plain in-memory cache for
    // this tab instead of breaking the page over a "nice to have".
    return new Map();
  }
};
const rosterCache = loadRosterCacheFromStorage();
const persistRosterCache = () => {
  try {
    window.sessionStorage.setItem(ROSTER_CACHE_STORAGE_KEY, JSON.stringify(Object.fromEntries(rosterCache)));
  } catch {
    // Same reasoning as above -- a failed write just means this entry
    // won't survive a hard reload, not a broken page.
  }
};
const setRosterCache = (key, value) => {
  rosterCache.set(key, value);
  persistRosterCache();
};
const rosterCacheKey = (course, batch, round, examNumber, examType) =>
  `${course}|${batch}|${round}|${examNumber}|${examType}`;

// Same reasoning as rosterCache above, for the filter dropdowns' own
// options (Course/Round/Batch/Exam). Without this, `catalog` restarted
// from `[]` on every remount (e.g. Back from Details), so the dropdowns
// briefly went blank/reset even though the selected course/batch/etc.
// values were already correctly restored from the URL -- only the list
// of *available options* to match them against was missing for a moment.
const CATALOG_CACHE_STORAGE_KEY = "isdb-bisew:results-catalog-cache";
const loadCatalogCacheFromStorage = () => {
  try {
    const raw = window.sessionStorage.getItem(CATALOG_CACHE_STORAGE_KEY);
    return raw ? new Map(Object.entries(JSON.parse(raw))) : new Map();
  } catch {
    return new Map();
  }
};
const catalogCache = loadCatalogCacheFromStorage();
const setCatalogCache = (key, value) => {
  catalogCache.set(key, value);
  try {
    window.sessionStorage.setItem(CATALOG_CACHE_STORAGE_KEY, JSON.stringify(Object.fromEntries(catalogCache)));
  } catch {
    // Storage disabled/quota exceeded -- just won't survive a hard reload.
  }
};

const Select = ({ children, ...props }) => <select {...props} className="h-10 w-full rounded-md border border-[#d6ded7] bg-white px-3 text-sm text-[#2f4d47] outline-none focus:ring-2 focus:ring-[#0e5a4f]/30">{children}</select>;
const safeFilePart = (value) => String(value || "not-selected").trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();

// Exactly 15 student rows per page, like a real printed result sheet —
// the previous version just kept drawing rows until it ran out of
// vertical space (~27-28 rows before overflowing), which never matched
// a fixed "15 per page" layout and made every page a different length.
const ROWS_PER_PAGE = 15;
const ROW_HEIGHT = 9;
const TABLE_LEFT = 20;
const TABLE_WIDTH = 170;
// A one-line title tucked at the very top used to be the ONLY thing that
// identified whose result sheet this was — no logo, no institute name in
// a real letterhead sense, and no round/exam-type context, so a printed
// page told you almost nothing on its own once separated from the app.
// HEADER_BOTTOM is where the table itself now starts, after a proper
// letterhead band with the crest, institute name, and a full context row.
const HEADER_BOTTOM = 62;

const loadImageDataUrl = (url) => new Promise((resolve, reject) => {
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

const buildResultPdf = async (records, context, view) => {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  // Attendance follows the tab that was open: MCQ = submitted attempt, Evidence = manual attended flag.
  const attendanceOf = (result) => (view === "evidence" ? (result.attended ? "P" : "A") : (result.status === "ABSENT" ? "A" : "P"));
  // Column edges for the Final Result PDF table (centers labels/values in each cell).
  // Final External/Final Evidence columns are commented out (not shown) --
  // uncomment combinedBounds2/combinedLabels2 below plus the two pdf.text
  // lines further down to restore them.
  // const combinedBounds = [20, 28, 44, 68, 82, 96, 110, 124, 138, 152, 166, 190];
  // const combinedLabels = ["SN", "ID", "Name", "External", "Evidence", "External", "Evidence", "Fin. Ext.", "Fin. Evi.", "Total", "Pass/Fail"];
  const combinedBounds = [20, 30, 48, 78, 96, 114, 132, 150, 168, 190];
  const combinedLabels = ["SN", "ID", "Name", "External", "Evidence", "External", "Evidence", "Total", "Pass/Fail"];
  const combinedMid = (index) => (combinedBounds[index] + combinedBounds[index + 1]) / 2;
  const plainBounds = [20, 32, 70, 130, 156, 190];
  const plainMid = (index) => (plainBounds[index] + plainBounds[index + 1]) / 2;
  const headers = view === "evidence"
    ? [["SN", plainMid(0)], ["Student ID", plainMid(1)], ["Student name", plainMid(2)], ["Evidence", plainMid(3)], ["Attend.", plainMid(4)]]
    : view === "combined"
      ? combinedLabels.map((label, index) => [label, combinedMid(index)])
      : [["SN", plainMid(0)], ["Student ID", plainMid(1)], ["Student name", plainMid(2)], ["External", plainMid(3)], ["Attend.", plainMid(4)]];
  const colDividers = view === "combined" ? combinedBounds.slice(1, -1) : plainBounds.slice(1, -1);
  // combinedRowOf reads the backend-computed finalResult -- never recalculated here.
  const combinedRowOf = (result) => result.finalResult ?? { complete: false };

  const logoDataUrl = await loadImageDataUrl(BRAND_LOGO_URL).catch(() => null);

  // Final Result's header mirrors the on-screen grouped header: a slim
  // label row on top ("Mid Monthly" / "Monthly" / "Final") and the
  // normal teal column-name row underneath.
  const groupBandsOf = (view) => (view === "combined" ? [
    { label: "Mid Monthly", from: combinedBounds[3], to: combinedBounds[5] },
    { label: "Monthly", from: combinedBounds[5], to: combinedBounds[7] },
    // { label: "Final", from: combinedBounds[7], to: combinedBounds[9] }, // commented out with Final External/Evidence
  ] : []);
  // Colors for each named group band, so "Mid Monthly" and "Monthly" read
  // as distinct blocks instead of one flat band -- cycles by band index in
  // case more group bands are added later.
  const groupBandColors = [
    [191, 224, 213], // Mid Monthly -- soft teal
    [250, 224, 178], // Monthly -- soft amber
    [206, 220, 240], // spare -- soft blue, if a third band is ever added
  ];
  const drawTableHeader = (y) => {
    const headerTop = y;
    const groupBands = groupBandsOf(view);
    if (groupBands.length) {
      pdf.setFillColor(241, 246, 242);
      pdf.rect(TABLE_LEFT, y, TABLE_WIDTH, 6, "F");
      groupBands.forEach((band, index) => {
        const [r, g, b] = groupBandColors[index % groupBandColors.length];
        pdf.setFillColor(r, g, b);
        pdf.rect(band.from, y, band.to - band.from, 6, "F");
      });
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      pdf.setTextColor(58, 88, 80);
      groupBands.forEach((band) => pdf.text(band.label, (band.from + band.to) / 2, y + 4, { align: "center" }));
      y += 6;
    }
    pdf.setFillColor(14, 90, 79);
    pdf.rect(TABLE_LEFT, y, TABLE_WIDTH, 8, "F");
    // Combined's labels are centered in narrower cells, so a slightly
    // smaller size keeps every label clear of the dividers on both
    // sides; the plain External/Evidence tables keep their original
    // size since their cells are wider and left-aligned.
    pdf.setFontSize(view === "combined" ? 7.5 : 9);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(255, 255, 255);
    // Every plain-table label is centered in its cell now, Name
    // included, matching the on-screen table and the Final Result PDF.
    headers.forEach(([label, x]) => pdf.text(label, x, y + 5.3, { align: "center" }));
    pdf.setTextColor(31, 61, 55);
    const bottom = y + 8;
    // Vertical dividers through the whole header block -- white on the
    // teal column row (every column boundary), but on the pale group
    // band above it only at each *group's own* left/right edge -- not at
    // every column boundary underneath, which used to draw a line
    // straight through the middle of "Mid Monthly"/"Monthly" (their
    // internal External|Evidence divider has nothing to do with the
    // group label sitting above it) -- then a thin rule closing off the
    // header from the body.
    pdf.setLineWidth(0.25);
    const groupEdges = new Set(groupBands.flatMap((band) => [band.from, band.to]));
    colDividers.forEach((x) => {
      if (groupBands.length && groupEdges.has(x)) { pdf.setDrawColor(211, 224, 216); pdf.line(x, headerTop, x, headerTop + 6); }
      pdf.setDrawColor(255, 255, 255);
      pdf.line(x, y, x, bottom);
    });
    pdf.setDrawColor(211, 224, 216);
    pdf.line(TABLE_LEFT, headerTop, TABLE_LEFT, bottom);
    pdf.line(TABLE_LEFT + TABLE_WIDTH, headerTop, TABLE_LEFT + TABLE_WIDTH, bottom);
    return bottom;
  };
  // A real letterhead: crest on the left, institute name/subtitle next to
  // it, a rule underneath, then a full row of the exam's own context
  // (course, batch, round, exam number, exam title/type) so the sheet
  // still identifies itself completely if it's ever printed, copied, or
  // separated from this screen.
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
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.text(`Page ${pageNumber} of ${totalPages}`, TABLE_LEFT + TABLE_WIDTH - 24, 16.5);
    pdf.text(`Generated ${new Date().toLocaleString()}`, TABLE_LEFT + TABLE_WIDTH - 60, 21.5);

    pdf.setDrawColor(14, 90, 79);
    pdf.setLineWidth(0.6);
    pdf.line(TABLE_LEFT, 27, TABLE_LEFT + TABLE_WIDTH, 27);

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11.5);
    pdf.setTextColor(31, 61, 55);
    pdf.text(`Result Summary · ${view === "evidence" ? "Evidence" : view === "combined" ? "Final Result" : "External"}`, TABLE_LEFT, 34);

    const fields = [
      ["Course", context.course],
      // The batch code itself already encodes the round (e.g.
      // "PWAD/CCSL-M/71/01" — course/TSP-shift/round/number), so a
      // separate "Round" field here just repeated the same number
      // that's already visible right inside the batch code.
      ["Batch", context.batch],
      ["Exam No.", context.examNumber],
    ];
    pdf.setFontSize(9);
    let fx = TABLE_LEFT;
    // Previously each field advanced by a fixed, guessed-at gap (e.g.
    // 22mm after "Course"), which was narrower than "Course: PWAD"
    // actually renders at this font size — so "Batch:" started drawing
    // right on top of the previous value with no visible space between
    // them. Measure each field's own rendered width (label + value) and
    // add a fixed breathing-room gap after it, so spacing stays correct
    // no matter how long any individual value (like the full batch code)
    // turns out to be.
    const FIELD_GAP = 10;
    fields.forEach(([label, value]) => {
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(90, 105, 99);
      pdf.text(`${label}:`, fx, 40.5);
      const labelWidth = pdf.getTextWidth(`${label}: `);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(31, 61, 55);
      const valueText = String(value || "—");
      pdf.text(valueText, fx + labelWidth + 1, 40.5);
      fx += labelWidth + 1 + pdf.getTextWidth(valueText) + FIELD_GAP;
    });
    // The exam number and type are already shown in the Course/Batch/
    // Round/Exam No. row above, so repeating "Examination 01 · MID_MONTHLY"
    // here was redundant — strip a trailing "Examination <number>" suffix
    // (the exam title's own naming convention, e.g. "Mid Monthly
    // Examination 01") and drop the exam type entirely, leaving just the
    // plain exam name (e.g. "Mid Monthly").
    const shortExamTitle = context.examTitle?.replace(/\s*Examination\s*\d*\s*$/i, "").trim();
    if (shortExamTitle) {
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(90, 105, 99);
      pdf.text("Examination:", TABLE_LEFT, 45.5);
      // Measure while still in the bold font the label was actually drawn
      // in — measuring after switching to the normal font (as this line
      // previously did) under-reports the label's real width, since bold
      // glyphs render wider than normal ones, so the value started almost
      // on top of the label's last character instead of after a gap.
      const examLabelWidth = pdf.getTextWidth("Examination: ");
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(31, 61, 55);
      pdf.text(shortExamTitle, TABLE_LEFT + examLabelWidth + 1, 45.5);
    }
    // Module code (e.g. "Module01") is an internal label the student
    // never sees elsewhere — the subject names (e.g. "Concepts of IT,
    // Windows 10") are what actually identify the exam's content, so
    // show only those under the "Module:" label rather than both.
    if (context.subject) {
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(90, 105, 99);
      pdf.text("Module:", TABLE_LEFT, 50.5);
      // Same bold-vs-normal width fix as the Examination line above.
      const moduleLabelWidth = pdf.getTextWidth("Module: ");
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(31, 61, 55);
      pdf.text(String(context.subject), TABLE_LEFT + moduleLabelWidth + 1, 50.5);
    }
    // The exam's own date — previously missing from the printed sheet
    // entirely, even though it's shown to students elsewhere in the app
    // (see AttemptController's `examDate`). Shown on its own line under
    // Module so it's still present in exports even when Module is absent.
    if (context.examDate) {
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(90, 105, 99);
      pdf.text("Exam Date:", TABLE_LEFT, 55.5);
      const examDateLabelWidth = pdf.getTextWidth("Exam Date: ");
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(31, 61, 55);
      pdf.text(String(context.examDate), TABLE_LEFT + examDateLabelWidth + 1, 55.5);
    }
  };

  const totalPages = Math.max(1, Math.ceil(records.length / ROWS_PER_PAGE));
  let y = HEADER_BOTTOM;
  records.forEach((result, index) => {
    const rowOnPage = index % ROWS_PER_PAGE;
    if (rowOnPage === 0) {
      const pageNumber = Math.floor(index / ROWS_PER_PAGE) + 1;
      if (pageNumber > 1) pdf.addPage();
      drawLetterhead(pageNumber, totalPages);
      y = drawTableHeader(HEADER_BOTTOM);
    }
    pdf.setDrawColor(211, 224, 216);
    pdf.setLineWidth(0.2);
    const shaded = rowOnPage % 2 === 1;
    pdf.setFillColor(shaded ? 248 : 255, shaded ? 251 : 255, shaded ? 249 : 255);
    pdf.rect(TABLE_LEFT, y, TABLE_WIDTH, ROW_HEIGHT, "FD");
    // Column dividers drawn per row so the grid stays crisp even when a
    // page break lands mid-table (each row closes its own cell borders
    // rather than relying on one long line across a page it never
    // reaches).
    colDividers.forEach((x) => pdf.line(x, y, x, y + ROW_HEIGHT));
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(31, 61, 55);
    if (view === "combined") {
      const fr = combinedRowOf(result);
      const cell = (value) => (value === null || value === undefined ? "—" : String(value));
      pdf.setFontSize(8);
      // Every value centered in its own cell (same `combinedBounds` the
      // header labels use above), so a long ID/name/status can never
      // spill across a divider and get sliced by the line the way the
      // old fixed-offset positions did.
      pdf.text(String(index + 1), combinedMid(0), y + 5.8, { align: "center" });
      pdf.text(cell(result.studentId), combinedMid(1), y + 5.8, { align: "center" });
      pdf.text(cell(result.student), combinedBounds[2] + 2, y + 5.8);
      pdf.text(cell(fr.midMonthly?.external), combinedMid(3), y + 5.8, { align: "center" });
      pdf.text(cell(fr.midMonthly?.evidence), combinedMid(4), y + 5.8, { align: "center" });
      pdf.text(cell(fr.monthly?.external), combinedMid(5), y + 5.8, { align: "center" });
      pdf.text(cell(fr.monthly?.evidence), combinedMid(6), y + 5.8, { align: "center" });
      // Narrow 14mm cells -- abbreviate P/F instead of the full word so
      // the value+status fits without overflowing into the divider.
      // Final External/Final Evidence cells commented out along with the columns above.
      // pdf.text(fr.complete ? `${cell(fr.finalExternal)} ${fr.finalExternalStatus === "PASS" ? "P" : "F"}` : "—", combinedMid(7), y + 5.8, { align: "center" });
      // pdf.text(fr.complete ? `${cell(fr.finalEvidence)} ${fr.finalEvidenceStatus === "PASS" ? "P" : "F"}` : "—", combinedMid(8), y + 5.8, { align: "center" });
      pdf.text(fr.complete ? cell(fr.totalMarks) : "—", combinedMid(7), y + 5.8, { align: "center" });
      pdf.text(fr.complete ? cell(fr.status) : "Incomplete", combinedMid(8), y + 5.8, { align: "center" });
      pdf.setFontSize(9);
    } else {
      pdf.text(String(index + 1), plainMid(0), y + 5.8, { align: "center" });
      pdf.text(String(result.studentId ?? "—"), plainMid(1), y + 5.8, { align: "center" });
      pdf.text(String(result.student ?? "—"), plainMid(2), y + 5.8, { align: "center" });
      pdf.text(view === "evidence" ? (result.evidenceMarks === null || result.evidenceMarks === undefined ? "—" : String(result.evidenceMarks)) : String(result.obtainedMarks ?? "—"), plainMid(3), y + 5.8, { align: "center" });
      pdf.text(attendanceOf(result), plainMid(4), y + 5.8, { align: "center" });
    }
    y += ROW_HEIGHT;
  });
  if (totalPages === 1 && records.length === 0) drawLetterhead(1, 1);
  return pdf;
};

const resultPdfFilename = (context, view) => {
  const filename = [safeFilePart(context.course), safeFilePart(context.batch), `exam-${safeFilePart(context.examNumber)}`, safeFilePart(context.examType), view].join("-");
  return `isdb-bisew-results-${filename}.pdf`;
};

function LiveResultListPage() {
  const { session } = useAuth();
  // Stable across AuthContext's 30s session refresh (which spreads a new
  // object even when nothing changed) so this doesn't re-fetch every 30s.
  const courseScopeKey = `${session.mode}:${session.isSuperAdmin ? "1" : "0"}:${(session.courseCodes ?? []).join(",")}`;
  // Filter state is read from/synced to the URL so it survives opening
  // Details and coming back (see the effect below).
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const initialParams = useMemo(() => new URLSearchParams(searchString), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [course, setCourse] = useState(() => initialParams.get("course") ?? "");
  const [batch, setBatch] = useState(() => initialParams.get("batch") ?? "");
  const [round, setRound] = useState(() => initialParams.get("round") ?? "");
  const [examNumber, setExamNumber] = useState(() => initialParams.get("examNumber") ?? "");
  // A Mid Monthly and a Monthly exam can share the same exam_number, so
  // exam_type has to travel alongside it end-to-end.
  const [examType, setExamType] = useState(() => initialParams.get("examType") ?? "");
  // UI-only grouping for the Exam Type dropdown.
  const [examTypeBucket, setExamTypeBucket] = useState(() => {
    const initialType = initialParams.get("examType") ?? "";
    if (!initialType) return "";
    return initialType === "MONTHLY" ? "MONTHLY" : "MID_BUCKET";
  });
  const [status, setStatus] = useState(() => initialParams.get("status") ?? "all");
  // Which of the two result tables is on screen: MCQ (auto-scored exam
  // attempt + who actually attempted it) or Evidence (manually entered
  // marks + who has an evidence entry recorded). Both read from the same
  // roster fetch below -- only the columns/attendance rule shown differ.
  const [view, setView] = useState(() => initialParams.get("view") ?? "mcq");
  const [exporting, setExporting] = useState(false);
  const [catalog, setCatalog] = useState(() => catalogCache.get(courseScopeKey) ?? []);
  const [records, setRecords] = useState([]);
  const [evidenceDrafts, setEvidenceDrafts] = useState({});
  const [evidenceMcqDrafts, setEvidenceMcqDrafts] = useState({});
  const [savingEvidence, setSavingEvidence] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    const params = new URLSearchParams();
    if (course) params.set("course", course);
    if (round) params.set("round", round);
    if (batch) params.set("batch", batch);
    if (examNumber) params.set("examNumber", examNumber);
    if (examType) params.set("examType", examType);
    if (status !== "all") params.set("status", status);
    if (view !== "mcq") params.set("view", view);
    const qs = params.toString();
    // `replace: true` updates the current history entry instead of
    // pushing a new one for every filter tweak — otherwise the Back
    // button would have to be pressed once per filter change instead of
    // once to leave the results list entirely.
    navigate(`/admin/results${qs ? `?${qs}` : ""}`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course, round, batch, examNumber, examType, status, view]);
  useEffect(() => {
    let active = true;
    resultService.filterOptions().then((items) => {
      if (!active || !Array.isArray(items) || !items.length) return;
      const scoped = scopeRecords("results", items, session);
      setCatalog(scoped);
      setCatalogCache(courseScopeKey, scoped);
    }).catch(() => void 0);
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseScopeKey]);
  // Filter null/undefined out FIRST, then stringify — the old order did
  // String(item.round) before filtering, and String(null) is the literal
  // text "null" (truthy), so any batch without a round assigned showed up
  // as a bogus "null" option instead of being dropped.
  const courseOptions = useMemo(() => Array.from(new Set(catalog.map((item) => item.course).filter((value) => value !== null && value !== undefined && value !== "").map(String))).sort(), [catalog]);
  const roundOptions = useMemo(() => Array.from(new Set(catalog.filter((item) => !course || item.course === course).map((item) => item.round).filter((value) => value !== null && value !== undefined && value !== "").map(String))).sort(), [catalog, course]);
  const batchOptions = useMemo(() => {
    // Keep the underlying value as the plain batch number (what the list()
    // call and CSV export filter on) but show the full human-readable code
    // (e.g. "PWAD/CCSL-M/71/01") as the label, same as the rest of the
    // admin panel — a bare "1" doesn't tell an admin which batch that is.
    const map = new Map();
    catalog.filter((item) => item.course === course && (!round || String(item.round) === round)).forEach((item) => {
      if (item.batch === null || item.batch === undefined || item.batch === "") return;
      const value = String(item.batch);
      if (!map.has(value)) map.set(value, item.batchCode || value);
    });
    return Array.from(map, ([value, label]) => ({ value, label })).sort((a, b) => a.value.localeCompare(b.value, undefined, { numeric: true }));
  }, [catalog, course, round]);
  // Keyed by examNumber + examType together, since a Mid Monthly and a
  // Monthly exam can share the same exam_number.
  const examOptions = useMemo(() => Array.from(new Map(catalog.filter((item) => item.course === course && String(item.batch) === batch).map((item) => [`${item.examNumber}|${item.examType || ""}`, { number: String(item.examNumber), type: item.examType || "", title: String(item.exam) }])).values()).sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }) || a.type.localeCompare(b.type)), [catalog, course, batch]);
  // "MONTHLY" = the offline exam; anything else is Mid Monthly (real data
  // stores it as "MID_MONTHLY", not the bare "MID" a demo seeder once used).
  const monthlyExamOptions = useMemo(() => examOptions.filter((item) => item.type === "MONTHLY"), [examOptions]);
  const midExamOptions = useMemo(() => examOptions.filter((item) => item.type !== "MONTHLY"), [examOptions]);
  // Only offers a bucket the batch actually has exams for.
  const examTypeOptions = useMemo(() => {
    const options = [];
    if (midExamOptions.length) options.push({ value: "MID_BUCKET", label: "Mid Monthly" });
    if (monthlyExamOptions.length) options.push({ value: "MONTHLY", label: "Monthly" });
    return options;
  }, [midExamOptions, monthlyExamOptions]);
  // The Exam Number dropdown's own list depends on which bucket is
  // currently chosen -- Mid Monthly selected shows only midExamOptions,
  // Monthly selected shows only monthlyExamOptions. Before a bucket is
  // chosen there's nothing valid to number against, so the list is empty
  // rather than guessing.
  const examNumberOptions = examTypeBucket === "MONTHLY" ? monthlyExamOptions : examTypeBucket === "MID_BUCKET" ? midExamOptions : [];
  const selected = Boolean(course && batch && examNumber && examType);
  useEffect(() => {
    if (!selected) {
      setRecords([]);
      setLoadError("");
      setLoading(false);
      return void 0;
    }
    let active = true;
    const cacheKey = rosterCacheKey(course, batch, round, examNumber, examType);
    const cached = rosterCache.get(cacheKey);
    if (cached) {
      // Show what we already have instantly instead of a loading state —
      // this is what makes returning via the Details page's Back button
      // (or the browser Back button) feel instant. `fetchRecords(true)`
      // below still runs right after to quietly pick up anything that
      // changed since the cached copy was fetched.
      setRecords(cached);
      setEvidenceDrafts(Object.fromEntries(cached.map(item => [`${item.studentDbId}:${item.examId}`, item.evidenceMarks ?? ""])));
      setEvidenceMcqDrafts(Object.fromEntries(cached.map(item => [`${item.studentDbId}:${item.examId}`, item.evidenceMcqMarks ?? ""])));
      setLoadError("");
    }
    // `silent` skips the full-page loading state on refresh ticks so the
    // table doesn't flash back to "Loading results…" every 20s — only the
    // very first load (when the filters change) shows that state.
    const fetchRecords = (silent = false) => {
      if (!silent) setLoading(true);
      setLoadError("");
      resultService
        .list({ course, batch, round, examNumber, examType })
        .then(items => {
          if (!active) return;
          const scoped = scopeRecords("results", items, session);
          setRosterCache(cacheKey, scoped);
          setRecords(scoped);
          setEvidenceDrafts(Object.fromEntries(scoped.map(item => [`${item.studentDbId}:${item.examId}`, item.evidenceMarks ?? ""])));
          setEvidenceMcqDrafts(Object.fromEntries(scoped.map(item => [`${item.studentDbId}:${item.examId}`, item.evidenceMcqMarks ?? ""])));
        })
        .catch(error => {
          if (!active) return;
          // A silent background refresh failing (e.g. one dropped request)
          // shouldn't wipe an already-loaded table with an error banner —
          // only surface the error on the initial, non-silent load. With
          // a cache hit, the very first load is itself effectively
          // "silent" from the admin's point of view (they already see
          // the cached rows), so only show the error banner when there
          // was nothing cached to fall back on.
          if (!silent && !cached) {
            setRecords([]);
            setLoadError(error?.response?.data?.message ?? "Results could not be loaded for the selected context.");
          }
        })
        .finally(() => {
          if (active && !silent) setLoading(false);
        });
    };
    fetchRecords(Boolean(cached));
    // Students can submit at any time while an admin has this page open —
    // results are created dynamically on submit now, so poll for new/
    // updated rows instead of requiring a manual page reload to see them.
    const intervalId = setInterval(() => fetchRecords(true), 20000);
    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [course, batch, round, examNumber, examType, selected, courseScopeKey]);
  // Outcome filter matches whichever Pass/Fail badge is actually on
  // screen for the active tab, not the unrelated record.status field.
  const isMonthlySelectedForFilter = String(examType || "").toUpperCase() === "MONTHLY";
  const outcomeViewForFilter = view === "combined" && !isMonthlySelectedForFilter ? "mcq" : view;
  const outcomeFieldOf = (record) => (outcomeViewForFilter === "evidence"
    ? record.evidenceStatus ?? "INCOMPLETE"
    : outcomeViewForFilter === "combined"
      ? (record.finalResult?.complete ? record.finalResult?.status : "INCOMPLETE")
      : record.externalStatus ?? record.status ?? "INCOMPLETE");
  const filtered = useMemo(
    () =>
      records
        .filter((record) => status === "all" || String(outcomeFieldOf(record) ?? "").toUpperCase() === status.toUpperCase())
        // Numeric-aware sort so "10" doesn't sort before "2".
        .slice()
        .sort((a, b) =>
          String(a.studentId ?? "").localeCompare(String(b.studentId ?? ""), undefined, { numeric: true }),
        ),
    [records, status, outcomeViewForFilter],
  );
  // Mid Monthly attendance is inferred (submitted = present); Monthly's
  // is manually recorded on exam_evidences.
  const mcqAttendance = (record) => (isMonthlySelected ? (record.attended ? "P" : "A") : (record.status === "ABSENT" ? "A" : "P"));
  // Evidence attendance: independent of whether the student sat the MCQ
  // exam -- Present only once an admin has actually recorded evidence
  // marks for them (evidenceMarks is null until saveEvidence() runs),
  // Absent otherwise.
  const evidenceAttendance = (record) => (record.attended ? "P" : "A");
  const AttendanceBadge = ({ code }) => <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ring-1 ring-inset ${code === "P" ? "bg-emerald-50 text-emerald-800 ring-emerald-700/10" : "bg-rose-50 text-rose-800 ring-rose-700/10"}`}>{code}</span>;
  // Applies the same row-patch to both the live `records` state and the
  // cached copy for the current filter combo, so an edit (attendance,
  // evidence marks) is reflected immediately if the admin navigates away
  // and back before the next silent background refresh runs.
  const patchRecords = (mapper) => {
    setRecords((current) => {
      const updated = current.map(mapper);
      setRosterCache(rosterCacheKey(course, batch, round, examNumber, examType), updated);
      return updated;
    });
  };
  const [markingAttendance, setMarkingAttendance] = useState({});
  const toggleAttendance = (record) => {
    const key = `${record.studentDbId}:${record.examId}`;
    const nextAttended = !record.attended;
    setMarkingAttendance((current) => ({ ...current, [key]: true }));
    resultService.markAttendance({ studentDbId: record.studentDbId, examId: record.examId, attended: nextAttended })
      .then((saved) => {
        patchRecords((item) => (item.studentDbId === record.studentDbId && item.examId === record.examId ? { ...item, attended: saved.attended ?? nextAttended, attendedAt: saved.attendedAt ?? null } : item));
        toast.success(nextAttended ? `${record.student} marked attended.` : `${record.student} marked absent.`);
      })
      .catch((error) => toast.error(error?.response?.data?.message ?? "Attendance could not be saved."))
      .finally(() => setMarkingAttendance((current) => ({ ...current, [key]: false })));
  };
  const saveEvidence = (record) => {
    const key = `${record.studentDbId}:${record.examId}`;
    const raw = evidenceDrafts[key];
    const marks = raw === "" || raw === undefined || raw === null ? null : Number(raw);
    if (marks !== null && (Number.isNaN(marks) || marks < 0)) return toast.error("Enter a valid, non-negative number for evidence marks.");
    // Only sends `marks` now — MCQ marks are the dedicated MCQ tab's job
    // (see saveMcqMarks below), so this no longer touches mcq_marks at
    // all, and the backend leaves that column exactly as it was. It also
    // never sends `attended` — saving Evidence marks (on a Mid or a
    // Monthly exam) must never flip a student's attendance; only the
    // explicit "Mark attended"/"Mark absent" button (toggleAttendance)
    // does that.
    setSavingEvidence((current) => ({ ...current, [key]: true }));
    resultService.saveEvidence({ studentDbId: record.studentDbId, examId: record.examId, marks })
      .then((saved) => {
        patchRecords((item) => (item.studentDbId === record.studentDbId && item.examId === record.examId ? { ...item, evidenceMarks: saved.evidenceMarks ?? marks } : item));
        toast.success(`Evidence marks saved for ${record.student}.`);
      })
      .catch((error) => toast.error(error?.response?.data?.message ?? "Evidence marks could not be saved."))
      .finally(() => setSavingEvidence((current) => ({ ...current, [key]: false })));
  };
  // Monthly's MCQ marks are entered here (only sends `mcqMarks`, never
  // touches `marks` or `attended`).
  const saveMcqMarks = (record) => {
    const key = `${record.studentDbId}:${record.examId}`;
    const mcqRaw = evidenceMcqDrafts[key];
    const mcqMarks = mcqRaw === "" || mcqRaw === undefined || mcqRaw === null ? null : Number(mcqRaw);
    if (mcqMarks !== null && (Number.isNaN(mcqMarks) || mcqMarks < 0)) return toast.error("Enter a valid, non-negative number for MCQ marks.");
    setSavingEvidence((current) => ({ ...current, [key]: true }));
    resultService.saveEvidence({ studentDbId: record.studentDbId, examId: record.examId, mcqMarks })
      .then((saved) => {
        patchRecords((item) => (item.studentDbId === record.studentDbId && item.examId === record.examId ? { ...item, evidenceMcqMarks: saved.evidenceMcqMarks ?? mcqMarks } : item));
        toast.success(`MCQ marks saved for ${record.student}.`);
      })
      .catch((error) => toast.error(error?.response?.data?.message ?? "MCQ marks could not be saved."))
      .finally(() => setSavingEvidence((current) => ({ ...current, [key]: false })));
  };
  const context = { course, batch: filtered[0]?.batchCode || batch, examNumber, examTitle: filtered[0]?.exam, examType: filtered[0]?.examType, examDate: filtered[0]?.examDate, subject: filtered[0]?.subject, module: filtered[0]?.module, maxMarks: filtered[0]?.maxMarks, passMarks: filtered[0]?.passMarks };
  // Matches FinalResultService::isMonthly() on the backend.
  const isMonthlySelected = String(context.examType || "").toUpperCase() === "MONTHLY";
  // Guards against a stale `view=combined` from the URL/bookmark landing
  // on a Mid Monthly exam, which has no Final Result tab to show.
  const activeView = view === "combined" && !isMonthlySelected ? "mcq" : view;
  const reset = () => { setCourse(""); setBatch(""); setRound(""); setExamNumber(""); setExamType(""); setExamTypeBucket(""); setStatus("all"); };
  const runExportCsv = () => {
    setExporting(true);
    reportService.exportCsv({ course, batch, round, examNumber, examType, outcome: status })
      .then(() => toast.success("Result export CSV downloaded."))
      .catch((error) => toast.error(error?.response?.data?.message ?? "The result export could not be prepared."))
      .finally(() => setExporting(false));
  };
  const [buildingPreview, setBuildingPreview] = useState(false);
  const openPdfPreview = () => {
    if (!filtered.length) return toast.error("There are no result records to print.");
    setBuildingPreview(true);
    buildResultPdf(filtered, context, activeView)
      .then((pdf) => {
        // Blob URL opened in a new tab (browser's own PDF viewer); left
        // un-revoked so the tab can use it until closed.
        const win = window.open(pdf.output("bloburl"), "_blank");
        if (!win) toast.error("Your browser blocked the preview tab. Allow pop-ups for this site and try again.");
      })
      .catch(() => toast.error("The result PDF could not be prepared."))
      .finally(() => setBuildingPreview(false));
  };
  const downloadPreviewedPdf = () => {
    buildResultPdf(filtered, context, activeView).then((pdf) => {
      pdf.save(resultPdfFilename(context, activeView));
      toast.success("Result table PDF downloaded.");
    });
  };
  // Monthly rows have no ExamResult id (never auto-graded), so route
  // through the "na" sentinel + exam/student params instead; ResultDetailPage
  // uses getDetail() for those.
  const detailsHref = (record) => (record.id
    ? `/admin/results/${record.id}`
    : `/admin/results/na?examId=${record.examId}&studentId=${record.studentDbId}`);
  const actionsColumn = { key: "actions", label: "Actions", render: (record) => <Link href={detailsHref(record)} className="inline-flex items-center gap-1 rounded-md bg-[#e8f3ed] px-2.5 py-1.5 text-xs font-bold text-[#0e5a4f] transition hover:bg-[#d9ece2]"><Eye className="h-3.5 w-3.5" />Details</Link> };
  const mcqColumns = [
    { key: "sn", label: "SN", className: "w-14 text-center", render: (record, index) => index + 1 },
    { key: "studentId", label: "Student ID", className: "border-l border-[#e3e9e3] text-center" },
    { key: "student", label: "Name", className: "border-l border-[#e3e9e3] text-center", render: (record) => <span className="font-semibold text-[#24443e]">{String(record.student)}</span> },
    isMonthlySelected
      ? { key: "mcqMarksManual", label: "External marks", className: "min-w-44 border-l border-[#e3e9e3] text-center", render: (record) => { const key = `${record.studentDbId}:${record.examId}`; const disabled = !record.studentDbId || !record.examId; return <div className="flex items-center justify-center gap-2"><Input type="number" min="0" step="0.01" disabled={disabled} value={evidenceMcqDrafts[key] ?? ""} onChange={(event) => setEvidenceMcqDrafts((current) => ({ ...current, [key]: event.target.value }))} className="h-9 w-24" placeholder="—" /><Button size="sm" variant="outline" disabled={disabled || savingEvidence[key]} onClick={() => saveMcqMarks(record)}>{savingEvidence[key] ? "Saving…" : "Save"}</Button></div>; } }
      : { key: "obtainedMarks", label: "External marks", className: "border-l border-[#e3e9e3] text-center" },
    { key: "mcqAttendance", label: "Attendance", className: "border-l border-[#e3e9e3] text-center", render: (record) => {
      const badge = <AttendanceBadge code={mcqAttendance(record)} />;
      // Mid Monthly's attendance is inferred automatically from whether
      // the student actually submitted the online exam — there's nothing
      // for an admin to manually set, so it stays a read-only badge.
      // Monthly's External is offline/manually entered, so per the spec
      // it needs the same manual Mark attended/Mark absent control the
      // Evidence tab already has -- reusing the exact same
      // toggleAttendance()/exam_evidences.attended field, since both
      // tabs are recording attendance for the same exam_evidences row.
      if (!isMonthlySelected) return badge;
      const key = `${record.studentDbId}:${record.examId}`;
      const disabled = !record.studentDbId || !record.examId;
      return <div className="flex items-center justify-center gap-2">{badge}<Button size="sm" variant="outline" disabled={disabled || markingAttendance[key]} onClick={() => toggleAttendance(record)}>{markingAttendance[key] ? "Saving…" : record.attended ? "Mark absent" : "Mark attended"}</Button></div>;
    } },
    // Mid Monthly's own External pass mark is a flat 32 -- independent of
    // the exam's own pass_marks column and of the cross-exam Final Result
    // below. Monthly's own External has no standalone pass mark of its
    // own (only the combined Final Result decides pass/fail there), so
    // this column is Mid Monthly-only.
    ...(isMonthlySelected ? [] : [{ key: "externalStatus", label: `Pass/Fail (≥${filtered[0]?.midPassMark ?? 32})`, className: "border-l border-[#e3e9e3] text-center", render: (record) => (record.externalStatus ? <StatusBadge value={record.externalStatus} /> : <span className="text-[#98a6a1]">—</span>) }]),
    { ...actionsColumn, className: `border-l border-[#e3e9e3] text-center ${actionsColumn.className ?? ""}`.trim() },
  ];
  // Evidence table: attendance is now an explicit manual flag an admin
  // sets per student (independent of whether marks have been entered),
  // stored on the same exam_evidences row as the evidence marks so a
  // student can only ever have one attendance state per exam. MCQ marks
  // moved to their own dedicated column on the MCQ tab (see mcqColumns
  // above) — this tab only handles the separate "Evidence marks"
  // (descriptive/practical) component now, instead of duplicating the
  // same MCQ input in both places.
  const evidenceColumns = [
    { key: "sn", label: "SN", className: "w-14 text-center", render: (record, index) => index + 1 },
    { key: "studentId", label: "Student ID", className: "border-l border-[#e3e9e3] text-center" },
    { key: "student", label: "Name", className: "border-l border-[#e3e9e3] text-center", render: (record) => <span className="font-semibold text-[#24443e]">{String(record.student)}</span> },
    { key: "evidenceAttendance", label: "Attendance", className: "border-l border-[#e3e9e3] text-center", render: (record) => { const key = `${record.studentDbId}:${record.examId}`; const disabled = !record.studentDbId || !record.examId; return <div className="flex items-center justify-center gap-2"><AttendanceBadge code={evidenceAttendance(record)} /><Button size="sm" variant="outline" disabled={disabled || markingAttendance[key]} onClick={() => toggleAttendance(record)}>{markingAttendance[key] ? "Saving…" : record.attended ? "Mark absent" : "Mark attended"}</Button></div>; } },
    { key: "evidence", label: "Evidence marks", className: "min-w-44 border-l border-[#e3e9e3] text-center", render: (record) => { const key = `${record.studentDbId}:${record.examId}`; const disabled = !record.studentDbId || !record.examId; return <div className="flex items-center justify-center gap-2"><Input type="number" min="0" step="0.01" disabled={disabled} value={evidenceDrafts[key] ?? ""} onChange={(event) => setEvidenceDrafts((current) => ({ ...current, [key]: event.target.value }))} className="h-9 w-24" placeholder="—" /><Button size="sm" variant="outline" disabled={disabled || savingEvidence[key]} onClick={() => saveEvidence(record)}>{savingEvidence[key] ? "Saving…" : "Save"}</Button></div>; } },
    // Same Mid-Monthly-only 32 pass mark as the External tab's Pass/Fail
    // column above -- see the comment there.
    ...(isMonthlySelected ? [] : [{ key: "evidenceStatus", label: `Pass/Fail (≥${filtered[0]?.midPassMark ?? 32})`, className: "border-l border-[#e3e9e3] text-center", render: (record) => (record.evidenceStatus ? <StatusBadge value={record.evidenceStatus} /> : <span className="text-[#98a6a1]">—</span>) }]),
    { ...actionsColumn, className: `border-l border-[#e3e9e3] text-center ${actionsColumn.className ?? ""}`.trim() },
  ];
  // Final Result: cross-exam Mid Monthly + Monthly combination, computed
  // server-side by FinalResultService (record.finalResult) — never
  // recomputed client-side.
  const fmtMarks = (value) => (value === null || value === undefined ? "—" : value);
  const finalResultColumns = [
    { key: "sn", label: "SN", className: "w-14 text-center", render: (record, index) => index + 1 },
    { key: "studentId", label: "Student ID", className: "border-l border-[#e3e9e3] text-center" },
    { key: "student", label: "Name", className: "border-l border-[#e3e9e3] text-center", render: (record) => <span className="font-semibold text-[#24443e]">{String(record.student)}</span> },
    { key: "midExternal", label: "External", className: "border-l border-[#e3e9e3] text-center", render: (record) => fmtMarks(record.finalResult?.midMonthly?.external) },
    { key: "midEvidence", label: "Evidence", className: "border-l border-[#e3e9e3] text-center", render: (record) => fmtMarks(record.finalResult?.midMonthly?.evidence) },
    { key: "monthlyExternal", label: "External", className: "border-l border-[#e3e9e3] text-center", render: (record) => fmtMarks(record.finalResult?.monthly?.external) },
    { key: "monthlyEvidence", label: "Evidence", className: "border-l border-[#e3e9e3] text-center", render: (record) => fmtMarks(record.finalResult?.monthly?.evidence) },
    // Final External/Final Evidence columns commented out (not shown) --
    // uncomment these two plus the matching PDF/group-band code above and
    // the "Final" span in finalResultGroups below to restore them.
    // { key: "finalExternal", label: "Final external", className: "border-l border-[#e3e9e3] text-center", render: (record) => (record.finalResult?.complete ? <div className="flex flex-col items-center gap-1"><span className="font-semibold text-[#1d413b]">{record.finalResult.finalExternal}</span><StatusBadge value={record.finalResult.finalExternalStatus} /></div> : <span className="text-[#98a6a1]">—</span>) },
    // { key: "finalEvidence", label: "Final evidence", className: "border-l border-[#e3e9e3] text-center", render: (record) => (record.finalResult?.complete ? <div className="flex flex-col items-center gap-1"><span className="font-semibold text-[#1d413b]">{record.finalResult.finalEvidence}</span><StatusBadge value={record.finalResult.finalEvidenceStatus} /></div> : <span className="text-[#98a6a1]">—</span>) },
    { key: "totalMarks", label: "Total marks", className: "border-l border-[#e3e9e3] text-center", render: (record) => (record.finalResult?.complete ? <span className="font-semibold text-[#1d413b]">{record.finalResult.totalMarks}</span> : <span className="text-[#98a6a1]" title={record.finalResult?.message ?? "Not yet available"}>—</span>) },
    { key: "passFail", label: "Pass/Fail", className: "border-l border-[#e3e9e3] text-center", render: (record) => (record.finalResult?.complete ? <StatusBadge value={record.finalResult.status} /> : <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 ring-1 ring-inset ring-slate-500/10" title={record.finalResult?.message ?? "Not yet available"}>Incomplete</span>) },
    { ...actionsColumn, className: `border-l border-[#e3e9e3] text-center ${actionsColumn.className ?? ""}`.trim() },
  ];
  // Final Result -> Mid Monthly(External|Evidence) | Monthly(External|Evidence) | Total Marks | Pass/Fail | Action.
  const finalResultGroups = [
    { label: "", span: 3 },
    { label: "Mid Monthly", span: 2, className: "border-l border-[#e3e9e3]" },
    { label: "Monthly", span: 2, className: "border-l border-[#e3e9e3]" },
    // { label: "Final", span: 2, className: "border-l border-[#e3e9e3]" }, // commented out with Final External/Evidence
    { label: "", span: 3, className: "border-l border-[#e3e9e3]" },
  ];
  return <>
    <PageHeader
      eyebrow={session.isSuperAdmin ? "Authorized outcomes" : `Course scope · ${(session.courseCodes ?? []).join(", ")}`}
      title="Result management"
      description={session.isSuperAdmin ? "Select course, batch, and exam number to load results." : "Only results for your assigned courses can be selected, loaded, or exported."}
      action={<div className="flex gap-2"><Button variant="outline" disabled={!selected || loading || !filtered.length || exporting} onClick={runExportCsv}><Download className="mr-2 h-4 w-4" />{exporting ? "Preparing…" : "Export CSV"}</Button><Button variant="outline" disabled={!selected || loading || !filtered.length || buildingPreview} onClick={openPdfPreview}><Printer className="mr-2 h-4 w-4" />{buildingPreview ? "Preparing…" : "Preview result PDF"}</Button><Button variant="outline" disabled={!selected || loading || !filtered.length} onClick={downloadPreviewedPdf}><Download className="mr-2 h-4 w-4" />Download PDF</Button></div>}
    />
    <FilterBand onClear={reset}>
      <FilterField label="Course" required><Select value={course} onChange={(event) => { setCourse(event.target.value); setRound(""); setBatch(""); setExamNumber(""); setExamType(""); setExamTypeBucket(""); }}><option value="" disabled>Select a course</option>{courseOptions.map((item) => <option key={item} value={item}>{item}</option>)}</Select></FilterField>
      <FilterField label="Round"><Select value={round} disabled={!course} onChange={(event) => { setRound(event.target.value); setBatch(""); setExamNumber(""); setExamType(""); setExamTypeBucket(""); }}><option value="">All rounds</option>{roundOptions.map((item) => <option key={item} value={item}>{item}</option>)}</Select></FilterField>
      <FilterField label="Batch" required><Select value={batch} disabled={!course} onChange={(event) => { setBatch(event.target.value); setExamNumber(""); setExamType(""); setExamTypeBucket(""); }}><option value="" disabled>{course ? "Select a batch" : "Choose course first"}</option>{batchOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</Select></FilterField>
      {/* Exam Type comes first now — Mid Monthly or Monthly — and Exam
          Number right after it only ever lists that chosen bucket's own
          exams (midExamOptions under Mid Monthly, monthlyExamOptions
          under Monthly), instead of two side-by-side "Mid exam number" /
          "Monthly exam number" dropdowns. Changing the type always
          clears whatever exam number was picked, since a number from the
          old bucket has no meaning under the new one.
          `examTypeBucket` only drives which list of exam numbers to show;
          it is a UI grouping and is never sent to the backend. The real
          `exam_type` sent with the query is set from the specific exam
          the admin picks in the Exam Number dropdown below (its actual
          stored value, "MID" or "MID_MONTHLY" depending on how that exam
          was created — see the comment above midExamOptions), not
          assumed from the bucket. Hardcoding it from the bucket caused
          real "MID_MONTHLY" rows to silently return zero results when
          queried as "MID". */}
      <FilterField label="Exam type"><Select value={examTypeBucket} disabled={!batch} onChange={(event) => { setExamTypeBucket(event.target.value); setExamType(""); setExamNumber(""); }}><option value="">{batch ? "Select an exam type" : "Choose batch first"}</option>{examTypeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</Select></FilterField>
      <FilterField label="Exam number"><Select value={examNumber} disabled={!examTypeBucket} onChange={(event) => { const chosen = examNumberOptions.find((item) => item.number === event.target.value); setExamNumber(chosen?.number ?? ""); setExamType(chosen?.type ?? ""); }}><option value="">{examTypeBucket ? (examNumberOptions.length ? "Select an exam number" : "No exams of this type") : "Choose exam type first"}</option>{examNumberOptions.map((item) => <option key={item.number} value={item.number}>No. {item.number} · {item.title}</option>)}</Select></FilterField>
      <FilterField label="Outcome"><Select value={status} disabled={!selected || loading} onChange={(event) => setStatus(event.target.value)}><option value="all">Pass and fail</option><option>Pass</option><option>Fail</option><option>Incomplete</option></Select></FilterField>
    </FilterBand>
    {selected && <div className="mb-4 inline-flex rounded-lg border border-[#d6ded7] bg-white p-1">
      {/* Highlighted against `activeView`, not the raw `view` state --
          switching to a Mid Monthly exam while "Final Result" was
          selected silently falls back to the External table (see
          activeView above), and the tab pill needs to follow that same
          fallback instead of still showing "Final Result" highlighted
          (or nothing at all, since that tab is hidden for Mid Monthly). */}
      <button type="button" onClick={() => setView("mcq")} className={`rounded-md px-4 py-1.5 text-sm font-semibold transition ${activeView === "mcq" ? "bg-[#0e5a4f] text-white" : "text-[#3a5850] hover:bg-[#f1f6f2]"}`}>External</button>
      <button type="button" onClick={() => setView("evidence")} className={`rounded-md px-4 py-1.5 text-sm font-semibold transition ${activeView === "evidence" ? "bg-[#0e5a4f] text-white" : "text-[#3a5850] hover:bg-[#f1f6f2]"}`}>Evidence</button>
      {/* Final Result only ever applies to Monthly — it's the cross-exam
          Mid Monthly + Monthly combination, so Mid Monthly's own roster
          (which has nothing to combine yet) never shows this tab. */}
      {isMonthlySelected && <button type="button" onClick={() => setView("combined")} className={`rounded-md px-4 py-1.5 text-sm font-semibold transition ${activeView === "combined" ? "bg-[#0e5a4f] text-white" : "text-[#3a5850] hover:bg-[#f1f6f2]"}`}>Final Result</button>}
    </div>}
    {!selected ? <RecordCard className="border-dashed border-[#c6d9cf] bg-[#f8fbf9] p-8 text-center"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#6a8078]">Selection required</p><h2 className="mt-2 font-serif text-2xl font-semibold text-[#1d413b]">Choose a course, batch, and exam number to view results</h2></RecordCard>
    : loading ? <RecordCard className="p-8 text-center"><p className="font-semibold text-[#295148]">Loading results for the selected examination…</p><p className="mt-2 text-sm text-[#6c7d78]">The Laravel request includes the selected course, batch, and exam number.</p></RecordCard>
    : loadError ? <RecordCard className="border-rose-200 bg-rose-50 p-7 text-center"><p className="font-semibold text-rose-900">Results could not be loaded</p><p className="mt-2 text-sm text-rose-800">{loadError}</p></RecordCard>
    : activeView === "mcq" ? <DataTable records={filtered} rowLabel="results" pageSize={15} columns={mcqColumns} />
    : activeView === "evidence" ? <DataTable records={filtered} rowLabel="results" pageSize={15} columns={evidenceColumns} />
    : <DataTable records={filtered} rowLabel="results" pageSize={15} columns={finalResultColumns} groups={finalResultGroups} />}
  </>;
}

export { LiveResultListPage };