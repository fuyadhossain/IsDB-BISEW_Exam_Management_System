<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        foreach (['curriculum.create', 'curriculum.update'] as $name) {
            DB::table('permissions')->updateOrInsert(['name' => $name], ['description' => null]);
        }

        $roleIds = DB::table('roles')->where('name', 'COURSE_ADMIN')->pluck('id');
        $permissionIds = DB::table('permissions')->whereIn('name', ['curriculum.create', 'curriculum.update'])->pluck('id');
        foreach ($roleIds as $roleId) {
            foreach ($permissionIds as $permissionId) {
                DB::table('role_permissions')->insertOrIgnore(['role_id' => $roleId, 'permission_id' => $permissionId]);
            }
        }
    }

    public function down(): void
    {
        $roleIds = DB::table('roles')->where('name', 'COURSE_ADMIN')->pluck('id');
        $permissionIds = DB::table('permissions')->whereIn('name', ['curriculum.create', 'curriculum.update'])->pluck('id');
        DB::table('role_permissions')->whereIn('role_id', $roleIds)->whereIn('permission_id', $permissionIds)->delete();
    }
};
