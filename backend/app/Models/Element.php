<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class Element extends Model { protected $guarded=[]; public function competencyUnit(){return $this->belongsTo(CompetencyUnit::class);} public function questions(){return $this->hasMany(Question::class);} }
