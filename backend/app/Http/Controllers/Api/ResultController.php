<?php

namespace App\Http\Controllers\Api;

use App\Models\{Batch, Course, Tsp, Round, Element, Role, Permission, Exam, ExamEvidence, ExamResult, ExamSet, ExamViolation, Question, QuestionImport, QuestionOption, Student, StudentExamAttempt, User, UserCourse, ExamAttemptQuestion, BatchStudent, Module, CompetencyUnit, Subject};
use App\Services\{AuditLogger, AttemptService, CatalogUpdateService, ExamService, FinalResultService, HierarchyService, ImportService, QuestionBankService, ResultAuthorizationService, ResultService, StudentAuthService, UserCourseAssignmentService};
use App\Support\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ResultController
{
    private function authorized(Request $r, $id)
    {
        // Previously this ran an `exists()` check with a correlated
        // subquery join FIRST, then threw that result away and ran a
        // second, completely separate query re-fetching the same record
        // with several eager-loaded relations — every single time the
        // Result detail page was opened. Since the frontend also fires
        // `getCombined()` right alongside `get()` (and combined() calls
        // this same authorized() method again internally), that meant
        // this expensive double-fetch pattern ran twice per page load.
        // Fetch once with the eager loads, then authorize against the
        // already-loaded model — canAccessResult()'s loadMissing() is a
        // no-op here since 'exam.examSet.batch' is already loaded, so
        // this collapses what were 2 full round-trip query sets into 1.
        $result = ExamResult::with('exam.examSet.batch.course', 'exam.examSet.batch.tsp', 'exam.examSet.batch.round', 'student', 'attempt.violations')->findOrFail($id);
        (new ResultAuthorizationService)->assertResult($r->user(), $result);
        return $result;
    }
    public function index(Request $r)
    {
        $q = ExamResult::with(['student:id,student_id,name', 'exam:id,exam_set_id,exam_title'])->when($r->filled('exam_id'), fn($x) => $x->where('exam_id', $r->exam_id))->when($r->filled('student_id'), fn($x) => $x->where('student_id', $r->student_id))->when($r->filled('course_id'), fn($x) => $x->whereHas('exam.examSet.batch', fn($b) => $b->where('course_id', $r->course_id)))->when($r->filled('round_id'), fn($x) => $x->whereHas('exam.examSet.batch', fn($b) => $b->where('round_id', $r->round_id)));
        $q = (new ResultAuthorizationService)->scope($q, $r->user());
        return ApiResponse::success($q->latest()->paginate(min((int)$r->input('per_page', 20), config('isdb.pagination_max'))));
    }
    public function show(Request $r, $id)
    {
        $result = $this->authorized($r, $id);
        $payload = $result->toArray();
        $payload['finalResult'] = $result->exam ? FinalResultService::buildForExam($result->exam, $result->student_id) : null;
        return ApiResponse::success($payload);
    }
    public function combined(Request $r, $id)
    {
        $result = $this->authorized($r, $id);
        return ApiResponse::success($result->exam ? FinalResultService::buildForExam($result->exam, $result->student_id) : ['complete' => false, 'message' => 'This result has no associated exam.']);
    }

    /**
     * Details lookup for a student+exam that has no `ExamResult` row at
     * all — this is the normal case for every Monthly exam (Monthly is
     * offline, so it's never auto-graded into exam_results; its marks
     * live entirely on exam_evidences). The existing show() above only
     * ever works when an ExamResult row exists, which silently excluded
     * every Monthly student's Details page. This endpoint looks the
     * student+exam up directly instead of assuming an ExamResult exists.
     */
    public function detail(Request $r)
    {
        $data = $r->validate([
            'exam_id' => ['required', 'integer', 'exists:exams,id'],
            'student_id' => ['required', 'integer', 'exists:students,id'],
        ]);

        $exam = Exam::with('examSet.batch.course', 'examSet.batch.tsp', 'examSet.batch.round')->findOrFail($data['exam_id']);
        (new ResultAuthorizationService)->assertBatch($r->user(), $exam->examSet?->batch);

        $student = Student::findOrFail($data['student_id']);
        $result = ExamResult::where('exam_id', $exam->id)->where('student_id', $student->id)->first();
        $evidence = ExamEvidence::where('exam_id', $exam->id)->where('student_id', $student->id)->first();
        // A student can (rarely) have more than one attempt recorded against
        // the same exam (e.g. a resumed/relaunched session) — count
        // violations across all of that student's attempts for this exam,
        // not just whichever attempt an ExamResult happens to point at, so
        // the count can't silently miss or double another student's events.
        $attempts = StudentExamAttempt::where('exam_id', $exam->id)->where('student_id', $student->id)->with('violations')->get();
        $violationCount = $attempts->reduce(fn($carry, $attempt) => $carry + $attempt->violations->count(), 0);

        if (!$result && !$evidence && $attempts->isEmpty()) {
            return ApiResponse::error('Student result data not found.', 404);
        }

        $payload = [
            'id' => $result?->id,
            'student_id' => $student->id,
            'student' => ['id' => $student->id, 'student_id' => $student->student_id, 'name' => $student->name],
            'exam_id' => $exam->id,
            'exam' => $exam->toArray(),
            'correct_answers' => $result?->correct_answers ?? 0,
            'wrong_answers' => $result?->wrong_answers ?? 0,
            'unanswered_questions' => $result?->unanswered_questions ?? 0,
            'total_marks' => $result?->total_marks ?? 0,
            'percentage' => $result?->percentage ?? 0,
            // Monthly exams have no auto-graded ExamResult at all — this is
            // never "ABSENT" purely because that row is missing (that would
            // wrongly flag every Monthly student), only when the exam
            // actually has an ExamResult saying so, or (for Monthly) when an
            // evidence row exists and was explicitly marked not-attended.
            'status' => $result?->status ?? ($evidence && !$evidence->attended ? 'ABSENT' : 'NO_RESULT'),
            'evidenceMarks' => $evidence?->marks !== null ? (float) $evidence->marks : null,
            'evidenceMcqMarks' => $evidence?->mcq_marks !== null ? (float) $evidence->mcq_marks : null,
            'attended' => (bool) ($evidence?->attended ?? false),
            'violationCount' => $violationCount,
            'finalResult' => FinalResultService::buildForExam($exam, $student->id),
        ];

        return ApiResponse::success($payload);
    }
    public function process(Request $r, $attemptId)
    {
        $a = StudentExamAttempt::with('exam.examSet.batch')->findOrFail($attemptId);
        (new ResultAuthorizationService)->assertAttempt($r->user(), $a);
        return ApiResponse::success((new ResultService)->process($a), 'Result processed', 201);
    }
}
