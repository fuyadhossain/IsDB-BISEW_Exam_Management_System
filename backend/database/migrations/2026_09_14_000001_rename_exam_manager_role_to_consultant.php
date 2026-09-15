<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Renames the role currently stored as "Admin / Exam Manager" to
 * "Consultant" — the name used consistently by DemoDataSeeder.php
 * elsewhere in this codebase, and the client's requested standard name
 * for this role everywhere in the app.
 *
 * Only touches the `roles.name` column (by id, once the row is found by
 * its old name) — role_permissions/user_roles link by id, not by name,
 * so no other table needs updating for this rename to take full effect.
 *
 * Runs after grant_settings_to_exam_manager (2026_09_14_000000), so that
 * migration's own name lookup still finds the role under its old name if
 * it hasn't run yet, and is unaffected if it already has (it links by id).
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('roles')->where('name', 'Admin / Exam Manager')->update(['name' => 'Consultant']);
    }

    public function down(): void
    {
        DB::table('roles')->where('name', 'Consultant')->update(['name' => 'Admin / Exam Manager']);
    }
};
