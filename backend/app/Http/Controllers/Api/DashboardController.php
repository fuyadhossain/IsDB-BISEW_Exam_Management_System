<?php

namespace App\Http\Controllers\Api;

use App\Models\{Course, Exam, Round};
use App\Services\FinalResultService;
use App\Support\ApiResponse;
use Illuminate\Http\Request;

/**
 * Backs the admin Dashboard's overview widgets. Everything here is scoped
 * to the requesting admin's own courses the same way Results/Reports
 * already are (whereIn activeCourses for a non-Super-Admin) — a
 * course-scoped admin never sees another course's exams/batches here.
 */
class DashboardController
{
    private function scopedExamQuery(Request $request)
    {
        $query = Exam::with(['examSet.batch.course:id,code,name', 'examSet.batch.round:id,code,name']);
        if (!$request->user()->isSuperAdmin()) {
            $query->whereHas(
                'examSet.batch',
                fn($b) => $b->whereIn('course_id', $request->user()->activeCourses()->select('courses.id'))
            );
        }
        return $query->whereHas('examSet.batch');
    }

    private function examSummary(Exam $exam): array
    {
        $batch = $exam->examSet->batch;
        return [
            'exam_id' => $exam->id,
            'exam_title' => $exam->exam_title,
            'exam_number' => $exam->exam_number,
            'exam_type' => $exam->exam_type,
            'is_monthly' => FinalResultService::isMonthly($exam->exam_type),
            'status' => $exam->status,
            'start_at' => optional($exam->start_at)->toIso8601String(),
            'end_at' => optional($exam->end_at)->toIso8601String(),
            'course' => $batch?->course?->code,
            'batch' => $batch?->displayCode(),
            'batch_id' => $batch?->id,
            'round' => $batch?->round?->code,
        ];
    }

    public function overview(Request $request)
    {
        $now = now();

        // Upcoming: hasn't ended yet (still DRAFT/AVAILABLE, or ended in
        // the future) — ordered soonest first so "what's next" is at the top.
        $upcoming = $this->scopedExamQuery($request)
            ->where(fn($q) => $q->whereNull('end_at')->orWhere('end_at', '>=', $now))
            ->orderByRaw('start_at IS NULL, start_at ASC')
            ->limit(8)
            ->get()
            ->map(fn($exam) => $this->examSummary($exam))
            ->values();

        // Recently completed — most recently ended first.
        $recent = $this->scopedExamQuery($request)
            ->where('end_at', '<', $now)
            ->orderByDesc('end_at')
            ->limit(8)
            ->get()
            ->map(fn($exam) => $this->examSummary($exam))
            ->values();

        // Per batch: once its most recent exam has actually ended, name
        // the type that comes next in the Mid Monthly <-> Monthly
        // rotation — "just finished Mid Monthly No. 05, Monthly is next"
        // (or the reverse), so admins don't have to work that out exam by
        // exam themselves. Only considers batches with at least one
        // exam so far; a brand-new batch with nothing scheduled yet isn't
        // guessed at.
        $allExams = $this->scopedExamQuery($request)->get();
        $nextByBatch = $allExams
            ->filter(fn($exam) => $exam->examSet?->batch)
            ->groupBy(fn($exam) => $exam->examSet->batch->id)
            ->map(function ($examsForBatch) use ($now) {
                $batch = $examsForBatch->first()->examSet->batch;
                $lastEnded = $examsForBatch
                    ->filter(fn($exam) => $exam->end_at && $exam->end_at->lt($now))
                    ->sortByDesc('end_at')
                    ->first();
                if (!$lastEnded) return null;

                $wantMonthlyNext = !FinalResultService::isMonthly($lastEnded->exam_type);
                $alreadyScheduled = $examsForBatch->first(fn($exam) => FinalResultService::isMonthly($exam->exam_type) === $wantMonthlyNext
                    && (!$exam->end_at || $exam->end_at->gte($now)));

                return [
                    'batch_id' => $batch->id,
                    'batch' => $batch->displayCode(),
                    'course' => $batch->course?->code,
                    'just_finished' => $this->examSummary($lastEnded),
                    'next_type' => $wantMonthlyNext ? 'MONTHLY' : 'MID_MONTHLY',
                    'next_exam' => $alreadyScheduled ? $this->examSummary($alreadyScheduled) : null,
                ];
            })
            ->filter()
            ->values();

        // Overall performance -- same row-level Pass/Fail/Absent logic
        // Reports uses (FinalResultService-based, type-aware), just
        // aggregated across everything the admin can see instead of one
        // exam/batch at a time.
        $attempts = (new ReportController())->relevantAttempts($request);
        $total = $attempts->count();
        $pass = $attempts->where('status', 'PASS')->count();
        $fail = $attempts->where('status', 'FAIL')->count();
        $absent = $attempts->where('status', 'ABSENT')->count();
        $performance = [
            'students_assigned' => $total,
            'pass' => $pass,
            'fail' => $fail,
            'absent' => $absent,
            'pass_rate' => $total ? round($pass / $total * 100, 2) : 0,
        ];

        // Courses overview -- batch count + the same performance slice,
        // scoped to that one course.
        $courseQuery = Course::query();
        if (!$request->user()->isSuperAdmin()) {
            $courseQuery->whereIn('id', $request->user()->activeCourses()->select('courses.id'));
        }
        $courses = $courseQuery->withCount(['batches', 'batches as active_batches_count' => fn($q) => $q->where('status', 'ACTIVE')])
            ->get()
            ->map(function ($course) use ($attempts) {
                $courseAttempts = $attempts->filter(fn($row) => $row->batch->course_id === $course->id);
                $courseTotal = $courseAttempts->count();
                $coursePass = $courseAttempts->where('status', 'PASS')->count();
                return [
                    'id' => $course->id,
                    'code' => $course->code,
                    'name' => $course->name,
                    'batches' => $course->batches_count,
                    'active_batches' => $course->active_batches_count,
                    'pass_rate' => $courseTotal ? round($coursePass / $courseTotal * 100, 2) : null,
                ];
            })
            ->values();

        // Rounds overview -- a round with no ACTIVE batch yet is a
        // reasonable stand-in for "upcoming" in a schema where rounds
        // carry no date of their own (see the `rounds` table).
        $rounds = Round::withCount(['batches as active_batches_count' => fn($q) => $q->where('status', 'ACTIVE')])
            ->orderBy('code')
            ->get()
            ->map(fn($round) => [
                'id' => $round->id,
                'code' => $round->code,
                'name' => $round->name,
                'active_batches' => $round->active_batches_count,
                'is_upcoming' => $round->active_batches_count === 0,
            ])
            ->values();

        return ApiResponse::success([
            'upcoming_exams' => $upcoming,
            'recent_exams' => $recent,
            'next_by_batch' => $nextByBatch,
            'performance' => $performance,
            'courses' => $courses,
            'rounds' => $rounds,
        ]);
    }
}
