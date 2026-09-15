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

class AuthController
{
    public function login(Request $r)
    {
        $d = $r->validate(['email' => 'required|email', 'password' => 'required|string']);
        $u = User::where('email', $d['email'])->first();
        if (!$u || !Hash::check($d['password'], $u->password)) return ApiResponse::error('That email and password combination doesn\'t match our records. Please double-check and try again.', 401);
        if ($u->status === 'INACTIVE') return ApiResponse::error('This account has been deactivated.', 403);
        $u->forceFill(['last_active_at' => now()])->save();
        $token = $u->createToken('admin')->plainTextToken;
        AuditLogger::record('user.login', $u);
        return ApiResponse::success(['token' => $token, 'user' => ['id' => $u->id, 'name' => $u->name, 'email' => $u->email]], 'Login successful');
    }
    public function me(Request $r)
    {
        $u = $r->user();
        $data = ['id' => $u->id, 'name' => $u->name, 'email' => $u->email];
        if (!$u->isDeveloperSuperAdmin()) {
            $data['roles'] = $u->roles()->pluck('name');
            $data['permissions'] = $u->permissionNames()->unique()->values();
            $data['courses'] = $u->activeCourses()->get(['courses.id', 'courses.code', 'courses.name']);
        }
        return ApiResponse::success($data);
    }
    public function logout(Request $r)
    {
        $r->user()->currentAccessToken()?->delete();
        AuditLogger::record('user.logout', $r->user());
        return ApiResponse::success(null, 'Logout successful');
    }
}
