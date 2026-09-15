<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Additive-only migration: the admin UI's TSP table/form already has a
 * "Location" column that the original schema never stored. This adds the
 * column without touching or dropping anything else.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('tsps', function (Blueprint $table) {
            if (!Schema::hasColumn('tsps', 'location')) {
                $table->string('location')->nullable()->after('name');
            }
        });
    }

    public function down(): void
    {
        Schema::table('tsps', function (Blueprint $table) {
            if (Schema::hasColumn('tsps', 'location')) {
                $table->dropColumn('location');
            }
        });
    }
};
