<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class ExamSet extends Model { protected $guarded=[]; public function batch(){return $this->belongsTo(Batch::class);} public function exams(){return $this->hasMany(Exam::class);} }
