/** Active attempt style: each student sees only the dynamic online exam access granted for their own running assessment. */
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronUp, Clock3, LogOut, ShieldAlert } from "lucide-react";
import { Redirect, useLocation } from "wouter";
import { studentExamService } from "@/services/services";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { StudentCompletionPage } from "@/pages/public-pages";
import {
  exitFullscreenCompat,
  fullscreenElementCompat,
  FULLSCREEN_CHANGE_EVENTS,
} from "@/lib/fullscreen-compat";

const loadExamAccess = () => {
  try {
    return JSON.parse(sessionStorage.getItem("isdb_exam_access") ?? "null");
  } catch {
    return null;
  }
};
const createAccessGrant = (availability, studentId) => ({
  examId: availability.exam.id,
  studentId,
  expiresAt: availability.expiresAt,
  attemptSeconds: availability.attemptSeconds,
  lateEntry: availability.lateEntry,
  checkedAt: new Date().toISOString(),
});
const draftKey = (attemptId) => `isdb_exam_attempt_draft_${attemptId}`;
const loadAttemptDraft = (attemptId) => {
  try {
    const draft = JSON.parse(
      localStorage.getItem(draftKey(attemptId)) ?? "null",
    );
    return draft?.attemptId === attemptId ? draft : null;
  } catch {
    return null;
  }
};
const storeAttemptDraft = (draft) =>
  localStorage.setItem(draftKey(draft.attemptId), JSON.stringify(draft));
const clearAttemptDraft = (attemptId) =>
  localStorage.removeItem(draftKey(attemptId));
const remainingSecondsUntil = (expiresAt) =>
  Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
const formatTime = (seconds) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

function StudentExamPage() {
  const [, navigate] = useLocation();
  const { session, logout } = useAuth();
  const [access, setAccess] = useState(loadExamAccess);
  const [accessChecked, setAccessChecked] = useState(false);
  const [attempt, setAttempt] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [expiresAt, setExpiresAt] = useState(() => access?.expiresAt ?? "");
  const [answers, setAnswers] = useState({});
  const [seconds, setSeconds] = useState(() =>
    remainingSecondsUntil(access?.expiresAt ?? new Date().toISOString()),
  );
  const [submitConfirm, setSubmitConfirm] = useState(false);
  const [violation, setViolation] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [autoSubmitted, setAutoSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState("");
  const [activeQuestionId, setActiveQuestionId] = useState("");
  const [closureMessage, setClosureMessage] = useState("");
  const boundaryExitStarted = useRef(false);
  const submitRef = useRef(null);
  const autoSubmitStarted = useRef(false);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (session.mode !== "student") {
      setAccessChecked(true);
      return void 0;
    }
    const stored = loadExamAccess();
    if (stored?.examId && stored.studentId === session.userId) {
      setAccess(stored);
      setExpiresAt(stored.expiresAt ?? "");
      setAccessChecked(true);
      return void 0;
    }
    studentExamService
      .availability()
      .then((latest) => {
        if (latest.ok) {
          const recovered = createAccessGrant(latest, session.userId);
          sessionStorage.setItem("isdb_exam_access", JSON.stringify(recovered));
          setAccess(recovered);
          setExpiresAt(recovered.expiresAt);
        } else {
          setAccess(null);
          setExpiresAt("");
        }
        setAccessChecked(true);
      })
      .catch(() => {
        setAccess(null);
        setExpiresAt("");
        setAccessChecked(true);
      });
    return void 0;
  }, [session.mode, session.userId]);
  useEffect(() => {
    if (
      session.mode !== "student" ||
      !access?.examId ||
      access.studentId !== session.userId
    )
      return void 0;
    let active = true;
    setLoadError("");
    studentExamService
      .getAttempt(access.examId, session.userId)
      .then((next) => {
        if (!active) return;
        if (!next?.questions?.length) {
          setLoadError(
            "This online attempt is no longer available. Please return to the student portal.",
          );
          return;
        }
        const draft = loadAttemptDraft(next.id);
        setAttempt(next);
        setAnswers(draft?.answers ?? {});
        setActiveQuestionId(draft?.activeQuestionId ?? next.questions[0].id);
      })
      .catch((error) => {
        if (!active) return;
        // Surface the specific reason the backend rejected the attempt (e.g. exam not
        // currently available, student not eligible, insufficient question pool) instead
        // of a generic message, so students/admins can see what actually went wrong.
        const errors =
          error?.response?.data?.data?.errors ?? error?.response?.data?.errors;
        const firstError = errors
          ? Object.values(errors).flat().find(Boolean)
          : null;
        setLoadError(
          firstError ||
            error?.response?.data?.message ||
            "The dynamic examination attempt could not be prepared.",
        );
      });
    return () => {
      active = false;
    };
  }, [
    access?.examId,
    access?.studentId,
    session.mode,
    session.userId,
    retryToken,
  ]);
  const fiveMinuteWarningShown = useRef(false);
  useEffect(() => {
    if (submitted) return void 0;
    const updateTimer = () => {
      const remaining = remainingSecondsUntil(expiresAt);
      setSeconds(remaining);
      // Fire once, right as the attempt crosses the 5-minute mark, so the
      // student gets a clear heads-up before time runs out instead of only
      // noticing the header timer turn red at 2 minutes.
      if (
        remaining > 0 &&
        remaining <= 300 &&
        !fiveMinuteWarningShown.current
      ) {
        fiveMinuteWarningShown.current = true;
        toast.warning("5 minutes remaining", {
          description:
            "Please review your answers and submit soon — the exam will auto-submit when time runs out.",
          duration: 8000,
        });
      }
    };
    updateTimer();
    const interval = window.setInterval(updateTimer, 1000);
    return () => window.clearInterval(interval);
  }, [expiresAt, submitted]);
  useEffect(() => {
    if (seconds !== 0 || submitted || !attempt || autoSubmitStarted.current)
      return void 0;
    autoSubmitStarted.current = true;
    void submitRef.current?.(true);
  }, [attempt, seconds, submitted]);
  useEffect(() => {
    if (attempt && !submitted)
      storeAttemptDraft({
        attemptId: attempt.id,
        answers,
        expiresAt,
        activeQuestionId,
        updatedAt: new Date().toISOString(),
      });
  }, [activeQuestionId, answers, attempt, expiresAt, submitted]);
  useEffect(() => {
    if (!attempt || submitted) return void 0;
    let frameId;
    const updateActiveQuestion = () => {
      const readingLine = Math.max(184, window.innerHeight * 0.34);
      const cards = attempt.questions.map((question) => ({
        id: question.id,
        top:
          document
            .getElementById(`question-card-${question.id}`)
            ?.getBoundingClientRect().top ?? Infinity,
      }));
      const reading =
        [...cards].reverse().find((card) => card.top <= readingLine) ??
        cards[0];
      if (reading && Number.isFinite(reading.top))
        setActiveQuestionId((current) =>
          current === reading.id ? current : reading.id,
        );
    };
    const onScroll = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        updateActiveQuestion();
      });
    };
    updateActiveQuestion();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, [attempt, submitted]);
  useEffect(() => {
    if (!attempt || submitted) return void 0;
    const flag = (type) => {
      if (!violation) setViolation(type);
    };
    const visibility = () =>
      document.visibilityState === "hidden" &&
      flag("Loss of examination focus");
    const copy = (event) => {
      event.preventDefault();
      flag("Restricted copy action");
    };
    const paste = (event) => {
      event.preventDefault();
      flag("Restricted paste action");
    };
    const context = (event) => {
      // Right-click is blocked (no context menu with copy/inspect options),
      // but this alone shouldn't end the exam session — a student
      // right-clicking is often just an accidental click, not an attempt
      // to leak the exam. Text selection is separately disabled site-wide
      // on this page via the select-none class on the outer wrapper.
      event.preventDefault();
    };
    const key = (event) => {
      const k = event.key.toLowerCase();
      // Print Screen itself cannot be intercepted or blocked by any
      // website — it's an OS-level key that the operating system handles
      // directly (Windows/macOS capture the screenshot before the
      // browser's JavaScript ever sees the keypress). No web app,
      // including real commercial proctoring platforms, can prevent it.
      // What CAN be blocked here: every keyboard shortcut that
      // Chrome/Firefox/Edge actually dispatch a "keydown" event for —
      // copy/paste/save/print plus browser-navigation shortcuts (new
      // tab, new window, close tab, dev tools, view source, find,
      // refresh) that would let a student leave the locked-down exam
      // screen or pull in outside material.
      if (
        (event.ctrlKey || event.metaKey) &&
        ["c", "v", "x", "p", "s", "u", "t", "n", "w", "f", "r", "j"].includes(k)
      ) {
        event.preventDefault();
        flag("Restricted keyboard shortcut");
        return;
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        ["i", "j", "c"].includes(k)
      ) {
        event.preventDefault();
        flag("Restricted keyboard shortcut");
        return;
      }
      if (k === "f12" || k === "f5" || k === "f11") {
        event.preventDefault();
        flag("Restricted keyboard shortcut");
        return;
      }
      if (event.altKey && k === "tab") {
        flag("Restricted keyboard shortcut");
        return;
      }
      // Ctrl+Alt+Shift+S is a common OS/tool shortcut some students
      // associate with screenshot/snip tools. Blocking the keypress
      // itself is possible and does register as a violation — but note
      // this cannot actually stop a screenshot from being taken. No
      // website can detect or prevent the OS's own screen-capture
      // (Print Screen, Snipping Tool, phone camera, another shortcut
      // entirely, etc.) — this only catches this specific combination
      // being pressed while the exam tab has focus.
      if (event.ctrlKey && event.altKey && event.shiftKey && k === "s") {
        event.preventDefault();
        flag("Restricted keyboard shortcut");
        return;
      }
      // Best-effort only: on some Windows/Chrome setups the PrintScreen key
      // does dispatch a keydown event the page can observe, so we log it as
      // a violation when that happens. This is NOT reliable detection —
      // it does not fire on macOS, Firefox, most Linux setups, the Snipping
      // Tool/Win+Shift+S flow, or a second device's camera. We never claim
      // to block or catch every screenshot; this is a deterrent signal only.
      if (k === "printscreen") {
        flag("Screenshot key detected");
        return;
      }
    };
    const full = () => !fullscreenElementCompat() && flag("Fullscreen exit");
    if (!fullscreenElementCompat()) flag("Fullscreen exit");
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("copy", copy);
    document.addEventListener("paste", paste);
    document.addEventListener("contextmenu", context);
    document.addEventListener("keydown", key);
    FULLSCREEN_CHANGE_EVENTS.forEach((eventName) =>
      document.addEventListener(eventName, full),
    );
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("copy", copy);
      document.removeEventListener("paste", paste);
      document.removeEventListener("contextmenu", context);
      document.removeEventListener("keydown", key);
      FULLSCREEN_CHANGE_EVENTS.forEach((eventName) =>
        document.removeEventListener(eventName, full),
      );
    };
  }, [attempt, submitted, violation]);
  useEffect(() => {
    if (!attempt || submitted) return void 0;
    const checkAvailability = () => {
      studentExamService
        .availability()
        .then((latest) => {
          if (
            !latest.ok ||
            String(latest.exam?.id) !== String(access?.examId)
          ) {
            setClosureMessage(
              latest.availability === "ADMIN_STOPPED"
                ? "This examination was stopped by an administrator."
                : "This examination is no longer running and has been closed.",
            );
            setSubmitConfirm(false);
          }
        })
        .catch(() =>
          setClosureMessage("The examination service could not be reached."),
        );
    };
    checkAvailability();
    const interval = window.setInterval(checkAvailability, 10000);
    return () => window.clearInterval(interval);
  }, [access?.examId, attempt, session.userId, session.dateOfBirth, submitted]);
  if (submitted) return <StudentCompletionPage automatic={autoSubmitted} />;
  if (session.mode !== "student") return <Redirect to="/student/login" />;
  if (!accessChecked)
    return (
      <div className="grid min-h-screen place-items-center bg-[#f1f4f1]">
        <p className="font-semibold text-[#31534b]">
          Verifying your examination access…
        </p>
      </div>
    );
  if (!access?.examId || access.studentId !== session.userId)
    return <Redirect to="/student/instructions" />;
  if (loadError)
    return (
      <div className="grid min-h-screen place-items-center bg-[#f2f4f1] p-5">
        <main className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-8 text-center">
          <ShieldAlert className="mx-auto h-12 w-12 text-amber-700" />
          <h1 className="mt-4 font-serif text-3xl font-semibold text-[#3c3324]">
            Attempt unavailable
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#6f6253]">{loadError}</p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button
              variant="outline"
              onClick={() => setRetryToken((value) => value + 1)}
            >
              Retry
            </Button>
            <Button
              className="bg-[#0e5a4f]"
              onClick={() => {
                logout();
                navigate("/student/login");
              }}
            >
              Return to sign in
            </Button>
          </div>
        </main>
      </div>
    );
  if (!attempt)
    return (
      <div className="grid min-h-screen place-items-center bg-[#f2f4f1] p-5">
        <div className="flex flex-col items-center gap-4 text-center">
          <div
            className="h-10 w-10 animate-spin rounded-full border-4 border-[#cde0d4] border-t-[#0e5a4f]"
            role="status"
            aria-label="Loading"
          />
          <p className="font-serif text-xl font-semibold text-[#183d37]">
            Preparing Questions…
          </p>
          <p className="max-w-sm text-sm leading-6 text-[#5f746e]">
            Please wait while your exam is being prepared.
          </p>
        </div>
      </div>
    );
  const answeredCount = attempt.questions.filter(
    (q) => Array.isArray(answers[q.id]) && answers[q.id].length > 0,
  ).length;
  const scrollToQuestion = (questionId) => {
    setActiveQuestionId(questionId);
    document
      .getElementById(`question-card-${questionId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const selectAnswer = (question, optionId) => {
    setAnswers((current) => {
      const isMultiple = question.type === "MULTIPLE_CORRECT";
      // Single-correct questions behave like a real radio group: picking a
      // new option always replaces the previous one. Multiple-correct
      // questions behave like checkboxes: clicking again toggles it off.
      // Either way this is purely local state — the student can change
      // their mind as many times as they like right up until they submit;
      // nothing is sent to the server until then.
      if (!isMultiple) return { ...current, [question.id]: [optionId] };
      const selected = Array.isArray(current[question.id])
        ? current[question.id]
        : [];
      const next = selected.includes(optionId)
        ? selected.filter((id) => id !== optionId)
        : [...selected, optionId];
      return { ...current, [question.id]: next };
    });
  };
  const submit = async (automatic = false) => {
    if (submitting) return;
    const isAutomatic = automatic === true;
    setSubmitConfirm(false);
    setSubmitting(true);
    setSubmissionError("");
    // Every question's final selection is sent as part of this single
    // submit request — this is the only point the server ever learns what
    // the student picked, so the result is generated straight from these
    // selections rather than from a trail of earlier per-option saves.
    const submissionAnswers = attempt.questions.map((q) => ({
      exam_attempt_question_id: q.attempt_question_id,
      selected_options: Array.isArray(answers[q.id]) ? answers[q.id] : [],
    }));
    storeAttemptDraft({
      attemptId: attempt.id,
      answers,
      expiresAt,
      activeQuestionId,
      updatedAt: new Date().toISOString(),
    });
    try {
      await studentExamService.submit({
        attempt_id: attempt.id,
        answers: submissionAnswers,
        submitted_at: new Date().toISOString(),
        client_remaining_seconds: seconds,
        auto_submitted: isAutomatic,
      });
      clearAttemptDraft(attempt.id);
      setSeconds(0);
      setAutoSubmitted(isAutomatic);
      setSubmitted(true);
      exitFullscreenCompat();
      // Do NOT log out here. `/student/exam` is wrapped in <StudentRoute>,
      // which checks session.mode on every render and redirects to
      // /student/login the instant it isn't "student" — logging out here
      // unmounts this component (and its `if (submitted) return
      // <StudentCompletionPage />` below) before it ever gets a chance to
      // render, so the student was bounced straight to the login page
      // instead of seeing the success screen. The session now stays alive
      // until the student actually clicks "Return to student sign in" on
      // the completion screen, which is where logout() belongs.
    } catch (error) {
      // Surface the backend's actual reason when it gives one, instead of
      // always guessing "time expired" — a failed submission can just as
      // easily be a dropped connection, and telling the student the wrong
      // reason makes it harder for them to know what to do next.
      const errors =
        error?.response?.data?.data?.errors ?? error?.response?.data?.errors;
      const serverMessage = errors
        ? Object.values(errors).flat().find(Boolean)
        : error?.response?.data?.message;
      setSubmissionError(
        serverMessage ||
          (isAutomatic
            ? "Your time ran out. Your answers are still here on this device — press Submit examination to finish."
            : "Your submission could not reach the examination service. Your answers remain saved on this device; please try again."),
      );
      setSubmitConfirm(true);
    } finally {
      setSubmitting(false);
    }
  };
  submitRef.current = submit;
  const endSession = async () => {
    if (violation)
      await studentExamService.reportViolation({
        attempt_id: attempt.id,
        type: violation,
        occurred_at: new Date().toISOString(),
      });
    exitFullscreenCompat();
    logout();
    navigate("/student/login");
  };
  const endForPointerBoundary = async (type) => {
    if (boundaryExitStarted.current || submitted) return;
    boundaryExitStarted.current = true;
    await studentExamService.reportViolation({
      attempt_id: attempt.id,
      type,
      occurred_at: new Date().toISOString(),
    });
    exitFullscreenCompat();
    logout();
    navigate("/student/login");
  };
  // Matches the printed offline paper header (see ExamPaperService /
  // student-exam-focus reference image): programme name, Round, Course,
  // then a bordered detail box with exam type/number/module/marks/
  // duration/date/time and trainee identity — every value here is read
  // straight off the attempt/exam/student records, nothing hardcoded.
  const examTypeLabel =
    { MID: "Mid Term Test", MONTHLY: "Monthly External Test" }[
      attempt.examType
    ] ?? attempt.examType;
  const Navigator = ({ mobile = false }) => (
    <nav
      aria-label="Question navigator"
      className={mobile ? "flex min-w-max items-center gap-2 px-4 py-2" : ""}
    >
      {!mobile && (
        <>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#74847f]">
            Question navigator
          </p>
          <p className="mt-2 text-sm text-[#60746e]">
            Reading question{" "}
            <span className="font-bold text-[#0e5a4f]">
              {attempt.questions.findIndex(
                (question) => question.id === activeQuestionId,
              ) + 1}
            </span>{" "}
            · {answeredCount} of {attempt.totalQuestions} answered
          </p>
        </>
      )}
      <div className={mobile ? "flex gap-2" : "mt-5 grid grid-cols-5 gap-2"}>
        {attempt.questions.map((question, index) => (
          <button
            type="button"
            key={question.id}
            onClick={() => scrollToQuestion(question.id)}
            aria-label={`Go to question ${index + 1}`}
            aria-current={activeQuestionId === question.id ? "step" : undefined}
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-md text-sm font-bold ${activeQuestionId === question.id ? "bg-[#0e5a4f] text-white ring-2 ring-[#0e5a4f] ring-offset-2" : answers[question.id]?.length ? "bg-[#e6f3eb] text-[#0e5a4f]" : "bg-[#eff2ef] text-[#6b7b76]"}`}
          >
            {index + 1}
          </button>
        ))}
      </div>
    </nav>
  );
  return (
    <div
      className="min-h-screen select-none bg-[#f1f4f1] text-[#1d3d37]"
      onPointerMoveCapture={(event) => {
        const size = 8;
        if (
          event.pointerType === "mouse" &&
          (event.clientX <= size ||
            event.clientX >= window.innerWidth - size ||
            event.clientY <= size ||
            event.clientY >= window.innerHeight - size)
        )
          void endForPointerBoundary(
            "Pointer entered the examination security boundary",
          );
      }}
      onPointerLeave={(event) =>
        event.pointerType === "mouse" &&
        void endForPointerBoundary("Pointer left the examination workspace")
      }
    >
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-40 border-[8px] border-red-600/75 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.5)]"
      />
      <section className="border-b border-[#d6dfd7] bg-[#fcfdfb] px-4 py-5 md:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="flex flex-col items-center text-center">
            <img
              src="/manus-storage/isdb-bisew-brand-logo_29718725.png"
              alt="IsDB-BISEW"
              className="h-14 w-14 object-contain"
            />
            <h1 className="mt-2 font-serif text-xl font-semibold text-[#174039] md:text-2xl">
              IsDB-BISEW IT Scholarship Programme
            </h1>
            <p className="mt-1 text-sm text-[#4a5f58]">
              Round-{attempt.round ?? "—"}
            </p>
            <p className="text-sm text-[#4a5f58]">
              Course: {attempt.course ?? "—"}
            </p>
          </div>
          <div className="mt-4 overflow-hidden rounded-md border border-[#8fa89e]">
            <div className="grid grid-cols-1 divide-y divide-[#8fa89e] border-b border-[#8fa89e] sm:grid-cols-2 sm:divide-x sm:divide-y-0">
              <div className="px-4 py-3">
                <p className="font-semibold text-[#1b403a]">{examTypeLabel}</p>
                <p className="mt-1 text-[#3c5750]">
                  Exam # {attempt.examNumber}
                </p>
              </div>
              <div className="px-4 py-3 text-[#3c5750]">
                <p>
                  Module(s):{" "}
                  <span className="font-semibold text-[#1b403a]">
                    {attempt.moduleName ?? "—"}
                  </span>
                </p>
                <div className="mt-1 flex flex-wrap gap-x-4">
                  <span>
                    Full Marks:{" "}
                    <span className="font-semibold text-[#1b403a]">
                      {attempt.fullMarks ?? "—"}
                    </span>
                  </span>
                  <span>
                    Duration:{" "}
                    <span className="font-semibold text-[#1b403a]">
                      {attempt.durationMinutes ?? "—"} minutes
                    </span>
                  </span>
                </div>
                <p className="mt-1">
                  Date:{" "}
                  <span className="font-semibold text-[#1b403a]">
                    {attempt.examDate ?? "—"}
                  </span>{" "}
                  Time:{" "}
                  <span className="font-semibold text-[#1b403a]">
                    {attempt.examTime ?? "—"}
                  </span>
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 divide-y divide-[#8fa89e] sm:grid-cols-2 sm:divide-x sm:divide-y-0">
              <div className="px-4 py-3 text-[#3c5750]">
                Trainee Name:{" "}
                <span className="font-semibold text-[#1b403a]">
                  {attempt.traineeName ?? session.name ?? "—"}
                </span>
              </div>
              <div className="px-4 py-3 text-[#3c5750]">
                Trainee ID:{" "}
                <span className="font-semibold text-[#1b403a]">
                  {attempt.traineeId ?? session.userId ?? "—"}
                </span>{" "}
                &nbsp;&nbsp; Batch ID:{" "}
                <span className="font-semibold text-[#1b403a]">
                  {attempt.batchCode ?? "—"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
      <header className="sticky top-0 z-30 border-b border-[#d6dfd7] bg-[#fcfdfb]/95 backdrop-blur shadow-[0_4px_18px_rgba(19,59,55,0.08)]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 md:px-8">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#6d7d78]">
              IsDB-BISEW
              {attempt.moduleName ? ` · Module: ${attempt.moduleName}` : ""} ·{" "}
              {attempt.examType} · no. {attempt.examNumber}
            </p>
            <h1 className="font-serif text-xl font-semibold text-[#174039]">
              {attempt.title}
            </h1>
            <p className="mt-1 text-xs text-[#6e7e79]">
              All dynamically selected questions are available below in one
              scrollable page.
            </p>
          </div>
          <div
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 font-mono text-lg font-bold ${seconds <= 120 ? "border-rose-300 bg-rose-50 text-rose-800" : "border-[#cde0d4] bg-[#eff8f2] text-[#0e5a4f]"}`}
          >
            <Clock3 className="h-4 w-4" />
            <span className="sr-only">Time remaining</span>
            {formatTime(seconds)}
          </div>
        </div>
        <div className="border-t border-[#e5ebe5] bg-white xl:hidden">
          <Navigator mobile />
        </div>
      </header>
      <main className="mx-auto grid max-w-7xl gap-5 p-4 md:p-8 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section className="min-w-0 space-y-5">
          <div className="rounded-xl border border-[#dce4dd] bg-white px-5 py-4 md:px-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#74847f]">
                  Scrollable online question paper
                </p>
                <p className="mt-1 text-sm text-[#62766f]">
                  Answer each question in any order. You can change your
                  selection anytime before submitting.
                </p>
              </div>
              <span className="rounded-full bg-[#e8f3ed] px-3 py-1.5 text-sm font-bold text-[#0e5a4f]">
                {answeredCount} / {attempt.totalQuestions} answered
              </span>
            </div>
          </div>
          {attempt.questions.map((question, index) => (
            <article
              id={`question-card-${question.id}`}
              key={question.id}
              className={`scroll-mt-36 rounded-xl border bg-white p-5 transition md:p-7 ${activeQuestionId === question.id ? "border-[#83b9a7] shadow-[0_8px_28px_rgba(14,90,79,0.08)]" : "border-[#dce4dd]"}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#71827c]">
                  Question {index + 1} of {attempt.totalQuestions}
                </p>
                <p aria-live="polite" className="text-sm text-[#6c7d78]">
                  {answers[question.id]?.length
                    ? "Answer selected"
                    : "Not answered"}
                </p>
              </div>
              <h2 className="mt-5 font-serif text-2xl font-semibold leading-9 text-[#1b403a] md:text-3xl">
                {question.text}
              </h2>
              <div className="mt-7 space-y-3">
                {question.options.map((option, optionIndex) => {
                  const isMultiple = question.type === "MULTIPLE_CORRECT";
                  const selectedIds = Array.isArray(answers[question.id])
                    ? answers[question.id]
                    : [];
                  const isSelected = selectedIds.includes(option.id);
                  return (
                    <label
                      key={option.id}
                      className={`flex w-full cursor-pointer items-center gap-4 rounded-lg border p-4 text-left transition ${isSelected ? "border-[#0e5a4f] bg-[#edf7f2] shadow-sm" : "border-[#dde5de] bg-white hover:border-[#a8c7ba] hover:bg-[#fbfdfb]"}`}
                    >
                      <input
                        type={isMultiple ? "checkbox" : "radio"}
                        name={`question-${question.id}`}
                        checked={isSelected}
                        onChange={() => selectAnswer(question, option.id)}
                        className="h-5 w-5 shrink-0 accent-[#0e5a4f]"
                      />
                      <span
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${isSelected ? "bg-[#0e5a4f] text-white" : "bg-[#eef2ee] text-[#5b706a]"}`}
                      >
                        {String.fromCharCode(65 + optionIndex)}
                      </span>
                      <span className="text-base font-medium text-[#2b4b44]">
                        {option.text}
                      </span>
                    </label>
                  );
                })}
              </div>
            </article>
          ))}
          <section className="rounded-xl border border-[#c9dfd4] bg-[#f7fbf8] p-5 md:p-7">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <p className="text-sm leading-6 text-[#587068]">
                Review your selected answers above.{" "}
                {attempt.totalQuestions - answeredCount} questions are
                unanswered.
              </p>
              <Button
                onClick={() => setSubmitConfirm(true)}
                className="shrink-0 bg-[#0e5a4f] hover:bg-[#0a4a40]"
              >
                Submit examination
              </Button>
            </div>
          </section>
        </section>
        <aside className="hidden rounded-xl border border-[#dce4dd] bg-white p-5 xl:sticky xl:top-28 xl:block xl:h-fit">
          <Navigator />
          <Button
            variant="outline"
            className="mt-6 w-full border-[#cfe0d7] text-[#0e5a4f]"
            onClick={() => scrollToQuestion(attempt.questions[0].id)}
          >
            <ChevronUp className="mr-2 h-4 w-4" />
            Back to first question
          </Button>
        </aside>
      </main>
      {submitConfirm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#11302d]/45 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#72827e]">
              Confirm submission
            </p>
            <h2 className="mt-2 font-serif text-2xl font-semibold text-[#1b403a]">
              Submit your examination?
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#60736d]">
              You have answered {answeredCount} out of {attempt.totalQuestions}{" "}
              questions.
            </p>
            {submissionError && (
              <p
                role="alert"
                className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-800"
              >
                {submissionError}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setSubmitConfirm(false)}>
                Review questions
              </Button>
              <Button
                onClick={() => submit(false)}
                disabled={submitting}
                className="bg-[#0e5a4f] hover:bg-[#0a4a40]"
              >
                {seconds === 0
                  ? "Submit now"
                  : submitting
                    ? "Submitting…"
                    : "Submit examination"}
              </Button>
            </div>
          </div>
        </div>
      )}
      {(violation || closureMessage) && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-[#132e2b]/65 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl"
          >
            <ShieldAlert className="h-8 w-8 text-amber-800" />
            <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-[#8e6a27]">
              {closureMessage
                ? "Examination closed"
                : "Examination security warning"}
            </p>
            <h2 className="mt-2 font-serif text-2xl font-semibold text-[#3a3321]">
              {closureMessage ?? "A restricted event was detected"}
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#645c48]">
              {closureMessage
                ? "This attempt cannot continue in the student portal."
                : `${violation} was observed. This event will be reported to the examination service.`}
            </p>
            <Button
              onClick={endSession}
              className="mt-6 w-full bg-[#0e5a4f] hover:bg-[#0a4a40]"
            >
              {closureMessage ? "Return to sign in" : "End this session"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export { StudentExamPage };