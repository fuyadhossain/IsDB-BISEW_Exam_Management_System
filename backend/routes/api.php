<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\{AttemptController, AuthController, BatchStudentController, CatalogController, DashboardController, ExamController, ExamSetAdminController, HealthController, QuestionController, RbacController, QuestionImportController, ReportController, ResultController, SettingsController, StudentAuthController, UserCourseAssignmentController, ViolationController};

Route::prefix('v1')->group(function () {
    Route::get('health', HealthController::class);
    Route::prefix('auth')->group(function () {
        Route::post('login', [AuthController::class, 'login'])->middleware('throttle:10,1');
        Route::middleware('auth:sanctum')->group(function () {
            Route::get('me', [AuthController::class, 'me']);
            Route::post('logout', [AuthController::class, 'logout']);
        });
    });
    Route::prefix('student')->group(function () {
        Route::post('login', [StudentAuthController::class, 'login'])->middleware('throttle:10,1');
        Route::middleware(['auth:sanctum', 'student'])->group(function () {
            Route::get('me', [StudentAuthController::class, 'me']);
            Route::post('logout', [StudentAuthController::class, 'logout']);
            Route::get('exams', [AttemptController::class, 'available']);
            Route::post('exams/{exam}/start', [AttemptController::class, 'start'])->middleware('throttle:10,1');
            Route::get('attempts/{attempt}', [AttemptController::class, 'show']);
            Route::post('attempts/{attempt}/answers', [AttemptController::class, 'answer'])->middleware('throttle:120,1');
            Route::post('attempts/{attempt}/submit', [AttemptController::class, 'submit']);
            Route::post('attempts/{attempt}/violations', [ViolationController::class, 'studentStore'])->middleware('throttle:30,1');
        });
    });
    Route::middleware(['auth:sanctum', 'admin'])->prefix('admin')->group(function () {
        foreach (['courses', 'tsps', 'rounds', 'batches', 'students', 'subjects', 'modules', 'competency-units', 'elements'] as $type) {
            Route::get($type, fn(\Illuminate\Http\Request $r) => app(CatalogController::class)->index($r, $type));
            Route::post($type, fn(\Illuminate\Http\Request $r) => app(CatalogController::class)->store($r, $type));
            Route::get($type . '/{id}', fn($id) => app(CatalogController::class)->show($type, $id));
            Route::put($type . '/{id}', fn(\Illuminate\Http\Request $r, $id) => app(CatalogController::class)->update($r, $type, $id));
            Route::delete($type . '/{id}', fn($id) => app(CatalogController::class)->destroy($type, $id));
        }
        Route::get('users', [RbacController::class, 'users']);
        Route::post('users', [RbacController::class, 'createUser']);
        Route::put('users/{id}', [RbacController::class, 'updateUser']);
        Route::get('roles', [RbacController::class, 'roles']);
        Route::post('roles', [RbacController::class, 'createRole']);
        Route::put('roles/{id}', [RbacController::class, 'updateRole']);
        Route::get('permissions', [RbacController::class, 'permissions']);
        Route::get('audit-logs', [RbacController::class, 'auditLogs']);
        Route::post('users/{id}/roles', [RbacController::class, 'assignRole']);
        Route::put('roles/{id}/permissions', [RbacController::class, 'assignPermissions']);
        Route::post('students/{id}/unlock', [CatalogController::class, 'unlockStudent']);
        Route::post('batches/{batch}/students', [BatchStudentController::class, 'store']);
        Route::get('batches/{batch}/students', [BatchStudentController::class, 'index']);
        Route::patch('batch-students/{assignment}', [BatchStudentController::class, 'update']);
        Route::middleware('superadmin')->prefix('user-courses')->group(function () {
            Route::get('', [UserCourseAssignmentController::class, 'index']);
            Route::post('', [UserCourseAssignmentController::class, 'store']);
            Route::get('{assignment}', [UserCourseAssignmentController::class, 'show']);
            Route::patch('{assignment}', [UserCourseAssignmentController::class, 'update']);
        });
        Route::get('questions', [QuestionController::class, 'index']);
        Route::post('questions', [QuestionController::class, 'store']);
        Route::get('questions/{question}', [QuestionController::class, 'show']);
        Route::put('questions/{question}', [QuestionController::class, 'update']);
        Route::get('question-imports', [QuestionImportController::class, 'index']);
        Route::post('question-imports', [QuestionImportController::class, 'store']);
        Route::get('question-imports/{import}', [QuestionImportController::class, 'show']);
        Route::get('exam-sets', [ExamController::class, 'sets']);
        Route::post('exam-sets', [ExamController::class, 'createSet']);
        Route::get('exam-sets/{set}', [ExamController::class, 'showSet']);
        Route::put('exam-sets/{set}', [ExamSetAdminController::class, 'update']);
        Route::get('exams', [ExamController::class, 'exams']);
        Route::post('exams', [ExamController::class, 'createExam']);
        Route::get('exams/{exam}', [ExamController::class, 'showExam']);
        Route::put('exams/{exam}', [ExamController::class, 'updateExam']);
        Route::put('exams/{exam}/configuration', [ExamController::class, 'configure']);
        Route::get('exams/{exam}/distribution', [ExamController::class, 'distribution']);
        Route::post('exams/{exam}/transition', [ExamController::class, 'transition']);
        Route::get('exams/{exam}/paper', [ExamController::class, 'paper']);
        Route::post('exams/{exam}/paper', [ExamController::class, 'generatePaper']);
        Route::post('exams/{exam}/start', [ExamController::class, 'start']);
        Route::post('exams/{exam}/stop', [ExamController::class, 'stop']);
        Route::get('results', [ResultController::class, 'index']);
        // Registered as "results/detail" (a sub-path of the "results"
        // resource), not a separate "results-detail" top-level segment —
        // AdminMiddleware derives the required permission straight from
        // the URL's resource segment (the path piece right after
        // "admin/"), so "results-detail" was being read as a resource
        // literally called "results_detail" needing a "results_detail.view"
        // permission that doesn't exist for anyone. Superadmin bypasses
        // that check entirely, which is why this only broke for every
        // other role. Still registered before the "results/{result}"
        // wildcard below so the literal "detail" path segment is matched
        // first instead of being treated as an ExamResult id.
        Route::get('results/detail', [ResultController::class, 'detail']);
        Route::get('results/{result}', [ResultController::class, 'show']);
        Route::get('results/{result}/combined', [ResultController::class, 'combined']);
        Route::post('attempts/{attempt}/process-result', [ResultController::class, 'process']);
        Route::get('dashboard/overview', [DashboardController::class, 'overview']);
        Route::get('reports/batches', [ReportController::class, 'batchSummary']);
        Route::get('reports/exams', [ReportController::class, 'examSummary']);
        Route::get('reports/export', [ReportController::class, 'export']);
        Route::get('violations', [ViolationController::class, 'index']);
        Route::get('violations/{violation}', [ViolationController::class, 'show']);
        Route::get('settings', [SettingsController::class, 'index']);
        Route::put('settings', [SettingsController::class, 'update']);
        Route::post('settings/logo', [SettingsController::class, 'uploadLogo']);
        Route::post('settings/purge-audit-logs', [SettingsController::class, 'purgeAuditLogs']);
        Route::get('settings/backup', [SettingsController::class, 'exportBackup']);
    });
});


// Legacy compatibility surface for the existing React frontend. The frontend
// remains unchanged; these aliases adapt its documented /api contract.
Route::prefix('admin')->middleware(['auth:sanctum', 'admin'])->group(function () {
    Route::get('curriculum/options', [\App\Http\Controllers\Api\FrontendCompatibilityController::class, 'curriculumOptions']);
    Route::patch('account/password', [\App\Http\Controllers\Api\FrontendCompatibilityController::class, 'updatePassword']);
    Route::get('results/filter-options', [\App\Http\Controllers\Api\FrontendCompatibilityController::class, 'resultFilterOptions']);
    Route::get('results', [\App\Http\Controllers\Api\FrontendCompatibilityController::class, 'results']);
    Route::post('results/evidence', [\App\Http\Controllers\Api\FrontendCompatibilityController::class, 'updateEvidence']);
    Route::post('results/attendance', [\App\Http\Controllers\Api\FrontendCompatibilityController::class, 'markAttendance']);
    Route::post('imports/{dataType}', [\App\Http\Controllers\Api\FrontendCompatibilityController::class, 'import']);
});

Route::prefix('student')->group(function () {
    // Fix: this legacy-compatibility login route had no throttle at all,
    // unlike the equivalent v1/student/login above (throttle:10,1). It
    // authenticates with student_id + date_of_birth — a guessable secret
    // (limited plausible range, often not actually private) — so leaving
    // it unthrottled let an attacker brute-force birthdates for a known
    // student_id with unlimited requests. Account-level lockout in
    // StudentAuthService still exists as a second layer, but this closes
    // the cheaper, earlier IP-level defense to match the v1 route.
    Route::post('exam/login', [\App\Http\Controllers\Api\FrontendCompatibilityController::class, 'studentLogin'])->middleware('throttle:10,1');
    Route::middleware(['auth:sanctum', 'student'])->group(function () {
        Route::get('exams', [\App\Http\Controllers\Api\AttemptController::class, 'available']);
        Route::post('attempts', function (\Illuminate\Http\Request $request) {
            $request->validate(['exam_id' => ['required', 'integer', 'exists:exams,id']]);
            return app(\App\Http\Controllers\Api\AttemptController::class)->start($request, (int) $request->input('exam_id'));
        })->middleware('throttle:10,1');
        Route::get('attempts/{attempt}', [\App\Http\Controllers\Api\AttemptController::class, 'show']);
        // The v1 equivalents of these two also carry throttles
        // (answers: 120,1 / violations: 30,1) — these legacy-compat paths
        // were missing them entirely, leaving both open to unlimited
        // request volume from a single authenticated student session.
        Route::put('attempts/{attempt}/answers/{question}', [\App\Http\Controllers\Api\FrontendCompatibilityController::class, 'answerByQuestion'])->middleware('throttle:120,1');
        Route::post('attempts/{attempt}/submit', [\App\Http\Controllers\Api\AttemptController::class, 'submit']);
        Route::post('attempts/{attempt}/violations', [\App\Http\Controllers\Api\ViolationController::class, 'studentStore'])->middleware('throttle:30,1');
    });
});

Route::prefix('admin')->middleware(['auth:sanctum', 'admin'])->group(function () {
    Route::post('exams/{exam}/offline-paper', [\App\Http\Controllers\Api\ExamController::class, 'generatePaper']);
    Route::get('exams/{exam}/offline-paper/print', [\App\Http\Controllers\Api\ExamController::class, 'paper']);
    Route::post('exams/{exam}/start', [\App\Http\Controllers\Api\ExamController::class, 'start']);
    Route::post('exams/{exam}/stop', [\App\Http\Controllers\Api\ExamController::class, 'stop']);
});
