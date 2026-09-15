<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Elements were created without a `status` column (see
 * 2026_08_27_140000_create_isdb_schema.php), so there was never a way to
 * deactivate one — only permanently delete it. This adds the same
 * Active/Inactive status column every other catalog type (courses, tsps,
 * rounds, batches, subjects, modules, competency_units) already has, so
 * elements can be deactivated instead of deleted.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('elements', function (Blueprint $table) {
            $table->string('status')->default('ACTIVE')->index()->after('name');
        });
    }

    public function down(): void
    {
        Schema::table('elements', function (Blueprint $table) {
            $table->dropColumn('status');
        });
    }
};
