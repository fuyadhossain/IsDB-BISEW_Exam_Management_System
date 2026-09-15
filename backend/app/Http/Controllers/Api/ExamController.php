<?php

namespace App\Http\Controllers\Api;

use App\Models\{Exam, ExamSet};
use App\Services\{AuditLogger, CourseScopeService, DistributionService, ExamLifecycleService, ExamPaperService, ExamService};
use App\Support\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class ExamController
{
    private CourseScopeService $scope;
    public function __construct()
    {
        $this->scope = new CourseScopeService;
    }
    public function sets(Request $r)
    {
        $q = $this->scope->catalog(ExamSet::with('batch.course', 'batch.tsp', 'batch.round'), 'exam-sets', $r->user());
        return ApiResponse::success($q->when($r->filled('batch_id'), fn($x) => $x->where('batch_id', $r->batch_id))->when($r->filled('round_id'), fn($x) => $x->whereHas('batch', fn($b) => $b->where('round_id', $r->round_id)))->latest()->paginate(min((int) $r->input('per_page', 20), config('isdb.pagination_max'))));
    }
    public function createSet(Request $r)
    {
        $d = $r->validate(['batch_id' => 'required|exists:batches,id', 'name' => 'required|string|max:255', 'code' => 'nullable|string|max:100', 'status' => 'required|string']);
        $this->scope->assertCatalog($r->user(), 'batches', $d['batch_id']);
        $x = ExamSet::create($d);
        AuditLogger::record('exam_set.created', $x);
        return ApiResponse::success($x, 'Exam set created', 201);
    }
    public function showSet(Request $r, $id)
    {
        $x = ExamSet::with('batch', 'exams')->findOrFail($id);
        $this->scope->assertExamSet($r->user(), $x);
        return ApiResponse::success($x);
    }
    public function exams(Request $r)
    {
        $q = Exam::with('examSet.batch.course', 'examSet.batch.tsp', 'examSet.batch.round');
        if (!$r->user()->isSuperAdmin()) $q = $q->whereHas('examSet.batch', fn($b) => $b->whereIn('course_id', $r->user()->activeCourses()->select('courses.id')));
        $page = $q->when($r->filled('exam_set_id'), fn($x) => $x->where('exam_set_id', $r->exam_set_id))->when($r->filled('status'), fn($x) => $x->where('status', $r->status))->when($r->filled('round_id'), fn($x) => $x->whereHas('examSet.batch', fn($b) => $b->where('round_id', $r->round_id)))->latest()->paginate(min((int) $r->input('per_page', 20), config('isdb.pagination_max')));
        ExamLifecycleService::syncMany($page->getCollection());
        return ApiResponse::success($page);
    }
    public function createExam(Request $r)
    {
        $d = $r->validate(['exam_set_id' => 'required|exists:exam_sets,id', 'exam_number' => 'required|string|max:100', 'exam_title' => 'required|string|max:255', 'exam_type' => 'required|string', 'mode' => 'nullable|string', 'status' => 'required|in:DRAFT', 'duration' => 'required|integer|min:1', 'max_marks' => 'required|numeric|min:0', 'pass_marks' => 'required|numeric|min:0', 'start_at' => 'nullable|date', 'end_at' => 'nullable|date|after:start_at']);
        $set = ExamSet::with('batch')->findOrFail($d['exam_set_id']);
        $this->scope->assertExamSet($r->user(), $set);
        $rule = \App\Services\ExamTypeRuleService::ruleFor($d['exam_type']);
        if ($rule['mode']) $d['mode'] = $rule['mode'];
        elseif (empty($d['mode'])) return ApiResponse::validation(['mode' => ['mode is required for this exam_type.']]);
        $x = Exam::create($d);
        AuditLogger::record('exam.created', $x);
        return ApiResponse::success($x, 'Exam created', 201);
    }
    public function showExam(Request $r, $id)
    {
        $x = Exam::with(['examSet.batch.course', 'subjects', 'modules', 'competencyUnits'])->findOrFail($id);
        $this->scope->assertExam($r->user(), $x);
        ExamLifecycleService::sync($x);
        return ApiResponse::success($x);
    }
    public function updateExam(Request $r, $id)
    {
        $x = Exam::findOrFail($id);
        $this->scope->assertExam($r->user(), $x);
        if ($x->isProtected()) return ApiResponse::error('Protected exam cannot be edited.', 409);
        $x->update($r->validate(['exam_title' => 'sometimes|string|max:255', 'duration' => 'sometimes|integer|min:1', 'max_marks' => 'sometimes|numeric|min:0', 'pass_marks' => 'sometimes|numeric|min:0', 'start_at' => 'nullable|date', 'end_at' => 'nullable|date|after:start_at']));
        AuditLogger::record('exam.updated', $x);
        return ApiResponse::success($x->fresh());
    }
    public function configure(Request $r, $id)
    {
        $x = Exam::findOrFail($id);
        $this->scope->assertExam($r->user(), $x);
        $x = (new ExamService)->configure($x, $r->validate([
            'subject_ids' => 'array',
            'subject_ids.*' => 'integer',
            'module_ids' => 'array',
            'module_ids.*' => 'integer',
            'competency_unit_ids' => 'array',
            'competency_unit_ids.*' => 'integer',
            // Optional: how many questions to draw from each competency
            // unit, as set per module in the create-exam form. When
            // omitted (legacy callers), DistributionService falls back to
            // splitting the exam_type's fixed total evenly.
            'distribution' => 'nullable|array',
            'distribution.*.competency_unit_id' => 'integer',
            'distribution.*.question_count' => 'integer|min:0',
        ]));
        return ApiResponse::success(['exam' => $x, 'distribution' => (new DistributionService)->forExam($x)]);
    }
    public function distribution(Request $r, $id)
    {
        $x = Exam::findOrFail($id);
        $this->scope->assertExam($r->user(), $x);
        return ApiResponse::success(['distribution' => (new DistributionService)->forExam($x)]);
    }
    public function paper(Request $r, $id)
    {
        $x = Exam::findOrFail($id);
        $this->scope->assertExam($r->user(), $x);
        $paper = \App\Models\ExamPaper::where('exam_id', $x->id)->first();
        if (!$paper) return ApiResponse::error('No paper has been generated for this exam yet.', 404);
        return ApiResponse::success($paper);
    }
    public function generatePaper(Request $r, $id)
    {
        $x = Exam::findOrFail($id);
        $this->scope->assertExam($r->user(), $x);
        try {
            return ApiResponse::success((new ExamPaperService)->generate($x, $r->user()), 'Exam paper generated', 201);
        } catch (ValidationException $e) {
            return ApiResponse::validation($e->errors());
        }
    }
    public function transition(Request $r, $id)
    {
        $x = Exam::findOrFail($id);
        $this->scope->assertExam($r->user(), $x);
        $d = $r->validate(['status' => 'required|string']);
        return ApiResponse::success((new ExamService)->transition($x, $d['status']));
    }

    // Manual "Start"/"Stop" controls used by the admin exam list. These intentionally
    // bypass the strict DRAFT->SCHEDULED->READY transition chain (which requires a
    // separate configure step the create-exam form does not perform), and simply
    // flip the exam into STARTED/ENDED so an admin can run an exam on demand.
    public function start(Request $r, $id)
    {
        $x = Exam::findOrFail($id);
        $this->scope->assertExam($r->user(), $x);
        if ($x->status === 'STARTED') return ApiResponse::success($x);
        if ($x->status !== 'READY') return ApiResponse::validation(['status' => ["Only a READY exam can be started. Current status: {$x->status}."]]);
        // This manual Start control bypasses the DRAFT->SCHEDULED->READY
        // transition chain entirely, so it never went through
        // ExamService::transition()'s auto-configure safety net either.
        // An exam whose "configure" call was never made (or silently
        // failed — e.g. a validation error while saving the question
        // distribution) has zero modules/competency units attached, so
        // every student's attempt then failed with "Select at least one
        // competency unit or module." only once they tried to start —
        // far too late to notice. Apply the same fallback here before
        // starting, and hard-stop with a clear message if even that
        // can't produce a usable question pool.
        try {
            if ($x->competencyUnits()->count() === 0 && $x->modules()->count() === 0) {
                (new ExamService)->autoConfigureFromCourse($x);
            }
            (new DistributionService)->assertAvailable($x);
        } catch (ValidationException $e) {
            return ApiResponse::validation($e->errors());
        }
        $from = $x->status;
        $x->update(['status' => 'STARTED']);
        AuditLogger::record('exam.status_changed', $x, ['from' => $from, 'to' => 'STARTED']);
        return ApiResponse::success($x->fresh());
    }

    public function stop(Request $r, $id)
    {
        $x = Exam::findOrFail($id);
        $this->scope->assertExam($r->user(), $x);
        if ($x->status !== 'STARTED') return ApiResponse::validation(['status' => ['Only a running exam can be stopped.']]);
        $x->update(['status' => 'ENDED']);
        AuditLogger::record('exam.status_changed', $x, ['from' => 'STARTED', 'to' => 'ENDED']);
        // An admin stopping the exam early ends it exactly like the
        // schedule crossing end_at does (see ExamLifecycleService::sync())
        // — so any student still ACTIVE at that moment (mid-attempt, or
        // gone without ever pressing Submit) needs the same auto-submit
        // sweep here too, or they'd be stuck ACTIVE forever with no
        // ExamResult, same as the schedule-based bug this was fixing.
        ExamLifecycleService::submitAbandonedAttempts($x);
        return ApiResponse::success($x->fresh());
    }
}
