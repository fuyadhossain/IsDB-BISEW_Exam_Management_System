<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds a manual attendance flag onto the existing `exam_evidences` table
 * instead of creating a new attendance table. `exam_evidences` already has
 * exactly the shape manual attendance needs — one row per (exam, student)
 * with a unique constraint that prevents duplicates — so attendance is just
 * another column on the same row as the manually-entered marks.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('exam_evidences', function (Blueprint $table) {
            $table->boolean('attended')->default(false)->after('marks');
            $table->timestamp('attended_at')->nullable()->after('attended');
        });
    }

    public function down(): void
    {
        Schema::table('exam_evidences', function (Blueprint $table) {
            $table->dropColumn(['attended', 'attended_at']);
        });
    }
};
