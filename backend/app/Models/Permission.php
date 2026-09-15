<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class Permission extends Model { protected $guarded=[]; public function roles(){return $this->belongsToMany(Role::class,'role_permissions');} }
