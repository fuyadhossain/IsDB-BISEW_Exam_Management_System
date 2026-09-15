<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The Monthly exam is offline (printed paper), so unlike the online Mid
 * exam its MCQ answers are never auto-graded — an admin has to key the
 * MCQ score in by hand, same as the rest of the evidence marks. This adds
 * a dedicated `mcq_marks` column alongside the existing `marks` column so
 * that MCQ and (descriptive/practical) evidence marks can be entered and
 * tracked separately, rather than the admin having to pre-add them in
 * their head before typing one combined number into `marks`.
 *
 * `marks` keeps its existing meaning (the student's overall obtained
 * marks for the exam) so nothing that already reads `marks` — including
 * CombinedResultService — needs to change.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('exam_evidences', function (Blueprint $table) {
            $table->decimal('mcq_marks', 6, 2)->nullable()->after('marks');
        });
    }

    public function down(): void
    {
        Schema::table('exam_evidences', function (Blueprint $table) {
            $table->dropColumn('mcq_marks');
        });
    }
};
