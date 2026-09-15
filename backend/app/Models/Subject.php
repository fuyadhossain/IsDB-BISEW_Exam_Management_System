<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class Subject extends Model { protected $guarded=[]; public function course(){return $this->belongsTo(Course::class);} public function modules(){return $this->hasMany(Module::class);} public function exams(){return $this->belongsToMany(Exam::class,'exam_subjects');} }
