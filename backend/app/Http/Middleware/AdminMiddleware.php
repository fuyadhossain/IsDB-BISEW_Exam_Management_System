<?php
namespace App\Http\Middleware;
use Closure;
use App\Models\User;
use App\Models\Student;
use App\Support\ApiResponse;

class AdminMiddleware {
    public function handle($request, Closure $next) {
        $u = $request->user();
        if (!($u instanceof User)) return ApiResponse::error('Administrator authentication required.', 403);
        if ($u->status === 'INACTIVE') return ApiResponse::error('This account has been deactivated.', 403);
        if ($u->isSuperAdmin()) return $next($request);
        $path = trim($request->path(), '/');
        $parts = explode('/', $path);
        // Locate the 'admin' segment itself rather than assuming a fixed
        // index, because not every admin route lives under the same
        // /api/v1/admin/... depth — the legacy compatibility routes are
        // mounted at /api/admin/... (one segment shallower), and a fixed
        // offset silently resolved the wrong resource name for them.
        $adminIndex = array_search('admin', $parts, true);
        $resource = $parts[$adminIndex + 1] ?? '';
        $sub = $parts[$adminIndex + 2] ?? '';
        // Self-service account routes (e.g. changing your own password)
        // are not gated by a resource permission — every authenticated
        // admin, course-scoped or not, may manage their own account.
        // Dashboard overview is the landing page for every admin role and
        // already scopes its own data to the caller's courses internally
        // (see DashboardController), so it's exempted the same way.
        if (in_array($resource, ['account', 'dashboard'], true)) return $next($request);
        $action = match (true) {
            $sub === 'configuration' => 'configure',
            $sub === 'distribution' => 'view',
            in_array($sub, ['transition', 'start', 'stop'], true) => 'status',
            $request->isMethod('GET') => 'view',
            $request->isMethod('POST') => 'create',
            // DELETE is treated as an update, not a separate permission:
            // CatalogController::destroy() no longer performs a real
            // delete for any catalog type — it flips status to INACTIVE
            // (the same effect an admin could reach via a normal PUT with
            // {"status":"INACTIVE"}). There is deliberately no
            // "<resource>.delete" permission anywhere in the seeded
            // permission set, so mapping DELETE to its own 'delete' action
            // made this endpoint permanently unreachable for every
            // non-super-admin. Gating it on the same '.update' permission
            // that already governs status changes matches what the
            // endpoint actually does now.
            $request->isMethod('PUT') || $request->isMethod('PATCH') || $request->isMethod('DELETE') => 'update',
            default => 'view',
        };
        $resource = match ($resource) {
            'exam-sets' => 'exam_sets',
            'question-imports' => 'questions',
            'batch-students' => 'batches',
            'attempts' => $sub === 'process-result' ? 'results' : 'results',
            'reports' => 'results',
            'subjects', 'modules', 'competency-units', 'elements' => 'curriculum',
            // Legacy CSV import compatibility route: /admin/imports/{dataType}
            // — the resource to check is the dataType itself (e.g. "questions"
            // or "students"), which lands in $sub, not the literal "imports".
            'imports' => $sub !== '' ? $sub : 'imports',
            default => str_replace('-', '_', $resource),
        };
        if ($resource === 'exams' && $sub === 'process-result') $resource = 'results';
        $required = $resource . '.' . $action;
        $allowed = $u->hasPermission($required) || ($resource === 'batches' && $u->hasPermission('students.' . $action));
        return $allowed ? $next($request) : ApiResponse::error('You do not have permission to perform this action.', 403);
    }
}
