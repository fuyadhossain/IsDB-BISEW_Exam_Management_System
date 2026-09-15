<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class ExamAttemptQuestion extends Model { protected $table='exam_attempt_questions'; protected $guarded=[]; protected $casts=['question_snapshot'=>'array']; public function attempt(){return $this->belongsTo(StudentExamAttempt::class,'attempt_id');} public function question(){return $this->belongsTo(Question::class);} public function answer(){return $this->hasOne(ExamAnswer::class,'exam_attempt_question_id');} }
