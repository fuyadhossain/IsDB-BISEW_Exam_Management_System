/** Student access style: identity is confirmed before requirements, using the currently running online exam as the only attempt authority. */
import { useCallback, useEffect, useState } from "react";
import { Redirect, useLocation } from "wouter";
import { BadgeCheck, ClipboardCheck, Clock3, Fullscreen, LogOut, UserRoundCheck } from "lucide-react";
import { toast } from "sonner";
import { PublicBrand } from "@/components/app-shell";
import { useAuth } from "@/contexts/AuthContext";
import { studentExamService } from "@/services/services";
import { formatClock, formatScheduleDateTime } from "@/lib/exam-schedule";
import { ymdToDmy } from "@/lib/dob-format";
import { supportsFullscreen, requestFullscreenCompat, exitFullscreenCompat, fullscreenElementCompat } from "@/lib/fullscreen-compat";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

const availabilityMessages = { EXAM_ENDED: "This examination is finished. Please wait for the next scheduled examination.", ADMIN_STOPPED: "This examination has been stopped by an administrator. Please wait for further instructions.", WRONG_BATCH: "An online examination is running, but it is assigned to a different batch.", OFFLINE_ONLY: "A monthly paper is available for this batch, but it can only be printed by an administrator.", NOT_YET_AVAILABLE: "Your examination is not available yet.", NO_ACTIVE_EXAM: "There is currently no running online examination available for your batch." };
const saveAccessGrant = (availability, studentId) => sessionStorage.setItem("isdb_exam_access", JSON.stringify({ examId: availability.exam.id, studentId, expiresAt: availability.expiresAt, attemptSeconds: availability.attemptSeconds, lateEntry: availability.lateEntry, checkedAt: new Date().toISOString() }));

function StudentDetailsCard({ profile }) {
  const details = [
    ["Student ID", profile?.studentId ?? "—"],
    ["Date of birth", profile?.dateOfBirth ? ymdToDmy(profile.dateOfBirth) : "—"],
    ["Profile status", "Verified by examination service"],
  ];
  return <section className="rounded-xl border border-white/15 bg-white/[0.07] p-5 text-white"><div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-100 text-[#0e5a4f]"><UserRoundCheck className="h-5 w-5" /></div><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-100/65">Verified student details</p><h2 className="mt-1 font-serif text-2xl font-semibold">{profile?.name ?? "Student profile"}</h2><p className="mt-1 text-xs leading-5 text-emerald-50/75">Review these details before accepting the examination requirements.</p></div></div><dl className="mt-5 divide-y divide-white/10">{details.map(([label, value]) => <div key={label} className="grid gap-1 py-3 sm:grid-cols-[7.5rem_1fr]"><dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-100/55">{label}</dt><dd className="text-sm font-semibold leading-5 text-white">{value}</dd></div>)}</dl><p className="mt-4 flex gap-2 rounded-lg border border-amber-200/20 bg-amber-100/10 p-3 text-xs leading-5 text-amber-50"><BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" />If any detail is incorrect, exit now and contact the examination administrator before starting.</p></section>;
}

function StudentInstructionsPage() {
  const [, navigate] = useLocation();
  const { session, logout } = useAuth();
  const [agreed, setAgreed] = useState(false);
  const [availability, setAvailability] = useState({ ok: false, availability: "NO_ACTIVE_EXAM" });
  // The first availability check is async, but `availability` starts out
  // as `{ ok: false }` by default — so the "no running exam" unavailable
  // section rendered instantly on every page load/navigation, even when
  // the exam actually was available, for the split second before the
  // real response came back and flipped it. Track whether that first
  // check has actually completed and show a neutral loading state until
  // then, so "unavailable" only ever reflects a real, checked answer.
  const [checked, setChecked] = useState(false);
  const [starting, setStarting] = useState(false);
  const refresh = useCallback(
    () => studentExamService.availability().then((next) => { setAvailability(next); setChecked(true); if (!next.ok) setAgreed(false); }).catch(() => { setAvailability({ ok: false, availability: "NO_ACTIVE_EXAM" }); setChecked(true); }),
    [],
  );
  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 10000);
    return () => window.clearInterval(timer);
  }, [session.name, session.dateOfBirth, refresh]);
  // Not-yet-started exams (READY, before start_at) come back as
  // NOT_YET_AVAILABLE with a schedule.opensAt — tick a "starts in..."
  // clock from that locally every second, instead of only re-checking
  // (and only showing a static message) every 10s via the poll above.
  const opensAt = availability.availability === "NOT_YET_AVAILABLE" ? availability.schedule?.opensAt : null;
  const [secondsUntilOpen, setSecondsUntilOpen] = useState(0);
  useEffect(() => {
    if (!opensAt) return undefined;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((new Date(opensAt).getTime() - Date.now()) / 1000));
      setSecondsUntilOpen(remaining);
      // The 10-second poll above used to be the ONLY thing that ever
      // confirmed the exam had actually opened. So once this local
      // countdown hit 00:00, the student stayed stuck on this screen for
      // up to another 10 seconds waiting for the next poll before the
      // "Start examination" screen appeared. Fire an immediate re-check
      // the instant the countdown reaches zero so the exam unlocks right
      // at 00:00 instead of on a delay. Once the backend confirms the
      // exam is open, `opensAt` becomes null and this effect (and its
      // interval) cleans itself up automatically.
      if (remaining === 0) refresh();
    };
    tick();
    const clock = window.setInterval(tick, 1000);
    return () => window.clearInterval(clock);
  }, [opensAt, refresh]);
  if (session.mode !== "student") return <Redirect to="/student/login" />;
  const exit = () => { logout(); navigate("/student/login"); };
  if (!checked) return <div className="grid min-h-screen place-items-center bg-[#f2f4f1] p-5"><p className="text-sm font-medium text-[#526962]">Checking examination availability…</p></div>;
  const start = async () => {
    if (starting) return; // Prevent double-click from firing a second start sequence.
    setStarting(true);
    try {
      // Browsers only allow requestFullscreen() to be called synchronously
      // inside a user-gesture (e.g. this button's click handler). Any
      // `await` before it — like the availability check that used to run
      // first — consumes the gesture, so requestFullscreen() silently
      // resolves without ever going fullscreen. Fire it first, before any
      // await, then run the async availability check afterward.
      if (!supportsFullscreen()) { toast.error("Fullscreen is required to start the examination on this device."); return; }
      try { await requestFullscreenCompat(); } catch { toast.error("Fullscreen permission is required before the examination can start."); return; }
      if (!fullscreenElementCompat()) { toast.error("Fullscreen could not be enabled. The examination cannot start outside fullscreen."); return; }

      const latest = await studentExamService.availability();
      setAvailability(latest);
      if (!latest.ok) { toast.error(availabilityMessages[latest.availability] ?? "The examination is not currently available."); exitFullscreenCompat(); return; }
      saveAccessGrant(latest, session.userId);
      navigate("/student/exam");
    } finally {
      setStarting(false);
    }
  };
  const exam = availability.exam;
  return <>{starting && <div className="fixed inset-0 z-50 grid place-items-center bg-[#0e2e29]/95 backdrop-blur-sm"><div className="flex flex-col items-center gap-4 px-6 text-center"><div className="h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-white" /><p className="font-serif text-xl font-semibold text-white">Loading, your exam is being prepared</p><p className="text-sm text-emerald-50/70">Please wait — do not close or refresh this tab.</p></div></div>}<div className="min-h-screen bg-[#f2f4f1] p-4 md:p-8"><main className="mx-auto max-w-5xl"><header className="flex items-center justify-between border-b border-[#dbe3dc] pb-5"><PublicBrand /><Button variant="outline" onClick={exit}><LogOut className="mr-2 h-4 w-4" />Exit</Button></header><div className="mt-8 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]"><aside className="rounded-xl bg-[#143b38] p-6 text-white"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-100/60">Step 1 of 2 · Confirm identity</p><h1 className="mt-3 font-serif text-3xl font-semibold">Your student record</h1><p className="mt-3 text-sm leading-6 text-emerald-50/75">The details below are attached to this examination attempt.</p><div className="mt-6"><StudentDetailsCard profile={session.studentDetails} /></div><div className="mt-5 border-t border-white/10 pt-5">{availability.ok ? <><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-100/55">Assigned examination</p><p className="mt-2 font-serif text-xl font-semibold">{exam?.title}</p><p className="mt-2 text-sm leading-6 text-emerald-50/80">Exam no. {exam?.number} · Online dynamic<br />Available time: {Math.ceil(availability.attemptSeconds / 60)} minutes<br />Closes at: {formatScheduleDateTime(exam?.endDate)}</p>{availability.lateEntry && <p className="mt-4 rounded-lg border border-amber-300/30 bg-amber-100/10 p-3 text-xs leading-5 text-amber-50">You entered after opening. Your available time is limited to the remaining time before closure.</p>}</> : <><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-100/55">Assigned examination</p><p className="mt-2 text-sm leading-6 text-emerald-50/80">No examination is currently running for you — check the panel on the right for details.</p></>}</div></aside><section className="rounded-xl border border-[#dce4dd] bg-white p-6 md:p-8">{!availability.ok ? <><div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-700"><ClipboardCheck className="h-5 w-5" /></div><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#72827e]">Step 2 of 2 · Examination availability</p><h2 className="mt-1 font-serif text-2xl font-semibold text-[#183d37]">Examination unavailable</h2></div></div><div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-6"><h3 className="font-serif text-xl font-semibold text-amber-950">{availabilityMessages[availability.availability] ?? "This examination is unavailable."}</h3><p className="mt-3 text-sm leading-6 text-amber-900">No offline monthly paper can be opened from the student portal. Please wait for the next Running online exam — this page checks again automatically every few seconds.</p>{availability.availability === "NOT_YET_AVAILABLE" && opensAt && <div className="mt-4 border-t border-amber-200 pt-4"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-800">Examination starts in</p><p className="mt-1 inline-flex items-center gap-2 font-mono text-3xl font-bold tabular-nums text-amber-950"><Clock3 className="h-6 w-6" />{formatClock(secondsUntilOpen)}</p><p className="mt-2 text-xs text-amber-900">Scheduled start: {formatScheduleDateTime(opensAt)}</p><ul className="mt-4 space-y-1.5 text-xs leading-5 text-amber-900"><li>• Keep this page open — it will unlock automatically when the exam opens.</li><li>• Have your device charged and connected to a stable internet connection.</li><li>• The exam will require fullscreen mode and must be completed in one sitting.</li><li>• Do not refresh, close the tab, or navigate away while waiting.</li></ul></div>}</div><div className="mt-6 flex justify-end"><Button variant="outline" onClick={exit}><LogOut className="mr-2 h-4 w-4" />Return to student sign in</Button></div></> : <><div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#eaf4ee] text-[#0e5a4f]"><ClipboardCheck className="h-5 w-5" /></div><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#72827e]">Step 2 of 2 · Examination requirements</p><h2 className="mt-1 font-serif text-3xl font-semibold text-[#183d37]">Read before starting</h2></div></div><ol className="mt-7 space-y-4 text-sm leading-6 text-[#526963]"><li><strong>1.</strong> Confirm that the student details shown on the left are correct. Do not start if they belong to another student.</li><li><strong>2.</strong> Ensure your device has stable power and internet access before beginning the attempt.</li><li><strong>3.</strong> Review every question before selecting an answer. Selected answers are saved as you work.</li><li><strong>4.</strong> Do not copy, paste, right-click, or leave the examination screen. Observable events may be reported to the examination service.</li><li><strong>5.</strong> Your timer is the smaller of the configured duration and the time remaining until exam closure.</li><li><strong>6.</strong> After submitting, you will receive a completion confirmation only. Results and correct answers are not displayed here.</li></ol><div className="mt-7 flex items-start gap-3 rounded-lg border border-[#dce5de] bg-[#fafcf9] p-4 text-sm font-medium leading-6 text-[#3d5851]"><Checkbox id="student-requirements-confirmation" checked={agreed} onCheckedChange={(checked) => setAgreed(Boolean(checked))} /><label htmlFor="student-requirements-confirmation" className="cursor-pointer">I confirm the student details above are mine and I have read the examination requirements.</label></div>{agreed && <p className="mt-2 text-xs font-semibold text-emerald-700" role="status">Confirmation recorded. You can start the examination now.</p>}<div className="mt-6 flex justify-end"><Button type="button" disabled={!agreed || starting} onClick={start} className="bg-[#0e5a4f] hover:bg-[#0a4a40]"><Fullscreen className="mr-2 h-4 w-4" />{starting ? "Starting…" : "Start examination"}</Button></div></>}</section></div></main></div></>;
}

export { StudentInstructionsPage };