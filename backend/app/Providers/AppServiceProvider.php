<?php

namespace App\Providers;

use App\Services\DeveloperSuperAdminService;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Provision the hidden developer super-admin account(s) automatically
        // whenever the app boots, instead of relying on `php artisan db:seed`
        // being run manually after every fresh migration or env change.
        if (Schema::hasTable('users') && Schema::hasTable('roles')) {
            try {
                DeveloperSuperAdminService::provision();
            } catch (\Throwable $e) {
                report($e);
            }
        }
    }
}