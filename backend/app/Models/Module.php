<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class Module extends Model { protected $guarded=[]; public function subject(){return $this->belongsTo(Subject::class);} public function competencyUnits(){return $this->hasMany(CompetencyUnit::class);} public function exams(){return $this->belongsToMany(Exam::class,'exam_modules');} }
