<?php

namespace App\Http\Controllers\Api;

use App\Models\{AuditLog, Setting};
use App\Services\AuditLogger;
use App\Support\ApiResponse;
use Illuminate\Http\Request;

/**
 * Backs the admin Settings page. Every value read here has a fallback to
 * whatever this app hardcoded before Settings existed (see the `?? `
 * defaults below and FinalResultService/StudentAuthService/etc.), so an
 * empty `settings` table is exactly today's behavior — nothing breaks
 * until an admin actually changes something.
 *
 * Accessible to Super Admin and to the "Consultant" role (see
 * the grant_settings_to_exam_manager migration) — no other role has it,
 * since these are system-wide grading/security/branding rules rather
 * than a per-course concern.
 */
class SettingsController
{
    public function index(Request $r)
    {
        return ApiResponse::success([
            'grading' => [
                'mid_pass_mark' => Setting::get('grading.mid_pass_mark', 32),
                'mid_weight_percent' => Setting::get('grading.mid_weight_percent', 20),
                'monthly_weight_percent' => Setting::get('grading.monthly_weight_percent', 80),
                'component_pass_threshold' => Setting::get('grading.component_pass_threshold', 28),
            ],
            'branding' => [
                'institution_name' => Setting::get('branding.institution_name', 'IsDB-BISEW'),
                'institution_subtitle' => Setting::get('branding.institution_subtitle', 'Examination Management System'),
                'logo_url' => Setting::get('branding.logo_url', null),
            ],
            'security' => [
                'student_max_failed_logins' => Setting::get('security.student_max_failed_logins', config('isdb.student_max_failed_logins', 5)),
                'student_lock_minutes' => Setting::get('security.student_lock_minutes', config('isdb.student_lock_minutes', 15)),
                'student_token_expiration_minutes' => Setting::get('security.student_token_expiration_minutes', config('isdb.student_token_expiration_minutes', 180)),
                'violation_duplicate_window_seconds' => Setting::get('security.violation_duplicate_window_seconds', config('isdb.violation_duplicate_window_seconds', 10)),
                'batch_active_capacity' => Setting::get('security.batch_active_capacity', config('isdb.batch_active_capacity', 15)),
            ],
            'data' => [
                'audit_log_retention_days' => Setting::get('data.audit_log_retention_days', null),
            ],
            'notifications' => [
                'alert_email' => Setting::get('notifications.alert_email', null),
                // No SMTP/SMS provider is configured in this app yet -- an
                // alert email/number saved here isn't actually sent
                // anywhere until that's wired up. Surfaced so the UI can
                // show an honest "not yet connected" notice instead of
                // implying delivery already works.
                'delivery_configured' => false,
            ],
        ]);
    }

    public function update(Request $r)
    {
        $d = $r->validate([
            'grading.mid_pass_mark' => ['sometimes', 'numeric', 'min:0', 'max:100'],
            'grading.mid_weight_percent' => ['sometimes', 'numeric', 'min:0', 'max:100'],
            'grading.monthly_weight_percent' => ['sometimes', 'numeric', 'min:0', 'max:100'],
            'grading.component_pass_threshold' => ['sometimes', 'numeric', 'min:0', 'max:100'],
            'branding.institution_name' => ['sometimes', 'string', 'max:150'],
            'branding.institution_subtitle' => ['sometimes', 'string', 'max:200'],
            'security.student_max_failed_logins' => ['sometimes', 'integer', 'min:1', 'max:20'],
            'security.student_lock_minutes' => ['sometimes', 'integer', 'min:1', 'max:1440'],
            'security.student_token_expiration_minutes' => ['sometimes', 'integer', 'min:5', 'max:1440'],
            'security.violation_duplicate_window_seconds' => ['sometimes', 'integer', 'min:1', 'max:300'],
            'security.batch_active_capacity' => ['sometimes', 'integer', 'min:1', 'max:500'],
            'data.audit_log_retention_days' => ['sometimes', 'nullable', 'integer', 'min:7', 'max:3650'],
            'notifications.alert_email' => ['sometimes', 'nullable', 'email'],
        ]);

        // A Mid Monthly + Monthly weight pair that doesn't add up to 100%
        // would silently under- or over-count every Final Result, so this
        // is checked together rather than validating each field alone.
        $midWeight = $d['grading.mid_weight_percent'] ?? Setting::get('grading.mid_weight_percent', 20);
        $monthlyWeight = $d['grading.monthly_weight_percent'] ?? Setting::get('grading.monthly_weight_percent', 80);
        if (round($midWeight + $monthlyWeight, 2) !== 100.0) {
            return ApiResponse::error('Mid Monthly weight and Monthly weight must add up to 100%.', 422);
        }

        Setting::setMany($d);
        AuditLogger::record('settings.updated', null, ['keys' => array_keys($d)]);

        return $this->index($r);
    }

    /** Institution logo upload -- stored under storage/app/public/branding, served via the public disk symlink. */
    public function uploadLogo(Request $r)
    {
        $r->validate(['logo' => ['required', 'image', 'max:2048']]);
        $path = $r->file('logo')->store('branding', 'public');
        $url = asset('storage/' . $path);
        Setting::set('branding.logo_url', $url);
        AuditLogger::record('settings.logo_updated');
        return ApiResponse::success(['logo_url' => $url]);
    }

    /** Manually deletes audit log rows older than the configured retention window. */
    public function purgeAuditLogs(Request $r)
    {
        $days = Setting::get('data.audit_log_retention_days', null);
        if (!$days) {
            return ApiResponse::error('Set an audit log retention period first.', 422);
        }
        $deleted = AuditLog::where('created_at', '<', now()->subDays((int) $days))->delete();
        AuditLogger::record('settings.audit_logs_purged', null, ['deleted' => $deleted, 'older_than_days' => $days]);
        return ApiResponse::success(['deleted' => $deleted]);
    }

    /**
     * A practical stand-in for a full database backup: this app has no
     * guaranteed shell access to `mysqldump` (e.g. shared hosting), so
     * this exports the core tables as CSV files zipped together instead
     * of attempting to shell out to a binary that may not exist.
     */
    public function exportBackup(Request $r)
    {
        $tables = [
            'students', 'courses', 'tsps', 'rounds', 'batches', 'batch_students',
            'exam_sets', 'exams', 'exam_results', 'exam_evidences', 'exam_violations',
            'student_exam_attempts', 'users', 'roles', 'permissions',
        ];

        $zipPath = storage_path('app/isdb-bisew-backup-' . now()->format('Ymd-His') . '.zip');
        $zip = new \ZipArchive();
        $zip->open($zipPath, \ZipArchive::CREATE | \ZipArchive::OVERWRITE);

        foreach ($tables as $table) {
            if (!\Illuminate\Support\Facades\Schema::hasTable($table)) continue;
            $rows = \Illuminate\Support\Facades\DB::table($table)->get();
            $csv = fopen('php://temp', 'w+');
            if ($rows->isNotEmpty()) {
                fputcsv($csv, array_keys((array) $rows->first()));
                foreach ($rows as $row) fputcsv($csv, (array) $row);
            }
            rewind($csv);
            $zip->addFromString("{$table}.csv", stream_get_contents($csv));
            fclose($csv);
        }
        $zip->close();

        AuditLogger::record('settings.backup_exported');

        return response()->download($zipPath, basename($zipPath))->deleteFileAfterSend(true);
    }
}
