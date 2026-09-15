<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class Role extends Model { protected $guarded=[]; public function users(){return $this->belongsToMany(User::class,'user_roles');} public function permissions(){return $this->belongsToMany(Permission::class,'role_permissions');} }
