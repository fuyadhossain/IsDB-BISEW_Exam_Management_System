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

class StudentAuthController
{
    public function login(Request $r)
    {
        $d = $r->validate(['student_id' => 'required|string', 'date_of_birth' => 'required|date_format:Y-m-d']);
        try {
            return ApiResponse::success((new StudentAuthService)->authenticate($d['student_id'], $d['date_of_birth']), 'Student login successful');
        } catch (ValidationException $e) {
            return ApiResponse::validation($e->errors());
        }
    }
    public function me(Request $r)
    {
        $s = $r->user();
        $eligible = $s->assignments()->where('status', 'ACTIVE')->exists();
        return ApiResponse::success(['student_id' => $s->student_id, 'name' => $s->name, 'date_of_birth' => $s->date_of_birth?->format('Y-m-d'), 'status' => $s->status, 'portal_access' => $eligible]);
    }
    public function logout(Request $r)
    {
        $r->user()->currentAccessToken()?->delete();
        return ApiResponse::success(null, 'Logout successful');
    }
}
