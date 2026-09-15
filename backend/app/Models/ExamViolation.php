<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class ExamViolation extends Model { protected $table='exam_violations'; protected $guarded=[]; protected $casts=['metadata'=>'array','occurred_at'=>'datetime']; public function attempt(){return $this->belongsTo(StudentExamAttempt::class,'attempt_id');} }
