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

class RbacController
{
    public function users(Request $r)
    {
        $q = User::excludeDeveloperAccounts()->select(['id', 'name', 'email', 'status', 'last_active_at', 'created_at'])->with(['roles:id,name', 'courses' => fn($c) => $c->wherePivot('status', 'ACTIVE')->select('courses.id', 'courses.code', 'courses.name')]);
        if ($r->filled('search')) $q->where(fn($x) => $x->where('name', 'like', '%' . $r->search . '%')->orWhere('email', 'like', '%' . $r->search . '%'));
        return ApiResponse::success($q->latest()->paginate(20));
    }
    public function createUser(Request $r)
    {
        $d = $r->validate(['name' => 'required|string|max:255', 'email' => 'required|email|unique:users,email', 'password' => 'required|string|min:8', 'role_id' => 'nullable|exists:roles,id', 'status' => 'sometimes|in:ACTIVE,INACTIVE']);
        // Privilege escalation guard: this endpoint is reachable by any
        // admin holding the `users.create` permission (see AdminMiddleware),
        // not only Super Admins. Without this check, such an admin could
        // pass role_id = the SUPER_ADMIN role's own id and mint a brand new
        // super admin account for themselves — role_id was previously
        // accepted with no restriction at all. Only an existing Super Admin
        // may hand out the SUPER_ADMIN role itself.
        if (isset($d['role_id']) && Role::whereKey($d['role_id'])->where('name', 'SUPER_ADMIN')->exists()) {
            abort_unless($r->user()->isSuperAdmin(), 403, 'Only Super Admin can assign the Super Admin role.');
        }
        $u = DB::transaction(function () use ($d) {
            // Falls back to the "Consultant" role (the standard
            // course-scoped admin role — see the rename_exam_manager_role
            // migration) when no role_id is given.
            $roleId = $d['role_id'] ?? Role::where('name', 'Consultant')->value('id');
            unset($d['role_id']);
            $d['password'] = Hash::make($d['password']);
            $d['status'] = $d['status'] ?? 'ACTIVE';
            $u = User::create($d);
            if ($roleId) $u->roles()->sync([$roleId]);
            AuditLogger::record('user.created', $u, ['role_id' => $roleId]);
            return $u;
        });
        return ApiResponse::success(['id' => $u->id, 'name' => $u->name, 'email' => $u->email, 'status' => $u->status, 'roles' => $u->load('roles:id,name')->roles], 'User created', 201);
    }
    public function updateUser(Request $r, $id)
    {
        abort_unless($r->user()->isSuperAdmin(), 403, 'Only Super Admin can update another administrator.');
        $u = User::excludeDeveloperAccounts()->findOrFail($id);
        $d = $r->validate(['name' => 'sometimes|string|max:255', 'email' => 'sometimes|email|unique:users,email,' . $id, 'password' => 'sometimes|string|min:8', 'status' => 'sometimes|in:ACTIVE,INACTIVE', 'course_ids' => 'sometimes|array', 'course_ids.*' => 'integer|exists:courses,id']);
        $courseIds = $d['course_ids'] ?? null;
        unset($d['course_ids']);
        if (isset($d['password'])) $d['password'] = Hash::make($d['password']);
        $u->update($d);
        if ($courseIds !== null) {
            $service = new UserCourseAssignmentService;
            $activeIds = $u->activeCourses()->pluck('courses.id')->all();
            foreach (array_diff($activeIds, $courseIds) as $removeId) {
                $assignment = UserCourse::where('user_id', $u->id)->where('course_id', $removeId)->first();
                if ($assignment) $service->changeStatus($assignment, 'INACTIVE', $r->user()?->id);
            }
            foreach (array_diff($courseIds, $activeIds) as $addId) {
                $service->assign($u->id, $addId, $r->user()?->id);
            }
        }
        AuditLogger::record('user.updated', $u);
        $u = $u->fresh(['roles:id,name', 'courses' => fn($c) => $c->wherePivot('status', 'ACTIVE')->select('courses.id', 'courses.code', 'courses.name')]);
        return ApiResponse::success(['id' => $u->id, 'name' => $u->name, 'email' => $u->email, 'status' => $u->status, 'last_active_at' => $u->last_active_at, 'courses' => $u->courses]);
    }
    public function roles()
    {
        return ApiResponse::success(Role::with(['permissions:id,name'])->withCount(['users' => fn($q) => $q->excludeDeveloperAccounts()])->orderBy('name')->paginate(50));
    }
    public function createRole(Request $r)
    {
        $d = $r->validate(['name' => 'required|string|max:100|unique:roles,name', 'description' => 'nullable|string']);
        return ApiResponse::success(Role::create($d), 'Role created', 201);
    }
    public function updateRole(Request $r, $id)
    {
        $role = Role::findOrFail($id);
        $role->update($r->validate(['name' => 'sometimes|string|max:100|unique:roles,name,' . $id, 'description' => 'nullable|string']));
        return ApiResponse::success($role->fresh());
    }
    public function permissions()
    {
        return ApiResponse::success(Permission::orderBy('name')->paginate(100));
    }
    public function auditLogs(Request $r)
    {
        $q = \App\Models\AuditLog::with('user:id,name,email')->latest();
        return ApiResponse::success($q->paginate(min((int)$r->input('per_page', 50), 100)));
    }
    public function assignRole(Request $r, $id)
    {
        $d = $r->validate(['role_id' => 'required|exists:roles,id']);
        // Same privilege escalation guard as createUser() above: this route
        // only requires `users.create` (see AdminMiddleware — POST resolves
        // to the "create" action regardless of the {id} segment), so any
        // admin with that permission could otherwise promote any existing
        // user — including themselves — straight to SUPER_ADMIN.
        if (Role::whereKey($d['role_id'])->where('name', 'SUPER_ADMIN')->exists()) {
            abort_unless($r->user()->isSuperAdmin(), 403, 'Only Super Admin can assign the Super Admin role.');
        }
        $u = User::excludeDeveloperAccounts()->findOrFail($id);
        $u->roles()->syncWithoutDetaching([$d['role_id']]);
        User::forgetPermissionCache($u->id);
        AuditLogger::record('role.assigned', $u, ['role_id' => $d['role_id']]);
        return ApiResponse::success($u->load('roles:id,name'));
    }
    public function assignPermissions(Request $r, $id)
    {
        $d = $r->validate(['permission_ids' => 'required|array', 'permission_ids.*' => 'integer|exists:permissions,id']);
        $role = Role::findOrFail($id);
        $role->permissions()->sync($d['permission_ids']);
        User::whereHas('roles', fn($q) => $q->whereKey($id))->pluck('id')->each(fn($userId) => User::forgetPermissionCache($userId));
        AuditLogger::record('permissions.assigned', $role, ['permission_count' => count($d['permission_ids'])]);
        return ApiResponse::success($role->load('permissions:id,name'));
    }
}
