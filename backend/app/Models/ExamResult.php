<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class ExamResult extends Model { protected $table='exam_results'; protected $guarded=[]; protected $casts=['total_marks'=>'decimal:2','percentage'=>'decimal:2','processed_at'=>'datetime']; public function attempt(){return $this->belongsTo(StudentExamAttempt::class,'attempt_id');} public function student(){return $this->belongsTo(Student::class);} public function exam(){return $this->belongsTo(Exam::class);} }
