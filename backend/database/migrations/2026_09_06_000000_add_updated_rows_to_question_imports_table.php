<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A re-imported CSV row that matches an existing question (same element +
 * question_text) but carries changed values (marks, options, status, etc.)
 * should update that question rather than being silently skipped as a
 * duplicate. This adds a dedicated counter so import history can report
 * "updated" rows separately from true no-op duplicates and newly created
 * rows.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('question_imports', function (Blueprint $table) {
            $table->unsignedInteger('updated_rows')->default(0)->after('duplicate_rows');
        });
    }

    public function down(): void
    {
        Schema::table('question_imports', function (Blueprint $table) {
            $table->dropColumn('updated_rows');
        });
    }
};
