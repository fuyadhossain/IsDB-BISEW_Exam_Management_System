<?php
namespace App\Http\Middleware;
use Closure;
use App\Models\User;
use App\Models\Student;
use App\Support\ApiResponse;

class SuperAdminMiddleware { public function handle($request, Closure $next) { $u=$request->user(); return $u instanceof User && $u->isSuperAdmin() ? $next($request) : ApiResponse::error('Super Admin authorization required.',403); } }
