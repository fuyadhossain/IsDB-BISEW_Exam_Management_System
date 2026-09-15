<?php
namespace App\Http\Middleware;
use Closure;
use App\Models\User;
use App\Models\Student;
use App\Support\ApiResponse;

class PermissionMiddleware {
    public function handle($request, Closure $next, $permission) {
        $u = $request->user();
        return $u instanceof User && $u->hasPermission($permission) ? $next($request) : ApiResponse::error('You do not have permission to perform this action.', 403);
    }
}
