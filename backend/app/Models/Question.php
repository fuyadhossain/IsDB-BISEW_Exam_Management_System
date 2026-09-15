<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class Question extends Model { protected $guarded=[]; protected $casts=['marks'=>'decimal:2']; public function course(){return $this->belongsTo(Course::class);} public function subject(){return $this->belongsTo(Subject::class);} public function module(){return $this->belongsTo(Module::class);} public function competencyUnit(){return $this->belongsTo(CompetencyUnit::class);} public function element(){return $this->belongsTo(Element::class);} public function options(){return $this->hasMany(QuestionOption::class)->orderBy('option_order');} }
