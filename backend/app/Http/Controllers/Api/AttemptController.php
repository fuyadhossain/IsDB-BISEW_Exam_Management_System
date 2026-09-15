<?php

namespace App\Http\Controllers\Api;

use App\Models\{Batch, Course, Tsp, Round, Element, Role, Permission, Exam, ExamResult, ExamSet, ExamViolation, Question, QuestionImport, QuestionOption, Student, StudentExamAttempt, User, UserCourse, ExamAttemptQuestion, BatchStudent, Module, CompetencyUnit, Subject};
use App\Services\{AuditLogger, AttemptService, CatalogUpdateService, ExamLifecycleService, ExamService, HierarchyService, ImportService, QuestionBankService, ResultAuthorizationService, ResultService, StudentAuthService, UserCourseAssignmentService};
use App\Support\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class AttemptController
{
    private function own(Request $r, $id)
    {
        $a = StudentExamAttempt::with('exam')->whereKey($id)->where('student_id', $r->user()->id)->firstOrFail();
        return $a;
    }
    public function available(Request $r)
    {
        $student = $r->user();
        $batchIds = $student->assignments()->where('status', 'ACTIVE')->pluck('batch_id');
        $exams = Exam::whereHas('examSet', fn($q) => $q->whereIn('batch_id', $batchIds))->where('mode', 'ONLINE')->whereNotIn('status', ['ENDED', 'PROCESSING', 'COMPLETED'])->with('examSet:id,name,batch_id')->orderBy('start_at')->get(['id', 'exam_set_id', 'exam_number', 'exam_title', 'exam_type', 'mode', 'status', 'duration', 'max_marks', 'pass_marks', 'start_at', 'end_at']);
        ExamLifecycleService::syncMany($exams);
        $exams = $exams->filter(fn($exam) => in_array($exam->status, ['READY', 'STARTED'], true))->values();
        return ApiResponse::success($exams);
    }
    public function start(Request $r, $examId)
    {
        try {
            $a = (new AttemptService)->start($r->user(), Exam::with('examSet.batch')->findOrFail($examId));
            return ApiResponse::success($this->payload($a), 'Attempt ready', 201);
        } catch (ValidationException $e) {
            return ApiResponse::validation($e->errors());
        }
    }
    private function payload($a)
    {
        $a->loadMissing(['questions', 'answers', 'exam.examSet.batch.course', 'exam.examSet.batch.round', 'student']);
        // Student Exam header shows "IsDB-BISEW" plus the module(s) this
        // exam actually covers. modules.name is an internal code
        // ("Module01", "Module02" — see admin catalog), not something a
        // student should see, and an exam can link to the same module
        // through more than one competency unit, which used to repeat
        // that same code once per link ("MODULE01, MODULE01, MODULE01").
        // Resolve each module to the subject it belongs to (e.g.
        // "Laravel") instead — the same simplified "Module: <subjects>"
        // style already used on the printed offline paper's cover page —
        // and de-duplicate so each subject name appears once.
        $moduleNames = $a->exam->modules()->with('subject:id,name')->get()
            ->pluck('subject.name')->filter()->unique()->values()->all();
        $batch = $a->exam->examSet?->batch;
        return [
            'id' => $a->id,
            'status' => $a->status,
            'started_at' => $a->started_at,
            'expires_at' => $a->expires_at,
            'title' => $a->exam->exam_title,
            'examType' => $a->exam->exam_type,
            'examNumber' => $a->exam->exam_number,
            'moduleName' => implode(', ', $moduleNames) ?: null,
            'totalQuestions' => $a->questions->count(),
            // Printed-paper-style header fields (see IsDB-BISEW IT
            // Scholarship Programme paper layout): course/round/batch come
            // from the exam's batch, marks/duration/date/time from the
            // exam itself, and trainee identity from the logged-in student
            // — every field dynamic, nothing hardcoded per exam.
            'course' => $batch?->course?->code,
            'round' => $batch?->round?->code,
            'batchCode' => $batch?->display_code,
            'fullMarks' => (float) $a->exam->max_marks,
            'durationMinutes' => $a->exam->duration,
            'examDate' => $a->exam->start_at?->format('d-m-Y'),
            'examTime' => $a->exam->start_at?->format('H:i'),
            'traineeName' => $a->student?->name,
            'traineeId' => $a->student?->student_id,
            'questions' => $a->questions->map(fn($aq) => ['id' => $aq->question_id, 'attempt_question_id' => $aq->id, 'order' => $aq->question_order, 'text' => $this->studentFacingText($aq->question_snapshot['question_text'] ?? ''), 'type' => $aq->question_snapshot['question_type'] ?? '', 'options' => collect($aq->question_snapshot['options'] ?? [])->sortBy('option_order')->map(fn($o) => ['id' => $o['option_key'], 'text' => $o['option_text'], 'option_order' => $o['option_order']])->values(), 'answer' => $a->answers->firstWhere('exam_attempt_question_id', $aq->id)?->selected_options])
        ];
    }
    /**
     * Some seeded/imported question banks prefix the question text with a
     * "[Module/Competency Unit/Element name]" tag to make the bank easier
     * to audit in the admin panel. Students must never see which unit or
     * element a question was pulled from, so that tag is stripped here —
     * at the point the question is served to the student — leaving the
     * stored question_snapshot itself untouched for admin/reporting use.
     */
    private function studentFacingText(string $text): string
    {
        return trim(preg_replace('/^\[[^\]]*\]\s*/', '', $text));
    }
    public function show(Request $r, $id)
    {
        return ApiResponse::success($this->payload($this->own($r, $id)));
    }
    public function answer(Request $r, $id)
    {
        $a = $this->own($r, $id);
        $d = $r->validate(['exam_attempt_question_id' => 'required|exists:exam_attempt_questions,id', 'selected_options' => 'array', 'selected_options.*' => 'string']);
        $aq = $a->questions()->findOrFail($d['exam_attempt_question_id']);
        try {
            $ans = (new AttemptService)->saveAnswer($a, $aq, $d['selected_options'] ?? []);
            return ApiResponse::success(['saved' => true, 'answered_at' => $ans->answered_at]);
        } catch (ValidationException $e) {
            return ApiResponse::validation($e->errors());
        }
    }
    public function submit(Request $r, $id)
    {
        $a = $this->own($r, $id);
        $d = $r->validate(['answers' => 'array', 'answers.*.exam_attempt_question_id' => 'required_with:answers|integer', 'answers.*.selected_options' => 'array', 'answers.*.selected_options.*' => 'string']);
        try {
            $result = (new AttemptService)->submit($a, $d['answers'] ?? []);
            // The student's exam session ends the moment they submit — revoke
            // the token immediately so the portal can no longer be used with it.
            $r->user()->currentAccessToken()?->delete();
            return ApiResponse::success($result, 'Attempt submitted');
        } catch (ValidationException $e) {
            return ApiResponse::validation($e->errors());
        }
    }
}
