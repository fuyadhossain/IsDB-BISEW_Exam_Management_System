<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * One-time backfill: exam_results rows created before ResultService::
 * process() switched Mid Monthly exams to a fixed 32-mark pass rule
 * (see CombinedResultService::MID_MONTHLY_COMPONENT_PASS_MARK) still
 * carry whatever status that exam's own configured pass_marks produced
 * at the time (e.g. 25). This recomputes status for every existing Mid
 * Monthly exam_results row from its already-stored total_marks against
 * the 32 mark, so historical records read consistently with the rule
 * now applied going forward. Nothing about total_marks, correct_answers,
 * or any other column is touched -- only status.
 */
return new class extends Migration {
    public function up(): void
    {
        DB::table('exam_results')
            ->join('exams', 'exams.id', '=', 'exam_results.exam_id')
            ->where('exams.exam_type', 'MID_MONTHLY')
            ->update([
                'exam_results.status' => DB::raw("CASE WHEN exam_results.total_marks >= 32 THEN 'PASS' ELSE 'FAIL' END"),
            ]);
    }

    public function down(): void
    {
        // Reverses back to each exam's own configured pass_marks -- the
        // rule ResultService::process() used before this backfill and
        // before the 32-mark rule existed.
        DB::table('exam_results')
            ->join('exams', 'exams.id', '=', 'exam_results.exam_id')
            ->where('exams.exam_type', 'MID_MONTHLY')
            ->update([
                'exam_results.status' => DB::raw("CASE WHEN exam_results.total_marks >= exams.pass_marks THEN 'PASS' ELSE 'FAIL' END"),
            ]);
    }
};
