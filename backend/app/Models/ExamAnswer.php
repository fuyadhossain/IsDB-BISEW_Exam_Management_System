<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class ExamAnswer extends Model { protected $table='exam_answers'; protected $guarded=[]; protected $casts=['selected_options'=>'array','answered_at'=>'datetime']; public function attempt(){return $this->belongsTo(StudentExamAttempt::class,'attempt_id');} public function attemptQuestion(){return $this->belongsTo(ExamAttemptQuestion::class,'exam_attempt_question_id');} }
