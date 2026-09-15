<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\{User, Role, Permission};
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $perms = ['courses', 'tsps', 'rounds', 'batches', 'students', 'curriculum', 'questions', 'exam_sets', 'exams', 'results', 'violations', 'users', 'roles', 'user_courses'];
        $all = [];
        foreach ($perms as $p) foreach (['view', 'create', 'update'] as $a) $all[] = $p . '.' . $a;
        $all[] = 'permissions.view';
        $all[] = 'audit_logs.view';
        $all = array_values(array_unique(array_merge($all, ['exams.configure', 'exams.status'])));
        foreach ($all as $n) Permission::firstOrCreate(['name' => $n]);
        $role = Role::firstOrCreate(['name' => 'SUPER_ADMIN'], ['description' => 'Unrestricted administrator']);
        $role->permissions()->sync(Permission::pluck('id'));
        $u = User::firstOrCreate(['email' => 'admin@example.test'], ['name' => 'Super Admin', 'password' => Hash::make('ChangeMe!123')]);
        $u->roles()->syncWithoutDetaching([$role->id]);
        // Consultant: the role every course-scoped administrator created
        // via the "Create course administrator" form is meant to
        // receive. It previously only existed in DemoDataSeeder (fake
        // WD-101 demo data, intentionally not run here — see the comment
        // below), so on a real install this role never got created at
        // all. RbacController::createUser() falls back to
        // `Role::where('name', 'Consultant')->value('id')` whenever no
        // role_id is supplied — the create-admin form never sends one —
        // so with no such role in the database that lookup returned null
        // and every new course administrator was silently created with
        // NO role at all (unable to do anything, including logging in to
        // a useful state), even though they *did* get the right courses
        // assigned via the separate user_courses pivot.
        //
        // Course scoping itself is unaffected by this role's permission
        // list — CourseScopeService enforces it separately, purely from
        // each user's assigned rows in user_courses (see UserCourseAssignmentService
        // and the "Assign the courses this administrator may manage"
        // section of the create-admin form). This role only controls
        // *which kinds of actions* a course admin may take; *which
        // course's data* those actions can touch is decided per user by
        // their course assignments, so multiple consultants can safely
        // share this one role while each is limited to their own
        // assigned course(s) — and every one of them still has their own
        // unique auto-incrementing users.id row, so they're never confused
        // with one another even though the role_id they share is the same.
        $courseAdminRole = Role::firstOrCreate(['name' => 'Consultant'], ['description' => 'Full access within their assigned course(s) only']);
        $courseAdminRole->permissions()->sync(Permission::whereIn('name', [
            // Full create/update/view within their assigned course(s):
            // CourseScopeService restricts every one of these queries to
            // the admin's own active courses, so "create/update" here
            // never lets them touch another course's records.
            'curriculum.view', 'curriculum.create', 'curriculum.update',
            'students.view', 'students.create', 'students.update',
            'batches.view', 'batches.create', 'batches.update',
            'questions.view', 'questions.create', 'questions.update',
            'exam_sets.view', 'exam_sets.create', 'exam_sets.update',
            'exams.view', 'exams.create', 'exams.update', 'exams.configure', 'exams.status',
            'results.view', 'results.create', 'results.update',
            'violations.view', 'violations.create', 'violations.update',
            // Read-only reference data needed to work within their course
            // (e.g. picking a TSP/Round while creating a batch) — creating
            // or editing courses/TSPs/rounds themselves stays Super-Admin-
            // only, since those define course scope rather than sit inside
            // it.
            'courses.view', 'tsps.view', 'rounds.view',
            // Intentionally NOT granted: users.*, roles.*, permissions.view,
            // user_courses.*, audit_logs.view, courses.create/update,
            // tsps.create/update, rounds.create/update — all Super-Admin-
            // only, matching AdminMiddleware's resource-derived permission
            // checks and the create-admin form's "cannot create users,
            // change roles, or access another course" notice.
        ])->pluck('id'));
        \App\Services\DeveloperSuperAdminService::provision();
        // DemoDataSeeder used to run here automatically, creating a fake
        // "WD-101" course plus demo batches/students/a course-scoped
        // consultant account — none of that belongs in this project (only
        // PWAD is real), so it no longer runs. The permissions/roles/Super
        // Admin user above are real system setup, not demo data, and stay.
    }
}
