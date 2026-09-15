/** Institutional Ledger style: bulk import is transparent and transactional—one invalid value blocks the whole file before any record is accepted. */
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { csvSchemas, emptyParsedCsv, validateCsvContent } from "@/lib/csv-validation";
import { bulkImportService } from "@/services/services";
import { normalizeApiError } from "@/services/api-client";
import { refreshAcademicRecords } from "@/lib/academic-demo-store";
import { refreshQuestions } from "@/lib/question-demo-store";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const escapeCsvValue = (value) => {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const makeCsv = (schema, includeDemo, allowedCourses = []) => {
  const rows = [schema.columns.join(",")];
  const demo = schema.label === "Questions" && allowedCourses.length ? { ...schema.demo, course: allowedCourses[0] } : schema.demo;
  if (includeDemo) rows.push(schema.columns.map((column) => escapeCsvValue(demo[column])).join(","));
  return `${rows.join("\n")}\n`;
};

const downloadCsv = (filename, content) => {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

function CsvTemplateDownloadButton({ dataType = "questions", allowedCourses = [] }) {
  const schema = csvSchemas[dataType];
  return <Button type="button" variant="outline" onClick={() => downloadCsv(`isdb-bisew-${dataType}-template.csv`, makeCsv(schema, false, allowedCourses))} className="w-full border-[#c7d8cf] bg-white text-[#0e5a4f] hover:bg-[#edf7f0]"><Download className="mr-2 h-4 w-4" />Download CSV Template</Button>;
}

function CsvBulkImportDialog({ dataType, compact = false, allowedCourses = [] }) {
  const schema = csvSchemas[dataType];
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(emptyParsedCsv);
  const [validation, setValidation] = useState({ valid: false, errors: [], acceptedRows: [] });
  const [loading, setLoading] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const valid = Boolean(file) && validation.valid;
  const errorLines = useMemo(() => new Set(validation.errors.map((error) => error.line)), [validation.errors]);
  const reset = () => {
    setFile(null);
    setParsed(emptyParsedCsv());
    setValidation({ valid: false, errors: [], acceptedRows: [] });
    setIsDemo(false);
  };
  const processContent = (name, content, demo = false, sourceFile = null) => {
    const baseResult = validateCsvContent(content, schema);
    const courseIndex = schema.columns.indexOf("course");
    // A course cell may contain the full batch code (e.g. "PWAD/CCSL-M/71/01")
    // instead of just the course code — the batch code always starts with
    // its course code followed by "/", so accept that shape too instead of
    // blocking the whole file over it (the backend applies the same rule).
    const courseCodeFrom = (value) => {
      const trimmed = String(value ?? "").trim();
      const slash = trimmed.indexOf("/");
      return slash === -1 ? trimmed : trimmed.slice(0, slash).trim();
    };
    const scopeErrors = !allowedCourses.length || courseIndex < 0 ? [] : baseResult.parsed.rows.filter((record) => !allowedCourses.includes(courseCodeFrom(record.cells[courseIndex]))).map((record) => ({ line: record.line, column: "course", value: record.cells[courseIndex] ?? "", message: `This administrator may import ${schema.label.toLowerCase()} only for: ${allowedCourses.join(", ")}.` }));
    const result = { ...baseResult, valid: baseResult.valid && scopeErrors.length === 0, errors: [...baseResult.errors, ...scopeErrors] };
    const importFile = sourceFile ?? new File([content], name, { type: "text/csv;charset=utf-8" });
    setFile({ name, size: importFile.size, importFile });
    setParsed(result.parsed);
    setValidation({ valid: result.valid, errors: result.errors, acceptedRows: result.acceptedRows });
    setIsDemo(demo);
    if (!result.valid) toast.error("CSV rejected before import", { description: `${result.errors.length} format issue${result.errors.length === 1 ? "" : "s"} found. No records were saved.` });
  };
  const processFile = async (nextFile) => {
    if (!nextFile) return;
    if (!nextFile.name.toLowerCase().endsWith(".csv")) {
      toast.error("Please choose a CSV file.");
      return;
    }
    processContent(nextFile.name, await nextFile.text(), false, nextFile);
  };
  const importRecords = async () => {
    if (!valid) {
      toast.error("Import blocked", { description: "Fix every reported issue before importing. No records have been saved." });
      return;
    }
    setLoading(true);
    try {
      const result = await bulkImportService.importCsv(dataType, file.importFile, validation.acceptedRows, { allowedCourses });
      const breakdown = result.breakdown;
      const levelSummary = (label, level) => {
        if (!level) return null;
        const parts = [
          level.created ? `${level.created} new` : null,
          level.updated ? `${level.updated} updated` : null,
        ].filter(Boolean);
        return parts.length ? `${label}: ${parts.join(", ")}` : null;
      };
      const breakdownSummary = breakdown ? [
        levelSummary("Subjects", breakdown.subjects),
        levelSummary("Modules", breakdown.modules),
        levelSummary("Competency units", breakdown.competencyUnits),
        levelSummary("Elements", breakdown.elements),
      ].filter(Boolean).join(" · ") : null;
      const createdUpdatedLabel = () => {
        const parts = [
          result.created ? `${result.created} ${schema.label.toLowerCase()} created` : null,
          result.updated ? `${result.updated} ${schema.label.toLowerCase()} updated` : null,
        ].filter(Boolean);
        return parts.length ? parts.join(", ") : `${result.imported ?? validation.acceptedRows.length} ${schema.label.toLowerCase()} imported`;
      };
      toast.success(
        dataType === "curriculum" ? "Curriculum import complete." : `${createdUpdatedLabel()}.`,
        { description: dataType === "curriculum" && breakdownSummary ? breakdownSummary : "The full file passed validation before import." }
      );
      // The imported records live in a separate client-side cache (academic
      // or question store) that only refetches on explicit mutation events;
      // without this, a successful import wouldn't show up until a full
      // page reload.
      const academicKindFor = { students: "students", subjects: "subjects", modules: "modules", "competency-units": "competencyUnits", elements: "elements" };
      if (dataType === "curriculum") refreshAcademicRecords().catch(() => {});
      else if (academicKindFor[dataType]) refreshAcademicRecords(academicKindFor[dataType]).catch(() => {});
      if (dataType === "questions") refreshQuestions({ force: true }).catch(() => {});
      setOpen(false);
      reset();
    } catch (error) {
      const normalized = normalizeApiError(error);
      const backendErrors = normalized.errors?.file ?? normalized.errors ?? null;
      if (Array.isArray(backendErrors) && backendErrors.length) {
        // Surface Laravel's exact line/column/message list in the same
        // table used for client-side validation, instead of a canned toast.
        setValidation((current) => ({ ...current, valid: false, errors: backendErrors }));
        toast.error("Import rejected by the server.", { description: backendErrors[0]?.message ?? "See the issue list below." });
      } else {
        toast.error("CSV import could not be completed.", { description: normalized.message ?? "The server did not accept this file. Please try again." });
      }
    } finally {
      setLoading(false);
    }
  };
  const totalRows = parsed.rows.length;
  return <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) reset(); }}><Button type="button" variant="outline" size={compact ? "sm" : "default"} onClick={() => setOpen(true)} className="border-[#c7d8cf] text-[#0e5a4f]"><UploadCloud className="mr-2 h-4 w-4" />CSV import</Button><DialogContent className="max-h-[90vh] overflow-y-auto border-[#cde0d5] bg-[#fcfdfb] sm:max-w-4xl"><DialogHeader><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#6f827b]">Transactional bulk data entry</p><DialogTitle className="font-serif text-2xl text-[#1d413a]">Import {schema.label} from CSV</DialogTitle><DialogDescription className="leading-6 text-[#60746c]">Every header and every row is checked before an import request is allowed. If one error exists, the entire file is rejected and no data is saved.{dataType === "questions" && allowedCourses.length ? ` Your authorized course scope: ${allowedCourses.join(", ")}.` : ""}</DialogDescription></DialogHeader><div className="grid gap-3 sm:grid-cols-3"><Button type="button" variant="outline" onClick={() => downloadCsv(`isdb-bisew-${dataType}-template.csv`, makeCsv(schema, false, allowedCourses))}><Download className="mr-2 h-4 w-4" />Template CSV</Button><Button type="button" variant="outline" onClick={() => downloadCsv(`isdb-bisew-${dataType}-demo.csv`, makeCsv(schema, true, allowedCourses))}><FileSpreadsheet className="mr-2 h-4 w-4" />Demo download</Button><Button type="button" variant="outline" onClick={() => processContent(`isdb-bisew-${dataType}-demo.csv`, makeCsv(schema, true, allowedCourses), true)}><CheckCircle2 className="mr-2 h-4 w-4" />Load demo upload</Button></div><div className="rounded-xl border-2 border-dashed border-[#b8d1c5] bg-[#f5faf7] p-6 text-center"><UploadCloud className="mx-auto h-7 w-7 text-[#0e5a4f]" /><p className="mt-3 font-semibold text-[#24463e]">Upload your {schema.label.toLowerCase()} CSV</p><p className="mt-1 text-sm text-[#6b7e77]">Required columns: {schema.columns.join(", ")}</p><label className="mt-4 inline-flex cursor-pointer items-center rounded-lg bg-[#0e5a4f] px-4 py-2 text-sm font-semibold text-white"><input type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => { void processFile(event.target.files?.[0]); event.target.value = ""; }} />Choose CSV file</label></div>{file && <div className={`rounded-lg border p-4 ${valid ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold text-[#24463e]">{file.name}</p><p className="mt-1 text-sm text-[#61766e]">{totalRows} data row{totalRows === 1 ? "" : "s"} · {Math.max(1, Math.ceil(file.size / 1024))} KB {isDemo ? "· demo upload" : ""}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${valid ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>{valid ? "Entire file validated" : "Import blocked"}</span></div>{valid ? <p className="mt-3 text-sm text-emerald-800">All headers and rows are valid. The full file may now be imported.</p> : <p className="mt-3 text-sm leading-6 text-rose-800">{validation.errors.length} issue{validation.errors.length === 1 ? "" : "s"} found. <strong>No rows from this file were imported or saved.</strong> Fix the entries below, then choose the corrected CSV file.</p>}</div>}{validation.errors.length > 0 && <section aria-live="polite" className="rounded-xl border border-rose-200 bg-white"><div className="flex items-start gap-3 border-b border-rose-100 bg-rose-50 px-4 py-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" /><div><p className="font-semibold text-rose-950">Correct these CSV issues before importing</p><p className="mt-1 text-sm text-rose-800">Each issue identifies the exact CSV row and column. Row 1 is the header row.</p></div></div><div className="max-h-64 overflow-auto"><table className="min-w-full text-left text-sm"><thead className="sticky top-0 bg-[#fff8f8] text-xs uppercase tracking-[0.1em] text-rose-800"><tr><th className="px-4 py-3">Row</th><th className="px-4 py-3">Column</th><th className="px-4 py-3">Problem</th><th className="px-4 py-3">Current value</th></tr></thead><tbody className="divide-y divide-rose-100">{validation.errors.map((error, index) => <tr key={`${error.line}-${error.column}-${index}`}><td className="whitespace-nowrap px-4 py-3 font-mono font-bold text-rose-900">{error.line}</td><td className="whitespace-nowrap px-4 py-3 font-semibold text-[#5a423e]">{error.column}</td><td className="px-4 py-3 text-[#6b504b]">{error.message}</td><td className="max-w-48 truncate px-4 py-3 font-mono text-xs text-[#795e57]">{error.value || "—"}</td></tr>)}</tbody></table></div></section>}{totalRows > 0 && <div className="overflow-x-auto rounded-lg border border-[#dfe8e1]"><table className="min-w-full text-left text-xs"><thead className="bg-[#eff5f0] text-[#526961]"><tr><th className="whitespace-nowrap px-3 py-2 font-bold">CSV row</th>{parsed.headers.map((header, index) => <th key={`${header}-${index}`} className="whitespace-nowrap px-3 py-2 font-bold">{header || "[blank header]"}</th>)}</tr></thead><tbody className="divide-y divide-[#e9efea] bg-white">{parsed.rows.map((record) => <tr key={record.line} className={errorLines.has(record.line) ? "bg-rose-50" : ""}><td className="px-3 py-2 font-mono font-bold text-[#657973]">{record.line}</td>{parsed.headers.map((header, index) => <td key={`${header}-${index}`} className="max-w-48 truncate px-3 py-2 text-[#36534b]">{record.cells[index] ?? ""}</td>)}</tr>)}</tbody></table></div>}<DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="button" disabled={!valid || loading} onClick={importRecords} className="bg-[#0e5a4f] hover:bg-[#0a4a40]">{loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Importing verified file…</> : "Import verified file"}</Button></DialogFooter></DialogContent></Dialog>;
}

export { CsvBulkImportDialog, CsvTemplateDownloadButton, csvSchemas };