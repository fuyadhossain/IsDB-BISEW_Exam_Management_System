<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Manually-entered marks (e.g. offline/practical evidence) for a
     * student against a specific exam. Kept separate from `exam_results`
     * on purpose: a student who never attempted the online MCQ exam still
     * needs an editable evidence row, and `exam_results` only ever has a
     * row for students who actually submitted an attempt.
     */
    public function up(): void
    {
        Schema::create('exam_evidences', function (Blueprint $table) {
            $table->id();
            $table->foreignId('exam_id')->constrained()->cascadeOnDelete();
            $table->foreignId('student_id')->constrained()->cascadeOnDelete();
            $table->decimal('marks', 6, 2)->nullable();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['exam_id', 'student_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('exam_evidences');
    }
};
