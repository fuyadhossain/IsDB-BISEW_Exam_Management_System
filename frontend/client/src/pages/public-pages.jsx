/** Public access style: institutional authentication that hands students only to the running online examination selected by administration. */
import { useState } from "react";
import { Redirect, useLocation } from "wouter";
import { BookOpenCheck, Eye, EyeOff, LogOut } from "lucide-react";
import { PublicBrand } from "@/components/app-shell";
import { useAuth } from "@/contexts/AuthContext";
import { studentExamService } from "@/services/services";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { autoFormatDmyInput, dmyToYmd, DMY_PATTERN } from "@/lib/dob-format";

function AuthFrame({ student, children }) {
  return <div className="min-h-screen bg-[#f3f2ec] p-4 md:p-7"><div className={`mx-auto grid min-h-[calc(100vh-2rem)] max-w-6xl overflow-hidden rounded-2xl border border-[#d8e0d9] bg-white shadow-[0_20px_60px_rgba(19,59,55,0.12)] ${student ? "lg:grid-cols-[1.1fr_0.9fr]" : "lg:grid-cols-[0.88fr_1.12fr]"}`}><section className="relative hidden overflow-hidden bg-[#143b38] p-10 lg:flex lg:flex-col lg:justify-between"><div className="absolute inset-0 bg-cover bg-center opacity-30" style={{ backgroundImage: `url(/manus-storage/${student ? "student-exam-focus_7fff52c1" : "admin-login-archive_72a65c43"}.png)` }} /><div className="absolute inset-0 opacity-30" style={{ backgroundImage: "repeating-linear-gradient(180deg, transparent 0, transparent 43px, rgba(233,246,239,0.20) 44px)" }} /><div className="relative"><div className="flex max-w-md items-center justify-between border-y border-white/20 py-3 text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-100/70"><span>Examination governance</span><span>Record 01</span></div><div className="mt-8 grid h-14 w-14 place-items-center rounded-xl border border-white/20 bg-white/10 text-emerald-50"><BookOpenCheck className="h-7 w-7" /></div><p className="mt-9 max-w-md font-serif text-4xl font-semibold leading-tight text-white">{student ? "A focused space for your examination attempt." : "Accountable examination administration."}</p><p className="mt-5 max-w-md text-base leading-7 text-emerald-50/75">{student ? "Your assessment opens only when the examination service verifies eligibility and availability." : "Manage academic records, examination configuration, and authorized outcomes through one deliberate workspace."}</p></div><div className="relative border-t border-white/15 pt-5 text-sm leading-6 text-emerald-50/70">{student ? "No result, score, marks, or answer information is shown after submission." : "Access is limited to authorized roles and permitted course records."}</div></section><section className="relative flex min-h-full flex-col bg-[#fcfbf6] p-6 sm:p-10"><div className="pointer-events-none absolute left-6 right-6 top-5 h-px bg-[#d8e1d8] sm:left-10 sm:right-10" /><div className="relative flex flex-1 items-center py-8 lg:py-0">{children}</div><p className="relative text-xs leading-5 text-[#75847f]">© IsDB-BISEW · Examination Management System</p></section></div></div>;
}

function AdminLoginPage() {
  // Quick sign-in shortcuts for the two accounts currently in use. Bcrypt
  // hashes in the database can't be reversed into plaintext, so only
  // accounts with a known password can appear here.
  const QUICK_LOGIN_ACCOUNTS = [
    { label: "Super Admin", email: "admin@example.test", password: "ChangeMe!123" },
    { label: "Course Admin (PWAD)", email: "fuyadhossain@example.test", password: "12345678" },
  ];
  const [, navigate] = useLocation();
  const { session, loginAdmin } = useAuth();
  const [email, setEmail] = useState(() => localStorage.getItem("isdb_remembered_email") ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Must agree with AdminRoute's definition of "logged in" (session flag
  // AND a token present) — otherwise a stale session with no token bounces
  // forever: AdminRoute sends it here for lacking a token, this page sends
  // it back to /admin/dashboard for having session.mode === "admin",
  // which is the "Maximum update depth exceeded" / <Redirect> loop.
  if (session.mode === "admin" && localStorage.getItem("isdb_admin_token")) return <Redirect to="/admin/dashboard" />;
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true); setError("");
    const response = await loginAdmin(email, password);
    setBusy(false);
    if (!response.ok) { setError(response.message ?? "Unable to sign in."); return; }
    if (remember) {
      localStorage.setItem("isdb_remembered_email", email);
    } else {
      localStorage.removeItem("isdb_remembered_email");
      localStorage.removeItem("isdb_session");
    }
    navigate("/admin/dashboard");
  };
  return <AuthFrame><div className="mx-auto w-full max-w-md"><PublicBrand /><p className="mt-10 text-[10px] font-bold uppercase tracking-[0.17em] text-[#6f807b]">Administrative access</p><h1 className="mt-2 font-serif text-4xl font-semibold text-[#173c37]">Sign in to continue</h1><p className="mt-3 text-sm leading-6 text-[#6e7d79]">Use your authorized administrative email and password. Access is role-aware in this demonstration and must be enforced by Laravel in production.</p><form onSubmit={submit} className="mt-8 space-y-5"><div className="space-y-2"><Label htmlFor="admin-email">Email address</Label><Input id="admin-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="name@institution.org" required /></div><div className="space-y-2"><Label htmlFor="admin-password">Password</Label><div className="relative"><Input id="admin-password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" className="pr-11" required /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 px-3 text-[#71817c]" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div><label className="flex items-center gap-2 text-sm text-[#5b706a]"><Checkbox checked={remember} onCheckedChange={(checked) => setRemember(checked === true)} />Remember this session</label>{error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}<Button type="submit" disabled={busy} className="w-full bg-[#0e5a4f] hover:bg-[#0a4a40]">{busy ? "Verifying access…" : "Sign in to administration"}</Button></form><div className="mt-6 border-t border-[#e4e9e4] pt-5"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8a978f]">Quick sign-in (dev only)</p><div className="mt-3 grid gap-2">{QUICK_LOGIN_ACCOUNTS.map(account => <button key={account.email} type="button" disabled={!account.password} onClick={() => { setEmail(account.email); setPassword(account.password); }} className="flex items-center justify-between rounded-lg border border-[#d8e0d9] bg-white px-3 py-2 text-left text-sm text-[#2f4d47] transition hover:border-[#0e5a4f]/40 hover:bg-[#f3f8f5] disabled:cursor-not-allowed disabled:opacity-40" title={account.password ? "Click to autofill this account's credentials" : "Password not configured yet — edit QUICK_LOGIN_ACCOUNTS in public-pages.jsx"}><span>{account.label}</span><span className="text-xs text-[#7c8b85]">{account.email}</span></button>)}</div></div></div></AuthFrame>;
}

const availabilityMessages = { NOT_YET_AVAILABLE: "Your examination is not available yet.", EXAM_ENDED: "This examination is finished. Please wait for the next scheduled examination.", ADMIN_STOPPED: "This examination has been stopped by an administrator. Please wait for further instructions.", WRONG_BATCH: "An online examination is running, but it is assigned to a different batch.", OFFLINE_ONLY: "A monthly paper is available for this batch, but it can only be printed by an administrator.", ALREADY_SUBMITTED: "You have already completed this examination.", NO_ACTIVE_EXAM: "There is currently no examination available for you.", INELIGIBLE: "The Student ID or date of birth could not be verified." };

function StudentLoginPage() {
  const STUDENT_QUICK_LOGIN = [
    { studentId: "1300001", dob: "09-12-1999" },
    { studentId: "1300002", dob: "04-12-2001" },
    { studentId: "1300003", dob: "01-01-2005" },
    { studentId: "1300004", dob: "20-09-2002" },
    { studentId: "1300005", dob: "15-04-2005" },
  ];
  const [, navigate] = useLocation();
  const { session, loginStudent } = useAuth();
  const [studentId, setStudentId] = useState("");
  const [dob, setDob] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Same reasoning as AdminLoginPage above — must match StudentRoute's
  // check exactly (session flag AND token) or a stale session with no
  // token causes an infinite redirect loop between here and the guard.
  if (session.mode === "student" && localStorage.getItem("isdb_student_token")) return <Redirect to="/student/instructions" />;
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    // `dob` is what the student typed, shown/entered as DD-MM-YYYY. The
    // backend (StudentAuthService) compares it against
    // date_of_birth->format('Y-m-d') exactly, so it must be converted to
    // YYYY-MM-DD before it is sent — the displayed format and the wire
    // format are intentionally different.
    const dobForApi = dmyToYmd(dob);
    if (!dobForApi) {
      setBusy(false);
      setError("Please enter the date of birth as DD-MM-YYYY.");
      return;
    }
    const response = await studentExamService.login(studentId, dobForApi);
    setBusy(false);
    // The student is genuinely logged in the moment their Student ID and
    // date of birth are verified — `response.profile` is only ever
    // populated once that check passes (see studentExamService.login).
    // Whether an exam happens to be available right now is a completely
    // separate question, answered on the instructions page itself (it
    // polls availability on its own). Gating navigation here on
    // `response.ok`/`response.availability === "AVAILABLE"` meant a real,
    // valid student with no exam currently running could never even get
    // past this screen to see their own name/ID or a "starts in..."
    // countdown — they were stuck seeing a raw inline error forever, as if
    // their login itself had failed.
    if (response.profile) {
      loginStudent(studentId, dobForApi, response.profile);
      navigate("/student/instructions");
      return;
    }
    setError(response.message ?? availabilityMessages[response.availability] ?? "The Student ID or date of birth could not be verified.");
  };
  return <AuthFrame student><div className="mx-auto w-full max-w-md"><PublicBrand /><p className="mt-10 text-[10px] font-bold uppercase tracking-[0.17em] text-[#6f807b]">Student examination portal</p><h1 className="mt-2 font-serif text-4xl font-semibold text-[#173c37]">Access your examination</h1><p className="mt-3 text-sm leading-6 text-[#6e7d79]">Enter your assigned Student ID and date of birth. You'll see your examination's availability on the next screen.</p><form onSubmit={submit} className="mt-8 space-y-5"><div className="space-y-2"><Label htmlFor="student-id">Student ID</Label><Input id="student-id" value={studentId} onChange={(event) => setStudentId(event.target.value)} placeholder="e.g. STU-1001" required /></div><div className="space-y-2"><Label htmlFor="date-of-birth">Date of birth (DD-MM-YYYY)</Label><Input id="date-of-birth" type="text" inputMode="numeric" pattern={DMY_PATTERN} placeholder="DD-MM-YYYY" maxLength={10} value={dob} onChange={(event) => setDob(autoFormatDmyInput(event.target.value))} required /></div>{error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-800">{error}</div>}<Button type="submit" disabled={busy} className="w-full bg-[#0e5a4f] hover:bg-[#0a4a40]">{busy ? "Verifying identity…" : "Continue"}</Button></form><div className="mt-6 border-t border-[#e4e9e4] pt-5"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8a978f]">Quick sign-in (dev only)</p><div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">{STUDENT_QUICK_LOGIN.map(item => <button key={item.studentId} type="button" onClick={() => { setStudentId(item.studentId); setDob(item.dob); }} className="flex items-center justify-between rounded-lg border border-[#d8e0d9] bg-white px-3 py-2 text-left text-sm text-[#2f4d47] transition hover:border-[#0e5a4f]/40 hover:bg-[#f3f8f5]" title="Click to autofill this student's credentials"><span className="font-semibold">{item.studentId}</span><span className="text-xs text-[#7c8b85]">{item.dob}</span></button>)}</div></div></div></AuthFrame>;
}

function StudentCompletionPage({ automatic = false }) {
  const [, navigate] = useLocation();
  const { logout } = useAuth();
  return <div className="grid min-h-screen place-items-center bg-[#f1f4f1] p-5"><main className="w-full max-w-lg rounded-2xl border border-[#dce5dd] bg-white p-8 text-center shadow-[0_20px_60px_rgba(19,59,55,0.10)]"><div className={`mx-auto grid h-14 w-14 place-items-center rounded-full ${automatic ? "bg-emerald-100" : "bg-[#e7f2eb]"}`}><BookOpenCheck className="h-7 w-7 text-[#0e5a4f]" /></div><p className="mt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-[#6f817a]">Examination complete</p><h1 className="mt-2 font-serif text-3xl font-semibold text-[#183d37]">Your examination has been submitted successfully.</h1><p className="mt-4 text-sm leading-6 text-[#657670]">{automatic ? "Time expired. Your current answers were saved and your examination was submitted automatically." : "No score, marks, pass/fail information, or answer review is displayed in the student portal."}</p><Button onClick={() => { logout(); navigate("/student/login"); }} className="mt-7 bg-[#0e5a4f] hover:bg-[#0a4a40]"><LogOut className="mr-2 h-4 w-4" />Return to student sign in</Button></main></div>;
}

export { AdminLoginPage, StudentCompletionPage, StudentLoginPage };