<?php

namespace App\Services;

use App\Models\Exam;

/**
 * This app typically runs on local/XAMPP setups without a cron-driven
 * `schedule:run`, so we can't rely on a scheduled console command to flip
 * exam status when start_at/end_at pass. Instead, every read path
 * (admin exam list/detail, student available-exams list) calls sync()
 * lazily, which flips the status the moment anyone asks for it after the
 * scheduled time has passed.
 */
class ExamLifecycleService
{
    /**
     * Auto-starts an exam once its scheduled start_at has passed (called
     * lazily from every read path — see class docblock) OR an admin starts
     * it early via the manual Start control (ExamController::start()).
     * Either way, before flipping to STARTED this must confirm the exam
     * actually has a usable question pool: auto-starting (or letting an
     * admin start) an exam with no modules/competency units configured,
     * or with too few questions banked, used to succeed silently and only
     * fail once a student tried to attempt it ("Select at least one
     * competency unit or module." / insufficient question errors) —
     * far too late for anyone to notice or fix.
     */
    public static function sync(Exam $exam, ?bool $hasConfiguration = null): Exam
    {
        $now = now();

        if ($exam->status === 'STARTED' && $exam->end_at && $now->gte($exam->end_at)) {
            $from = $exam->status;
            $exam->update(['status' => 'ENDED']);
            AuditLogger::record('exam.status_changed', $exam, ['from' => $from, 'to' => 'ENDED', 'reason' => 'schedule']);
            self::autoSubmitAbandonedAttempts($exam);
            return $exam;
        }

        $notYetStarted = !in_array($exam->status, ['STARTED', 'ENDED', 'PROCESSING', 'COMPLETED'], true);
        if ($notYetStarted && $exam->start_at && $now->gte($exam->start_at) && (!$exam->end_at || $now->lt($exam->end_at))) {
            // sync() runs on every admin exam-list load AND every poll from
            // every student sitting on the waiting-room screen (as often as
            // once a second right at start_at, see the countdown timer on
            // the student instructions page). Once this exam's question
            // pool is found insufficient, every one of those polls used to
            // redo the ENTIRE check from scratch — autoConfigureFromCourse()
            // plus DistributionService::assertAvailable()'s multiple
            // queries — for as long as the pool stayed short, turning
            // "students waiting for an exam to open" into a self-inflicted
            // query storm. Skip re-checking for a short cooldown once we
            // know it's blocked; the very next check after the cooldown
            // still picks up a fix immediately, so this only removes
            // redundant repeats, not correctness.
            $blockedCacheKey = "exam:{$exam->id}:auto_start_blocked_until";
            if (\Illuminate\Support\Facades\Cache::has($blockedCacheKey)) {
                return $exam;
            }

            $from = $exam->status;
            try {
                // $hasConfiguration lets syncMany() pass in an answer it
                // already computed in bulk for every due exam at once —
                // see syncMany() below. When called on a single exam
                // (every existing call site) this stays null and falls
                // back to the original two-query-per-exam check, so
                // behaviour for sync() alone is unchanged.
                $configured = $hasConfiguration ?? ($exam->competencyUnits()->count() > 0 || $exam->modules()->count() > 0);
                if (!$configured) {
                    (new ExamService)->autoConfigureFromCourse($exam);
                }
                (new DistributionService)->assertAvailable($exam);
            } catch (\Illuminate\Validation\ValidationException $e) {
                // Don't silently auto-start an exam whose question pool
                // can't actually be assembled — leave its status alone so
                // the admin sees it never went Running (instead of
                // students hitting "Attempt unavailable" the moment the
                // clock passes start_at) and can fix the module
                // selection or question bank first.
                AuditLogger::record('exam.auto_start_blocked', $exam, ['reason' => $e->errors()]);
                \Illuminate\Support\Facades\Cache::put($blockedCacheKey, true, 15);
                return $exam;
            }
            $exam->update(['status' => 'STARTED']);
            AuditLogger::record('exam.status_changed', $exam, ['from' => $from, 'to' => 'STARTED', 'reason' => 'schedule']);
        }

        return $exam;
    }

    /**
     * Same result as calling sync() once per exam, but avoids the N-query
     * fan-out that produced: when several exams happen to cross their
     * start_at boundary in the same request (e.g. several exam managers'
     * schedules landing in the same window — this app has no cron-driven
     * scheduler, see class docblock, so every list load re-checks this
     * lazily), sync() used to run its own competencyUnits()->count() /
     * modules()->count() pair for each one of them individually. This
     * computes both counts for every candidate exam in two grouped
     * queries up front, then calls the exact same sync() as before —
     * same cache short-circuit, same autoConfigureFromCourse/
     * assertAvailable calls, same status writes — just handing it the
     * pre-computed answer instead of letting it re-query. Exams that
     * aren't due to start (already STARTED/ENDED/not due yet) are
     * unaffected either way, since sync() only reaches that count check
     * for exams crossing the boundary.
     */
    public static function syncMany(iterable $exams): iterable
    {
        $exams = is_array($exams) ? $exams : iterator_to_array($exams);
        if (!$exams) return $exams;

        $now = now();
        $dueIds = [];
        foreach ($exams as $exam) {
            $notYetStarted = !in_array($exam->status, ['STARTED', 'ENDED', 'PROCESSING', 'COMPLETED'], true);
            if ($notYetStarted && $exam->start_at && $now->gte($exam->start_at) && (!$exam->end_at || $now->lt($exam->end_at))) {
                $dueIds[] = $exam->id;
            }
        }

        $configuredIds = [];
        if ($dueIds) {
            $cuExamIds = \Illuminate\Support\Facades\DB::table('exam_competency_units')
                ->whereIn('exam_id', $dueIds)->distinct()->pluck('exam_id')->all();
            $moduleExamIds = \Illuminate\Support\Facades\DB::table('exam_modules')
                ->whereIn('exam_id', $dueIds)->distinct()->pluck('exam_id')->all();
            $configuredIds = array_flip(array_merge($cuExamIds, $moduleExamIds));
        }

        foreach ($exams as $exam) {
            $hasConfiguration = in_array($exam->id, $dueIds, true) ? isset($configuredIds[$exam->id]) : null;
            self::sync($exam, $hasConfiguration);
        }
        return $exams;
    }

    /**
     * A student who closes the browser / never returns before an exam's
     * end_at previously left their attempt stuck at status ACTIVE forever
     * — nothing ever called AttemptService::submit() for them, so no
     * ExamResult was ever created and the admin's result list showed them
     * as "not attempted" instead of scoring whatever answers they had
     * actually saved. There is no cron/scheduler in this app (see class
     * docblock) to sweep these up on a timer, so this runs right here,
     * the moment sync() above notices this exact exam has just crossed
     * STARTED -> ENDED — the same lazy-on-request pattern as the rest of
     * this class. Each still-ACTIVE attempt is submitted exactly the way
     * AttemptService::submit() already handles a real student-initiated
     * submit: with no new answers passed in, so grading uses whatever
     * was already saved via saveAnswer() while they were still working,
     * and the status still correctly lands on EXPIRED rather than
     * SUBMITTED (submit() itself decides that from expires_at).
     */
    /**
     * Public wrapper so callers outside this class (e.g. ExamController's
     * manual Stop action) can trigger the exact same "submit whatever any
     * still-ACTIVE student had saved" sweep that the scheduled STARTED->
     * ENDED transition above triggers automatically. Kept as a separate
     * public method rather than making the private one below public
     * outright, so the two call sites (automatic schedule vs. manual
     * admin stop) read clearly as distinct triggers of the same cleanup.
     */
    public static function submitAbandonedAttempts(Exam $exam): void
    {
        self::autoSubmitAbandonedAttempts($exam);
    }

    private static function autoSubmitAbandonedAttempts(Exam $exam): void
    {
        $abandoned = $exam->attempts()->where('status', 'ACTIVE')->get();
        foreach ($abandoned as $attempt) {
            try {
                (new AttemptService)->submit($attempt);
            } catch (\Throwable $e) {
                // One student's corrupt/edge-case attempt shouldn't stop
                // the rest of the batch from being auto-submitted, and
                // shouldn't stop the exam's own STARTED->ENDED transition
                // above (already committed by the time we get here).
                AuditLogger::record('attempt.auto_submit_failed', $attempt, ['error' => $e->getMessage()]);
            }
        }
    }
}
