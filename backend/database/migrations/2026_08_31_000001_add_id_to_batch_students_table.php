<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The original batch_students table had no primary key at all, which meant
 * BatchStudent::findOrFail($id) in BatchStudentController::update() could
 * never work. This adds a normal auto-increment id without touching the
 * existing columns, foreign keys, or the unique constraint.
 */
return new class extends Migration {
    public function up(): void
    {
        if (Schema::getConnection()->getDriverName() === 'sqlite') {
            return;
        }
        Schema::table('batch_students', function (Blueprint $table) {
            if (!Schema::hasColumn('batch_students', 'id')) {
                $table->id()->first();
            }
        });
    }

    public function down(): void
    {
        Schema::table('batch_students', function (Blueprint $table) {
            if (Schema::hasColumn('batch_students', 'id')) {
                $table->dropColumn('id');
            }
        });
    }
};
