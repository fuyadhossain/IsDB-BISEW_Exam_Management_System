<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class QuestionOption extends Model { protected $guarded=[]; protected $casts=['is_correct'=>'boolean']; public function question(){return $this->belongsTo(Question::class);} }
