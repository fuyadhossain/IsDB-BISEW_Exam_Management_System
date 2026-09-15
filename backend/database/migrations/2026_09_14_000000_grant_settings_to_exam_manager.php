<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Settings (grading rules, branding, security policy, data management)
 * was Super-Admin-only by default (AdminMiddleware derives
 * 'settings.view'/'settings.update'/'settings.create' from the URL, and
 * no such permissions existed for any other role). The client wants
 * "Admin / Exam Manager" to see and manage it too, so this grants that
 * role the same three permissions Super Admin already has via its
 * isSuperAdmin() bypass.
 *
 * Writes raw rows via DB:: (not Eloquent's Permission::create()) and
 * computes the next id manually, because this database's `permissions`/
 * `role_permissions` tables were populated from a SQL import rather than
 * migrations, and at least one table in this app (`migrations` itself)
 * turned out to be missing its AUTO_INCREMENT setting after that import
 * -- relying on the database to assign an id here would risk hitting the
 * exact "Field 'id' doesn't have a default value" error already seen
 * while running these migrations, instead of a clean idempotent migration.
 */
return new class extends Migration
{
    public function up(): void
    {
        $names = ['settings.view', 'settings.update', 'settings.create'];
        $nextId = (int) (DB::table('permissions')->max('id') ?? 0) + 1;

        foreach ($names as $name) {
            $exists = DB::table('permissions')->where('name', $name)->first();
            if (!$exists) {
                DB::table('permissions')->insert([
                    'id' => $nextId,
                    'name' => $name,
                    'description' => 'System settings — ' . str($name)->after('.')->headline(),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
                $exists = (object) ['id' => $nextId];
                $nextId++;
            }

            $examManagerRole = DB::table('roles')->where('name', 'Admin / Exam Manager')->first();
            if ($examManagerRole && !DB::table('role_permissions')->where('role_id', $examManagerRole->id)->where('permission_id', $exists->id)->exists()) {
                DB::table('role_permissions')->insert(['role_id' => $examManagerRole->id, 'permission_id' => $exists->id]);
            }
        }
    }

    public function down(): void
    {
        $ids = DB::table('permissions')->whereIn('name', ['settings.view', 'settings.update', 'settings.create'])->pluck('id');
        DB::table('role_permissions')->whereIn('permission_id', $ids)->delete();
        DB::table('permissions')->whereIn('id', $ids)->delete();
    }
};
