<?php

namespace App\Http\Controllers\Api;

use App\Models\{Batch, Course, Tsp, Round, Element, Role, Permission, Exam, ExamResult, ExamSet, ExamViolation, Question, QuestionImport, QuestionOption, Student, StudentExamAttempt, User, UserCourse, ExamAttemptQuestion, BatchStudent, Module, CompetencyUnit, Subject};
use App\Services\{AuditLogger, AttemptService, CatalogUpdateService, ExamService, HierarchyService, ImportService, QuestionBankService, ResultAuthorizationService, ResultService, StudentAuthService, UserCourseAssignmentService};
use App\Support\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class QuestionImportController
{
    private function safe(QuestionImport $x): array
    {
        return $x->only(['id', 'uploaded_by', 'file_name', 'total_rows', 'successful_rows', 'failed_rows', 'duplicate_rows', 'updated_rows', 'status', 'created_at', 'updated_at']);
    }
    public function store(Request $r)
    {
        $d = $r->validate(['file' => 'required|file|mimes:csv,txt|max:10240']);
        $x = (new ImportService)->import($r->user(), $d['file']);
        return ApiResponse::success($this->safe($x), 'Import completed', 201);
    }
    public function index(Request $r)
    {
        $q = QuestionImport::query()->select(['id', 'uploaded_by', 'file_name', 'total_rows', 'successful_rows', 'failed_rows', 'duplicate_rows', 'updated_rows', 'status', 'created_at', 'updated_at'])->with('uploader:id,name');
        if (!$r->user()->isSuperAdmin()) $q->where('uploaded_by', $r->user()->id);
        return ApiResponse::success($q->latest()->paginate(20));
    }
    public function show(Request $r, $id)
    {
        $x = QuestionImport::query()->select(['id', 'uploaded_by', 'file_name', 'total_rows', 'successful_rows', 'failed_rows', 'duplicate_rows', 'updated_rows', 'status', 'created_at', 'updated_at'])->with(['rows' => fn($q) => $q->select(['id', 'import_id', 'row_number', 'question_id', 'raw_data', 'status', 'error_message', 'created_at', 'updated_at'])])->findOrFail($id);
        abort_unless($r->user()->isSuperAdmin() || $x->uploaded_by === $r->user()->id, 403, 'You may only view imports you uploaded.');
        return ApiResponse::success($x);
    }
}
