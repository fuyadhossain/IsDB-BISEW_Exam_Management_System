<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class UserCourse extends Model { protected $table='user_courses'; protected $guarded=[]; protected $casts=['assigned_at'=>'datetime']; public function user(){return $this->belongsTo(User::class);} public function course(){return $this->belongsTo(Course::class);} public function assignedByUser(){return $this->belongsTo(User::class,'assigned_by');} }
