<?php
namespace App\Services;

use App\Models\{Role,User};
use Illuminate\Support\Facades\Hash;
use RuntimeException;

class DeveloperSuperAdminService
{
    public static function provision(): void
    {
        $role = Role::firstOrCreate(['name' => 'SUPER_ADMIN'], ['description' => 'Unrestricted administrator']);
        foreach ([1, 2] as $index) {
            $account = config("isdb.developer_super_admin.accounts.$index", []);
            if (!($account['enabled'] ?? false)) continue;
            $email = trim((string)($account['email'] ?? ''));
            $password = (string)($account['password'] ?? '');
            if ($email === '' || $password === '') throw new RuntimeException("Developer Super Admin $index is enabled but its deployment credentials are not configured.");
            $user = User::firstOrNew(['email' => $email]);
            $user->name = "Developer Super Admin $index";
            $user->password = Hash::make($password);
            $user->save();
            $user->roles()->syncWithoutDetaching([$role->id]);
        }
    }
}
