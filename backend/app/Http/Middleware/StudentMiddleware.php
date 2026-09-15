<?php
namespace App\Http\Middleware;
use Closure;
use App\Models\User;
use App\Models\Student;
use App\Support\ApiResponse;

class StudentMiddleware {
    public function handle($request, Closure $next) {
        return $request->user() instanceof Student ? $next($request) : ApiResponse::error('Student authentication required.', 403);
    }
}
