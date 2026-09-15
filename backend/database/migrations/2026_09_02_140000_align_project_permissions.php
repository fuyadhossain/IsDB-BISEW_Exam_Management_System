<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        $resources = ['users', 'roles', 'permissions', 'audit_logs', 'user_courses'];
        $permissions = [];
        foreach ($resources as $resource) {
            foreach (['view', 'create', 'update'] as $action) {
                $permissions[] = $resource.'.'.$action;
            }
        }
        $permissions[] = 'exams.configure';
        $permissions[] = 'exams.status';
        foreach ($permissions as $name) {
            DB::table('permissions')->updateOrInsert(['name' => $name], ['description' => null]);
        }
        $obsoleteIds = DB::table('permissions')->where(function ($query) {
            $query->where('name', 'like', '%.delete')->orWhereIn('name', ['results.update', 'violations.create', 'violations.update']);
        })->pluck('id');
        DB::table('role_permissions')->whereIn('permission_id', $obsoleteIds)->delete();
        DB::table('permissions')->whereIn('id', $obsoleteIds)->delete();
    }

    public function down(): void
    {
        // Permission catalog changes are intentionally retained.
    }
};