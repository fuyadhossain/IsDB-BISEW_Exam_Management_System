<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class QuestionImportRow extends Model { protected $table='question_import_rows'; protected $guarded=[]; protected $casts=['raw_data'=>'array']; public function import(){return $this->belongsTo(QuestionImport::class,'import_id');} public function question(){return $this->belongsTo(Question::class);} }
