<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('tsps', function (Blueprint $table) {
            $table->string('center_manager_mobile', 30)->nullable()->after('location');
        });
    }

    public function down(): void
    {
        Schema::table('tsps', function (Blueprint $table) {
            $table->dropColumn('center_manager_mobile');
        });
    }
};
