<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('user_courses', function (Blueprint $table) {
            $table->foreignId('assigned_by')->nullable()->after('course_id')->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('user_courses', function (Blueprint $table) {
            $table->dropConstrainedForeignId('assigned_by');
        });
    }
};
