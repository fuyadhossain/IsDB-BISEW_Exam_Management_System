<?php

namespace App\Models;

use Laravel\Sanctum\HasApiTokens;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Notifications\Notifiable;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Support\Facades\Cache;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;
    protected $fillable = ['name', 'email', 'password', 'status', 'last_active_at'];
    protected $hidden = ['password', 'remember_token'];
    protected function casts(): array
    {
        return ['email_verified_at' => 'datetime', 'last_active_at' => 'datetime', 'password' => 'hashed'];
    }
    public function roles()
    {
        return $this->belongsToMany(Role::class, 'user_roles');
    }
    public function courses()
    {
        return $this->belongsToMany(Course::class, 'user_courses')->withPivot(['status', 'assigned_at'])->withTimestamps();
    }
    public function activeCourses()
    {
        return $this->courses()->wherePivot('status', 'ACTIVE');
    }
    public function isDeveloperSuperAdmin(): bool
    {
        $entry = config('isdb.developer_super_admin.accounts.' . $this->developerAccountIndex());
        return is_array($entry) && ($entry['enabled'] ?? false) && filled($entry['email'] ?? null);
    }
    public function developerAccountIndex(): ?int
    {
        $email = strtolower((string)$this->email);
        foreach ([1, 2] as $index) if ($email !== '' && $email === strtolower((string)config("isdb.developer_super_admin.accounts.$index.email"))) return $index;
        return null;
    }
    public function scopeExcludeDeveloperAccounts($query)
    {
        $emails = collect([1, 2])->map(fn($i) => config("isdb.developer_super_admin.accounts.$i.email"))->filter()->values()->all();
        return $emails ? $query->whereNotIn('email', $emails) : $query;
    }

    public function permissionQuery()
    {
        return Permission::query()->whereIn('id', function ($q) {
            $q->select('permission_id')->from('role_permissions')->whereIn('role_id', $this->roles()->select('roles.id'));
        });
    }

    // AdminMiddleware calls isSuperAdmin(), then often PermissionMiddleware
    // (or the controller action itself) calls hasPermission() right after —
    // and every admin API request goes through this at least once. Each of
    // those used to run its own fresh DB query (isSuperAdmin: one query
    // with a subquery on roles; hasPermission: a correlated subquery
    // joining role_permissions AND an internal call to isSuperAdmin, i.e.
    // often 2 extra queries by itself). None of this data changes within a
    // request, and it barely changes across requests either — a user's
    // roles/permissions are only touched by a deliberate admin action
    // (RbacController::assignRole / assignPermissions). Memoizing it here,
    // per-object for the current request and in a short-lived cache across
    // requests, removes several redundant round trips from every single
    // admin page load without ever serving stale data for more than a few
    // minutes (and the two places that change roles/permissions bust this
    // cache immediately anyway).
    private ?bool $isSuperAdminCache = null;
    private ?array $permissionNamesCache = null;

    public function permissionNames()
    {
        if ($this->permissionNamesCache !== null) {
            return collect($this->permissionNamesCache);
        }
        $names = Cache::remember(
            "user:{$this->id}:permission-names",
            300,
            fn() => $this->permissionQuery()->pluck('name')->all()
        );
        $this->permissionNamesCache = $names;
        return collect($names);
    }

    public function hasPermission(string $permission): bool
    {
        return $this->isSuperAdmin() || $this->permissionNames()->contains($permission);
    }

    public function isSuperAdmin(): bool
    {
        if ($this->isSuperAdminCache !== null) {
            return $this->isSuperAdminCache;
        }
        return $this->isSuperAdminCache = Cache::remember(
            "user:{$this->id}:is-super-admin",
            300,
            fn() => $this->roles()->where('name', 'SUPER_ADMIN')->exists()
        );
    }

    /**
     * Bust the cached role/permission lookups for a user immediately, so a
     * deliberate role/permission change (RbacController::assignRole /
     * assignPermissions) takes effect on the user's very next request
     * instead of waiting out the cache window above.
     */
    public static function forgetPermissionCache(int $userId): void
    {
        Cache::forget("user:{$userId}:is-super-admin");
        Cache::forget("user:{$userId}:permission-names");
    }
}
