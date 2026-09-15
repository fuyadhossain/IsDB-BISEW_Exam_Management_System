import { AlertTriangle, ChevronLeft, ChevronRight, FileSearch, Plus, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
function PageHeader({ eyebrow, title, description, action }) {
  return <div className="mb-6 flex flex-col justify-between gap-4 border-b border-[#dce2db] pb-5 lg:flex-row lg:items-end"><div><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.17em] text-[#6d7d78]">{eyebrow ?? "Record management"}</p><h2 className="font-serif text-3xl font-semibold tracking-tight text-[#183b37]">{title}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#657570]">{description}</p></div>{action && <div className="shrink-0">{action}</div>}</div>;
}
function PrimaryLink({ href, children }) {
  return <Link href={href} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0e5a4f] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0a4a40] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0e5a4f] focus-visible:ring-offset-2"><Plus className="h-4 w-4" />{children}</Link>;
}
function StatusBadge({ value }) {
  const status = String(value ?? "\u2014");
  const tone = status.toLowerCase();
  const style = tone.includes("active") || tone.includes("ready") || tone.includes("pass") || tone.includes("clear") || tone.includes("completed") ? "bg-emerald-50 text-emerald-800 ring-emerald-700/10" : tone.includes("inactive") || tone.includes("fail") || tone.includes("ended") ? "bg-rose-50 text-rose-800 ring-rose-700/10" : tone.includes("scheduled") || tone.includes("processing") || tone.includes("review") ? "bg-amber-50 text-amber-800 ring-amber-700/10" : "bg-slate-100 text-slate-700 ring-slate-600/10";
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${style}`}>{status}</span>;
}
function RecordCard({ children, className = "" }) {
  return <section className={`rounded-xl border border-[#dce2db] bg-white shadow-[0_1px_1px_rgba(20,59,56,0.04)] ${className}`}>{children}</section>;
}
function EmptyState({ title = "No records found", description = "Try adjusting the filters or create a new record to continue.", action }) {
  return <div className="m-4 grid min-h-56 place-items-center rounded-xl border border-dashed border-[#cbd5ce] bg-[#f8faf7] p-8 text-center"><div><div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-[#e6f0ed] text-[#0e5a4f]"><FileSearch className="h-5 w-5" /></div><h3 className="font-serif text-xl font-semibold text-[#1e3c38]">{title}</h3><p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-[#6d7d78]">{description}</p>{action && <div className="mt-4">{action}</div>}</div></div>;
}
function ErrorState({ message = "This data could not be loaded right now.", onRetry }) {
  return <RecordCard><div className="m-4 flex flex-col items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-5 sm:flex-row"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" /><div className="flex-1"><p className="font-semibold text-rose-950">Unable to load this section</p><p className="mt-1 text-sm leading-6 text-rose-800">{message}</p></div>{onRetry && <Button variant="outline" size="sm" onClick={onRetry} className="border-rose-200 bg-white text-rose-900">Retry</Button>}</div></RecordCard>;
}
function LoadingState({ rows = 4, title }) {
  return <RecordCard><div className="space-y-3 p-5">{title ? <p className="font-semibold text-[#295148]">{title}</p> : <div className="h-6 w-44 animate-pulse rounded bg-[#eaf0ec]" />}{Array.from({ length: rows }).map((_, index) => <div key={index} className="h-12 animate-pulse rounded bg-[#f3f6f3]" />)}</div></RecordCard>;
}
// `groups` is optional: an array of { label, span } cells drawn in an extra
// header row above the normal column headers, e.g. so "Mid Monthly" can
// visually span its own External + Evidence columns. A group with no
// `span` (or span: 1) just sits above its one column; a plain column list
// with no `groups` prop renders exactly as before — this is purely
// additive so every other DataTable caller is unaffected. Each labeled
// group also gets its own tinted background (cycling through
// GROUP_BAND_COLORS), so e.g. "Mid Monthly" and "Monthly" read as
// distinct blocks instead of one flat band; unlabeled spanning groups
// (blank spacer cells) keep the header's plain background.
const GROUP_BAND_COLORS = ["bg-[#dcefe6]", "bg-[#faedcf]", "bg-[#dbe6f6]"];
function DataTable({ columns, records, empty, rowLabel = "records", pageSize = 10, groups }) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(records.length / pageSize));
  useEffect(() => { setPage((current) => Math.min(Math.max(1, current), pageCount)); }, [pageCount, records]);
  const currentPage = Math.min(page, pageCount);
  const visibleRecords = records.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  let labeledGroupIndex = -1;
  return <RecordCard className="overflow-hidden"><div className="overflow-x-auto"><table className="min-w-full text-left"><thead className="border-b border-[#dce2db] bg-[#fbfcfa]">{groups && <tr className="border-b border-[#e3e9e3]">{groups.map((group, index) => {
    const bandClassName = group.label ? GROUP_BAND_COLORS[(labeledGroupIndex += 1) % GROUP_BAND_COLORS.length] : "";
    return <th key={`group-${index}`} colSpan={group.span ?? 1} scope="colgroup" className={`whitespace-nowrap px-5 py-2 text-center align-middle text-[10px] font-bold uppercase tracking-[0.14em] text-[#3a5850] ${bandClassName} ${group.className ?? ""}`}>{group.label}</th>;
  })}</tr>}<tr className="bg-[#0e5a4f]">{columns.map((column, index) => <th key={`column-${column.key ?? index}`} scope="col" className={`whitespace-nowrap px-5 py-3 align-middle text-[10px] font-extrabold uppercase tracking-[0.14em] text-white ${column.className ?? ""}`}>{column.label}</th>)}</tr></thead><tbody className="divide-y divide-[#edf0ec]">{visibleRecords.map((record, recordIndex) => <tr key={`record-${record.id ?? "missing"}-${(currentPage - 1) * pageSize + recordIndex}`} className="transition-colors hover:bg-[#fbfcfa]">{columns.map((column, columnIndex) => <td key={`cell-${column.key ?? columnIndex}`} className={`px-5 py-4 align-middle text-sm text-[#36504b] ${column.className ?? ""}`}>{
  // Columns like "SN" (serial number) need the record's actual position
  // in the full, unpaginated list — not just the record itself — to
  // print a real running number instead of the same value (or NaN, if a
  // column's render callback expected an index that was never passed)
  // on every row. Pass the absolute index (accounting for the current
  // page) as a second argument alongside the record.
  column.render ? column.render(record, (currentPage - 1) * pageSize + recordIndex) : String(record[column.key] ?? "—")
}</td>)}</tr>)}</tbody></table></div>{!records.length && (empty ?? <EmptyState title={`No ${rowLabel} found`} />)}<TablePagination total={records.length} page={currentPage} pageSize={pageSize} onPageChange={setPage} /></RecordCard>;
}
function FilterBand({ children, onClear }) {
  return <RecordCard className="mb-5"><div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-end">{children}{onClear && <Button type="button" variant="ghost" className="text-[#55716b]" onClick={onClear}><RotateCcw className="mr-2 h-4 w-4" />Clear filters</Button>}</div></RecordCard>;
}
function FilterField({ label, children }) {
  return <label className="flex min-w-40 flex-1 flex-col gap-1.5 text-xs font-semibold text-[#5d706a]"><span className="uppercase tracking-[0.12em]">{label}</span>{children}</label>;
}
function TablePagination({ total, page = 1, pageSize = 10, onPageChange }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), pageCount);
  const first = total ? ((currentPage - 1) * pageSize) + 1 : 0;
  const last = Math.min(total, currentPage * pageSize);
  // When everything already fits on one page (e.g. 15 students with a
  // pageSize of 15), Previous/Next controls that are permanently
  // disabled are just clutter — hide the pager entirely and only show
  // the plain record count instead.
  if (pageCount <= 1) {
    return <div className="border-t border-[#e8ece8] px-5 py-3 text-sm text-[#71817d]">Showing all {total} record{total === 1 ? "" : "s"}</div>;
  }
  return <div className="flex flex-col gap-3 border-t border-[#e8ece8] px-5 py-3 text-sm text-[#71817d] sm:flex-row sm:items-center sm:justify-between"><span>Showing {first}–{last} of {total} records</span><div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => onPageChange?.(currentPage - 1)}><ChevronLeft className="mr-1 h-4 w-4" />Previous</Button><Button type="button" variant="outline" size="sm" disabled={currentPage >= pageCount} onClick={() => onPageChange?.(currentPage + 1)}>Next<ChevronRight className="ml-1 h-4 w-4" /></Button></div></div>;
}
export {
  DataTable,
  EmptyState,
  ErrorState,
  FilterBand,
  FilterField,
  LoadingState,
  PageHeader,
  PrimaryLink,
  RecordCard,
  StatusBadge,
  TablePagination
};