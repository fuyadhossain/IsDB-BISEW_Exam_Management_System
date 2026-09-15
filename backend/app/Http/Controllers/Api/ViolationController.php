<?php

namespace App\Http\Controllers\Api;

use App\Models\{Batch, Course, Tsp, Round, Element, Role, Permission, Exam, ExamResult, ExamSet, ExamViolation, Question, QuestionImport, QuestionOption, Setting, Student, StudentExamAttempt, User, UserCourse, ExamAttemptQuestion, BatchStudent, Module, CompetencyUnit, Subject};
use App\Services\{AuditLogger, AttemptService, CatalogUpdateService, ExamService, HierarchyService, ImportService, QuestionBankService, ResultAuthorizationService, ResultService, StudentAuthService, UserCourseAssignmentService};
use App\Support\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ViolationController
{
    public function studentStore(Request $r, $attemptId)
    {
        $a = StudentExamAttempt::whereKey($attemptId)->where('student_id', $r->user()->id)->firstOrFail();
        $d = $r->validate(['type' => 'required|in:FOCUS_LOSS,TAB_SWITCH,FULLSCREEN_EXIT,PAGE_EXIT,SCREENSHOT_ATTEMPT', 'metadata' => 'nullable|array']);
        if ($a->status !== 'ACTIVE' || $a->expired()) return ApiResponse::error('Attempt is not active.', 409);
        $recent = ExamViolation::where('attempt_id', $a->id)->where('type', $d['type'])->where('created_at', '>=', now()->subSeconds(Setting::get('security.violation_duplicate_window_seconds', config('isdb.violation_duplicate_window_seconds'))))->exists();
        if (!$recent) $v = ExamViolation::create(['attempt_id' => $a->id, 'type' => $d['type'], 'metadata' => $d['metadata'] ?? null, 'occurred_at' => now()]);
        return ApiResponse::success(['recorded' => !$recent, 'warning' => $recent ? 'duplicate_event_ignored' : null]);
    }
    public function index(Request $r)
    {
        $q = ExamViolation::with('attempt.student:id,student_id,name')->whereHas('attempt.exam.examSet.batch', fn($batch) => (new ResultAuthorizationService)->scope($batch->select('batches.id'), $r->user()))->when($r->filled('type'), fn($x) => $x->where('type', $r->type))->when($r->filled('attempt_id'), fn($x) => $x->where('attempt_id', $r->attempt_id));
        return ApiResponse::success($q->latest()->paginate(20));
    }
    public function show(Request $r, $id)
    {
        $violation = ExamViolation::with('attempt.student', 'attempt.exam.examSet.batch')->findOrFail($id);
        (new ResultAuthorizationService)->assertAttempt($r->user(), $violation->attempt);
        return ApiResponse::success($violation);
    }
}
