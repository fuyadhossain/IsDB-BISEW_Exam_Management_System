<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class CompetencyUnit extends Model { protected $guarded=[]; public function module(){return $this->belongsTo(Module::class);} public function course(){return $this->belongsTo(Course::class);} public function elements(){return $this->hasMany(Element::class);} public function exams(){return $this->belongsToMany(Exam::class,'exam_competency_units');} }
