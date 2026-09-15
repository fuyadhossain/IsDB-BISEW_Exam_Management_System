<?php

namespace App\Http\Controllers\Api;

use App\Models\{Exam, ExamEvidence, ExamResult};
use App\Services\FinalResultService;
use App\Support\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * Reporting endpoints for the admin "Reports" workspace.
 *
 * All queries are scoped through ResultAuthorizationService so a
 * course-restricted admin only ever sees aggregates for their own
 * courses, exactly like the existing Result endpoints.
 */
class ReportController
{
    /**
     * Build one row per (exam, ACTIVE batch student) pair for every exam
     * matching the given filters — not just the ones with a submitted
     * ExamResult. A student who never attempted an exam is surfaced as
     * ABSENT instead of silently missing from every count.
     *
     * Each row carries External/Evidence marks and status the same way
     * Result Management does (see FinalResultService and
     * FrontendCompatibilityController::rosterResults):
     *   - Mid Monthly: External comes from ExamResult.total_marks,
     *     Evidence from ExamEvidence.marks, each judged on its own
     *     32-mark pass mark. This exam type has no single combined
     *     status of its own — External and Evidence pass/fail
     *     independently, so `status` here is PASS only when both are,
     *     matching how a report needs one Pass/Fail/Absent bucket per row.
     *   - Monthly: External comes from ExamEvidence.mcq_marks, Evidence
     *     from ExamEvidence.marks. Monthly has no standalone pass mark of
     *     its own either — its real Pass/Fail is the cross-exam Final
     *     Result (paired with its sibling Mid Monthly exam via
     *     FinalResultService), so `status` here is that Final Result's
     *     status (or INCOMPLETE while the pairing/marks aren't complete
     *     yet).
     *
     * @return Collection<int, object>
     */
    public function relevantAttempts(Request $request): Collection
    {
        $examQuery = Exam::with([
            'examSet:id,batch_id',
            'examSet.batch:id,course_id,tsp_id,round_id,shift,batch_number',
            'examSet.batch.course:id,code,name',
            'examSet.batch.round:id,code,name',
        ]);

        $examQuery
            ->when($request->filled('round'), fn($q) => $q->whereHas(
                'examSet.batch.round',
                fn($round) => $round->where('code', $request->string('round')->toString())
                    ->orWhereKey($request->integer('round'))
            ))
            ->when($request->filled('course'), fn($q) => $q->whereHas(
                'examSet.batch.course',
                fn($course) => $course->where('code', $request->string('course')->toString())
                    ->orWhereKey($request->integer('course'))
            ))
            ->when($request->filled('batch'), fn($q) => $q->whereHas(
                'examSet.batch',
                fn($batch) => $batch->where('batch_number', $request->string('batch')->toString())
                    ->orWhereKey($request->integer('batch'))
            ))
            ->when($request->filled('exam_number'), fn($q) => $q->where(
                'exam_number',
                $request->string('exam_number')->toString()
            ))
            // A batch's exam set can hold a Mid Monthly and a Monthly exam
            // sharing the same exam_number, so without this the export
            // would pull in both exams' student rows mixed together
            // instead of just the one the admin picked from the dropdown.
            ->when($request->filled('exam_type'), fn($q) => $q->where(
                'exam_type',
                $request->string('exam_type')->toString()
            ));

        if (!$request->user()->isSuperAdmin()) {
            $examQuery->whereHas(
                'examSet.batch',
                fn($b) => $b->whereIn('course_id', $request->user()->activeCourses()->select('courses.id'))
            );
        }

        $exams = $examQuery->get()->filter(fn(Exam $exam) => $exam->examSet?->batch !== null);

        $outcomeFilter = $request->filled('outcome') && $request->string('outcome')->toString() !== 'all'
            ? strtoupper($request->string('outcome')->toString())
            : null;

        $rows = collect();

        foreach ($exams as $exam) {
            $batch = $exam->examSet->batch;
            $isMonthly = FinalResultService::isMonthly($exam->exam_type);

            $students = $batch->students()
                ->wherePivot('status', 'ACTIVE')
                ->get(['students.id', 'students.student_id', 'students.name']);

            $resultsByStudent = ExamResult::where('exam_id', $exam->id)
                ->whereIn('student_id', $students->pluck('id'))
                ->get()
                ->keyBy('student_id');
            $evidenceByStudent = ExamEvidence::where('exam_id', $exam->id)
                ->whereIn('student_id', $students->pluck('id'))
                ->get()
                ->keyBy('student_id');

            foreach ($students as $student) {
                $result = $resultsByStudent->get($student->id);
                $evidence = $evidenceByStudent->get($student->id);

                if ($isMonthly) {
                    $externalMarks = $evidence?->mcq_marks !== null ? (float) $evidence->mcq_marks : null;
                    $evidenceMarks = $evidence?->marks !== null ? (float) $evidence->marks : null;
                    // Monthly is offline -- "attempted" means an admin
                    // marked them attended, not an auto-graded submission.
                    $attended = (bool) ($evidence?->attended ?? false);
                    $finalResult = $attended ? FinalResultService::buildForExam($exam, $student->id) : null;
                    $externalStatus = $finalResult['finalExternalStatus'] ?? null;
                    $evidenceStatus = $finalResult['finalEvidenceStatus'] ?? null;
                    $status = !$attended
                        ? 'ABSENT'
                        : (($finalResult['complete'] ?? false) ? $finalResult['status'] : 'INCOMPLETE');
                    $attemptedFlag = $attended;
                } else {
                    $externalMarks = $result !== null ? (float) $result->total_marks : null;
                    $evidenceMarks = $evidence?->marks !== null ? (float) $evidence->marks : null;
                    $externalStatus = FinalResultService::componentStatus($externalMarks);
                    $evidenceStatus = FinalResultService::componentStatus($evidenceMarks);
                    // No ExamResult row means the student never attempted
                    // this Mid Monthly exam online at all -- surface that
                    // as ABSENT rather than a silent FAIL.
                    $status = $result === null
                        ? 'ABSENT'
                        : (($externalStatus === 'PASS' && $evidenceStatus === 'PASS') ? 'PASS' : 'FAIL');
                    $attemptedFlag = $result !== null;
                }

                if ($outcomeFilter && $status !== $outcomeFilter) {
                    continue;
                }

                $rows->push((object) [
                    'exam' => $exam,
                    'batch' => $batch,
                    'isMonthly' => $isMonthly,
                    'studentId' => $student->id,
                    'studentCode' => $student->student_id,
                    'studentName' => $student->name,
                    'result' => $result,
                    'evidence' => $evidence,
                    'attempted' => $attemptedFlag,
                    'externalMarks' => $externalMarks,
                    'evidenceMarks' => $evidenceMarks,
                    'externalStatus' => $externalStatus,
                    'evidenceStatus' => $evidenceStatus,
                    'status' => $status,
                ]);
            }
        }

        return $rows;
    }

    /** GET /v1/admin/reports/batches — pass/fail/absent aggregates grouped by batch. */
    public function batchSummary(Request $request)
    {
        $attempts = $this->relevantAttempts($request);

        $rows = $attempts
            ->groupBy(fn($row) => $row->batch->id)
            ->map(function ($items, $batchId) {
                $batch = $items->first()->batch;
                $attempted = $items->where('attempted', true);
                $external = $attempted->pluck('externalMarks')->filter(fn($v) => $v !== null);
                $evidence = $attempted->pluck('evidenceMarks')->filter(fn($v) => $v !== null);
                $total = $items->count();
                $pass = $items->where('status', 'PASS')->count();
                $fail = $items->where('status', 'FAIL')->count();
                $absent = $items->where('status', 'ABSENT')->count();

                return [
                    'batch_id' => (int) $batchId,
                    'batch' => $batch->displayCode(),
                    'course' => $batch->course?->code,
                    'round' => $batch->round?->code,
                    'students_assigned' => $total,
                    'results_recorded' => $attempted->count(),
                    'average_external' => $external->count() ? round((float) $external->avg(), 2) : 0,
                    'average_evidence' => $evidence->count() ? round((float) $evidence->avg(), 2) : 0,
                    'pass' => $pass,
                    'fail' => $fail,
                    'absent' => $absent,
                    'pass_rate' => $total ? round($pass / $total * 100, 2) : 0,
                ];
            })
            ->sortBy('batch')
            ->values();

        return ApiResponse::success($rows);
    }

    /** GET /v1/admin/reports/exams — pass/fail/absent aggregates grouped by exam. */
    public function examSummary(Request $request)
    {
        $attempts = $this->relevantAttempts($request);

        $rows = $attempts
            ->groupBy(fn($row) => $row->exam->id)
            ->map(function ($items, $examId) {
                $exam = $items->first()->exam;
                $batch = $items->first()->batch;
                $attempted = $items->where('attempted', true);
                $external = $attempted->pluck('externalMarks')->filter(fn($v) => $v !== null);
                $evidence = $attempted->pluck('evidenceMarks')->filter(fn($v) => $v !== null);
                $total = $items->count();
                $pass = $items->where('status', 'PASS')->count();
                $fail = $items->where('status', 'FAIL')->count();
                $absent = $items->where('status', 'ABSENT')->count();
                $externalPass = $items->where('externalStatus', 'PASS')->count();
                $externalFail = $items->where('externalStatus', 'FAIL')->count();
                $evidencePass = $items->where('evidenceStatus', 'PASS')->count();
                $evidenceFail = $items->where('evidenceStatus', 'FAIL')->count();

                return [
                    'exam_id' => (int) $examId,
                    'exam' => $exam->exam_title,
                    'exam_number' => $exam->exam_number,
                    'exam_type' => $exam->exam_type,
                    'course' => $batch?->course?->code,
                    'batch' => $batch?->displayCode(),
                    'round' => $batch?->round?->code,
                    'students_assigned' => $total,
                    'attempts' => $attempted->count(),
                    'average_external' => $external->count() ? round((float) $external->avg(), 2) : 0,
                    'external_pass' => $externalPass,
                    'external_fail' => $externalFail,
                    'average_evidence' => $evidence->count() ? round((float) $evidence->avg(), 2) : 0,
                    'evidence_pass' => $evidencePass,
                    'evidence_fail' => $evidenceFail,
                    'pass' => $pass,
                    'fail' => $fail,
                    'absent' => $absent,
                    'pass_rate' => $total ? round($pass / $total * 100, 2) : 0,
                ];
            })
            ->sortByDesc('exam_id')
            ->values();

        return ApiResponse::success($rows);
    }

    /** GET /v1/admin/reports/export — streamed CSV of every matching student, submitted or ABSENT. */
    public function export(Request $request)
    {
        $attempts = $this->relevantAttempts($request)
            ->sortByDesc(fn($row) => optional($row->result?->processed_at)->timestamp ?? 0)
            ->values();
        $filename = 'isdb-bisew-results-' . now()->format('Ymd-His') . '.csv';

        return response()->streamDownload(function () use ($attempts) {
            $out = fopen('php://output', 'w');
            fputcsv($out, [
                'Student ID',
                'Student Name',
                'Course',
                'Round',
                'Batch',
                'Exam',
                'Exam No.',
                'Exam Type',
                'External',
                'External Status',
                'Evidence',
                'Evidence Status',
                'Status',
                'Processed At',
            ]);

            foreach ($attempts as $row) {
                $result = $row->result;
                $exam = $row->exam;
                $batch = $row->batch;
                fputcsv($out, [
                    $row->studentCode,
                    $row->studentName,
                    $batch?->course?->code,
                    $batch?->round?->code,
                    $batch?->displayCode(),
                    $exam?->exam_title,
                    $exam?->exam_number,
                    $exam?->exam_type,
                    $row->externalMarks ?? '',
                    $row->externalStatus ?? '',
                    $row->evidenceMarks ?? '',
                    $row->evidenceStatus ?? '',
                    $row->status,
                    optional($result?->processed_at)->toDateTimeString(),
                ]);
            }

            fclose($out);
        }, $filename, ['Content-Type' => 'text/csv']);
    }
}
