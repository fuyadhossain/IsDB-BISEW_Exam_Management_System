<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A simple key-value store backing the admin Settings page — grading
 * pass marks/weights, institution branding, and student security rules,
 * all of which previously lived only as hardcoded constants/config values
 * that required a code deploy to change. Every setting has a config/code
 * fallback (see Setting::get()), so an empty table behaves exactly like
 * today — nothing breaks if a value is never overridden here.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('settings', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique();
            $table->text('value')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('settings');
    }
};
