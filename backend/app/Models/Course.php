<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class Course extends Model { protected $guarded=[]; public function subjects(){return $this->hasMany(Subject::class);} public function batches(){return $this->hasMany(Batch::class);} public function users(){return $this->belongsToMany(User::class,'user_courses')->withPivot(['status','assigned_at'])->withTimestamps();} public function activeUsers(){return $this->users()->wherePivot('status','ACTIVE');} }
