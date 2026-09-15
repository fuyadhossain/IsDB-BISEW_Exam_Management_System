<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * DistributionService's availability check (run on every admin exam-list
 * load AND every student's waiting-room poll via ExamLifecycleService)
 * filters `questions` by competency_unit_id + status + question_type
 * together. Only `competency_unit_id` and `status` were individually
 * indexed, so MySQL could use at most one of them and had to scan the
 * rest by hand. At today's data volume (a few hundred rows) that scan is
 * instant either way, but as the question bank grows this composite
 * index keeps that same query fast instead of degrading with table size.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('questions', function (Blueprint $table) {
            $table->index(['competency_unit_id', 'status', 'question_type'], 'questions_availability_lookup_index');
        });
    }

    public function down(): void
    {
        Schema::table('questions', function (Blueprint $table) {
            $table->dropIndex('questions_availability_lookup_index');
        });
    }
};
