<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class StudentExamAttempt extends Model { protected $table='student_exam_attempts'; protected $guarded=[]; protected $casts=['started_at'=>'datetime','expires_at'=>'datetime','submitted_at'=>'datetime']; public function student(){return $this->belongsTo(Student::class);} public function exam(){return $this->belongsTo(Exam::class);} public function questions(){return $this->hasMany(ExamAttemptQuestion::class,'attempt_id')->orderBy('question_order');} public function answers(){return $this->hasMany(ExamAnswer::class,'attempt_id');} public function result(){return $this->hasOne(ExamResult::class,'attempt_id');} public function violations(){return $this->hasMany(ExamViolation::class,'attempt_id');} public function expired(): bool { return $this->expires_at && now()->gte($this->expires_at); } }
