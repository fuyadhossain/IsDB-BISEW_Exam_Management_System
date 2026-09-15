<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Stores the admin-configured "how many questions from this competency
 * unit" number (set per module in the create-exam "Question Distribution"
 * step) directly on the exam <-> competency_unit pivot.
 *
 * Previously this number was never persisted: DistributionService always
 * split the exam_type's fixed total (config('isdb.exam_question_total'))
 * evenly across every selected competency unit, so whatever the admin
 * typed per module was discarded. Nullable so existing exams (configured
 * before this column existed) keep falling back to the even-split
 * behaviour instead of failing.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('exam_competency_units', function (Blueprint $table) {
            $table->unsignedInteger('question_count')->nullable()->after('competency_unit_id');
        });
    }

    public function down(): void
    {
        Schema::table('exam_competency_units', function (Blueprint $table) {
            $table->dropColumn('question_count');
        });
    }
};
