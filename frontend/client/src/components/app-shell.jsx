import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Bell, BookOpenCheck, ChevronLeft, ChevronRight, ClipboardCheck, FileBarChart2, FileClock, FileQuestion, FileText, GraduationCap, History, LayoutDashboard, LogOut, Menu, Settings, ShieldAlert, ShieldCheck, UsersRound, X } from "lucide-react";
import { pageTitleFromPath } from "@/lib/domain";
import { useAuth } from "@/contexts/AuthContext";
import { courseScopeLabel, isCourseScopedSession } from "@/lib/course-scope";
import { Button } from "@/components/ui/button";
const groups = [
  { label: "Overview", items: [{ label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard }] },
  { label: "Academic management", items: [{ label: "Courses", href: "/admin/courses", icon: GraduationCap, permission: "courses.view" }, { label: "TSP", href: "/admin/tsps", icon: UsersRound, permission: "tsps.view" }, { label: "Rounds", href: "/admin/rounds", icon: FileClock, permission: "rounds.view" }, { label: "Batches", href: "/admin/batches", icon: BookOpenCheck, permission: "batches.view" }, { label: "Students", href: "/admin/students", icon: UsersRound, permission: "students.view" }] },
  { label: "Curriculum", items: [{ label: "Subjects", href: "/admin/subjects", icon: BookOpenCheck, permission: "curriculum.view" }, { label: "Modules", href: "/admin/modules", icon: BookOpenCheck, permission: "curriculum.view" }, { label: "Competency units", href: "/admin/competency-units", icon: ClipboardCheck, permission: "curriculum.view" }, { label: "Elements", href: "/admin/elements", icon: FileQuestion, permission: "curriculum.view" }, { label: "CSV Import Curriculum", href: "/admin/curriculum/import", icon: FileText, permission: "curriculum.create" }] },
  { label: "Examination", items: [{ label: "Question bank", href: "/admin/questions", icon: FileQuestion, permission: "questions.view" }, { label: "CSV Import Question", href: "/admin/questions/import", icon: FileText, permission: "questions.create" }, { label: "Import history", href: "/admin/questions/import/history", icon: History, permission: "questions.create" }, { label: "Exam sets", href: "/admin/exam-sets", icon: ClipboardCheck, permission: "exam_sets.view" }, { label: "Exams", href: "/admin/exams", icon: ClipboardCheck, permission: "exams.view" }] },
  { label: "Governance", items: [{ label: "Results", href: "/admin/results", icon: FileBarChart2, permission: "results.view" }, { label: "Reports", href: "/admin/reports", icon: FileBarChart2, permission: "results.view" }, { label: "Users", href: "/admin/users", icon: UsersRound, permission: "manage_users" }, { label: "Roles", href: "/admin/roles", icon: ShieldCheck, permission: "manage_roles" }, { label: "Permissions", href: "/admin/permissions", icon: ShieldCheck, permission: "manage_roles" }, { label: "Audit logs", href: "/admin/audit-logs", icon: FileClock, permission: "manage_roles" }, { label: "Violations", href: "/admin/violations", icon: ShieldAlert, permission: "violations.view" }] },
  // "My Account" opens the password-change page (AccountSettingsPage, at
  // /admin/account) for any admin. "System Settings" is visible to Super
  // Admin (bypasses all permission checks) and to Consultant (granted
  // 'settings.view'/'update'/'create' explicitly -- see the
  // grant_settings_to_exam_manager migration) -- no other role has it.
  { label: "System", items: [
    { label: "My Account", href: "/admin/account", icon: Settings },
    { label: "System Settings", href: "/admin/settings", icon: Settings, permission: "settings.view" },
  ] }
];
function BrandSeal({ size = "h-10 w-10", imageSize = "h-8 w-8", light = false }) {
  const [brokenImage, setBrokenImage] = useState(false);
  // The real logo already has its own colors/border built into the image
  // (it's a self-contained badge), so it doesn't need a card behind it —
  // only wrap it in the light backdrop box when falling back to the plain
  // BookOpenCheck icon, which does need contrast against the dark sidebar.
  const wrapperClass = brokenImage
    ? `grid ${size} shrink-0 place-items-center rounded-xl border shadow-sm ${light ? "border-[#bdd4c8] bg-[#f2f7f3]" : "border-white/20 bg-[#f4f7f2]"}`
    : `grid ${size} shrink-0 place-items-center`;
  return <div className={wrapperClass}>{!brokenImage && <img src="/manus-storage/isdb-bisew-brand-logo_29718725.png" alt="IsDB-BISEW" onError={() => setBrokenImage(true)} className={`${imageSize} object-contain`} />}{brokenImage && <BookOpenCheck aria-hidden="true" className={`${imageSize} text-[#0e5a4f]`} />}</div>;
}
function Brand({ compact = false }) {
  return <Link href="/admin/dashboard" className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"><BrandSeal /><div className={compact ? "hidden" : "min-w-0"}><p className="font-serif text-lg font-semibold leading-none tracking-[0.025em] text-white">IsDB-BISEW</p><p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.17em] text-emerald-100/70">Examination system</p></div></Link>;
}
function AdminShell({ children }) {
  const [path, navigate] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { session, hasPermission, logout } = useAuth();
  const menu = <aside className={`flex h-full flex-col bg-[#143b38] ${collapsed ? "w-[76px]" : "w-72"}`}><div className="border-b border-white/10"><Brand compact={collapsed} /></div><nav className="ledger-scroll flex-1 space-y-5 overflow-y-auto px-3 py-5">{groups.map((group) => {
    // TSP and Rounds visibility now follows their tsps.view / rounds.view permissions only, so a
    // course-scoped admin/consultant whose role has been granted that permission sees the item.
    // Roles, Permissions, and Audit logs stay Super Admin-only regardless of any permission flag,
    // since those pages manage access control itself.
    const entries = group.items.filter((item) => hasPermission(item.permission) && (!isCourseScopedSession(session) || !["Roles", "Permissions", "Audit logs"].includes(item.label)));
    if (!entries.length) return null;
    return <section key={group.label}><p className={`mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-100/45 ${collapsed ? "sr-only" : ""}`}>{group.label}</p><div className="space-y-1">{entries.map((item) => {
      const Icon = item.icon;
      const active = path === item.href || item.href !== "/admin/dashboard" && path.startsWith(`${item.href}/`) && !entries.some((entry) => entry.href !== item.href && path === entry.href);
      return <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${active ? "bg-white text-[#16413d] shadow-sm" : "text-emerald-50/75 hover:bg-white/10 hover:text-white"}`}><Icon className="h-[18px] w-[18px] shrink-0" /><span className={collapsed ? "sr-only" : "truncate"}>{item.label}</span></Link>;
    })}</div></section>;
  })}</nav>{isCourseScopedSession(session) && !collapsed && <div className="mx-3 mb-3 rounded-lg border border-white/10 bg-white/[0.07] px-3 py-2.5"><p className="text-[9px] font-bold uppercase tracking-[0.15em] text-emerald-100/55">Your course scope</p><p className="mt-1 text-sm font-semibold text-white">{courseScopeLabel(session)}</p></div>}<div className="border-t border-white/10 p-3"><button type="button" onClick={() => {
    logout();
    navigate("/admin/login");
  }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-emerald-50/75 transition-colors hover:bg-white/10 hover:text-white"><LogOut className="h-[18px] w-[18px]" /><span className={collapsed ? "sr-only" : ""}>Sign out</span></button></div></aside>;
  return <div className="min-h-screen bg-[#f4f3ef] text-[#1f2c2a]"><div className="fixed inset-y-0 left-0 z-40 hidden lg:block">{menu}<button type="button" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} className="absolute -right-3 top-24 grid h-7 w-7 place-items-center rounded-full border border-stone-200 bg-white text-[#0e5a4f] shadow-sm">{collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}</button></div><div className={`min-h-screen transition-[margin] duration-200 ${collapsed ? "lg:ml-[76px]" : "lg:ml-72"}`}><header className="sticky top-0 z-30 flex h-[73px] items-center justify-between border-b border-[#dce2db] bg-[#fbfbf8]/90 px-4 backdrop-blur md:px-7"><div className="flex items-center gap-3"><Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu className="h-5 w-5" /></Button><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#6d7d78]">Administration / {path.includes("/create") ? "Create record" : "Workspace"}</p><h1 className="font-serif text-[22px] font-semibold leading-tight text-[#173a36]">{pageTitleFromPath(path)}</h1></div></div><div className="flex items-center gap-3"><Button variant="outline" size="icon" className="hidden rounded-full border-[#d7ded7] bg-white text-[#52706a] sm:inline-flex" aria-label="Notifications"><Bell className="h-4 w-4" /></Button><Link href="/admin/account" className="hidden border-l border-[#dce2db] pl-3 sm:block"><p className="text-sm font-semibold text-[#193b37]">{session.name}</p><p className="text-xs text-[#72827e]">My account</p></Link><Link href="/admin/account" className="grid h-9 w-9 place-items-center rounded-full bg-[#0e5a4f] text-sm font-bold text-white">{session.name.slice(0, 1)}</Link></div></header><main className="p-4 pb-12 md:p-7 md:pb-12">{children}</main></div>{mobileOpen && <div className="fixed inset-0 z-50 lg:hidden"><button type="button" aria-label="Close navigation" onClick={() => setMobileOpen(false)} className="absolute inset-0 bg-[#132b29]/50" /><div className="absolute inset-y-0 left-0 w-[88vw] max-w-xs shadow-2xl">{menu}<Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)} className="absolute right-3 top-3 text-white" aria-label="Close navigation"><X className="h-5 w-5" /></Button></div></div>}</div>;
}
function PublicBrand() {
  return <div className="flex items-center gap-3"><BrandSeal size="h-12 w-12" imageSize="h-10 w-10" light /><div><p className="font-serif text-xl font-semibold tracking-[0.025em] text-[#173a36]">IsDB-BISEW</p><p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[#6d7d78]">Examination system</p></div></div>;
}
function InstitutionWatermark() { return <p className="pointer-events-none fixed bottom-2 right-4 z-[60] text-[10px] font-bold uppercase tracking-[0.14em] text-[#1b4a43]/40">Made by IsDB-BISEW PWAD Batch 71</p>; }
export {
  AdminShell,
  InstitutionWatermark,
  PublicBrand
};